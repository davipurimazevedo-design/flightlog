from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models import Flight, Airport, Aircraft, Profile
from schemas import FlightCreate, FlightOut, Stats
from auth import require_active
from typing import Optional
from datetime import datetime
from collections import defaultdict
import math

router = APIRouter(prefix="/flights", tags=["flights"])


def _scope(q, owner: Profile | None):
    """Filtra a query por dono quando a auth está ativa; sem escopo em dev/desktop."""
    if owner:
        q = q.filter(Flight.owner_id == owner.id)
    return q


def _duration_seconds_expr(db: Session):
    """
    Expressão SQL portável para (arrival_time - departure_time) em segundos.
    SQLite não tem EXTRACT(EPOCH ...) e Postgres não tem strftime('%s', ...),
    então escolhemos a sintaxe conforme o dialeto da conexão atual.
    """
    if db.bind.dialect.name == "postgresql":
        return func.extract("epoch", Flight.arrival_time - Flight.departure_time)
    # SQLite (e compatíveis)
    return func.strftime("%s", Flight.arrival_time) - func.strftime("%s", Flight.departure_time)


def _validate_times(payload: FlightCreate):
    """Pouso deve ser depois da decolagem. Voos que cruzam meia-noite chegam aqui
    com o arrival_time já no dia seguinte (frontend e bot fazem esse ajuste)."""
    if payload.arrival_time <= payload.departure_time:
        raise HTTPException(
            status_code=400,
            detail="O horário de pouso deve ser depois do horário de decolagem.",
        )


def _apply_filters(q, search, aircraft_id, date_from, date_to):
    """Aplica filtros comuns de busca à query."""
    if search:
        s = search.upper().strip()
        q = q.filter(
            (Flight.origin_icao.ilike(f"%{s}%")) |
            (Flight.destination_icao.ilike(f"%{s}%"))
        )
    if aircraft_id:
        q = q.filter(Flight.aircraft_id == aircraft_id)
    if date_from:
        q = q.filter(Flight.date >= date_from)
    if date_to:
        q = q.filter(Flight.date <= date_to)
    return q


@router.get("/", response_model=list[FlightOut])
def list_flights(
    skip: int = 0,
    limit: int = 20,
    search: Optional[str] = None,
    aircraft_id: Optional[int] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    sort_by: Optional[str] = "date",
    sort_dir: Optional[str] = "desc",
    db: Session = Depends(get_db),
    owner: Profile | None = Depends(require_active),
):
    q = _scope(db.query(Flight), owner)
    q = _apply_filters(q, search, aircraft_id, date_from, date_to)

    # Ordenação
    sort_col = {
        "date": Flight.date,
        "origin": Flight.origin_icao,
        "destination": Flight.destination_icao,
        "departure": Flight.departure_time,
        "arrival": Flight.arrival_time,
    }.get(sort_by, Flight.date)

    # Ordenação primária + decolagem descendente como critério de desempate
    if sort_dir == "asc":
        q = q.order_by(sort_col.asc(), Flight.departure_time.desc())
    else:
        q = q.order_by(sort_col.desc(), Flight.departure_time.desc())

    return q.offset(skip).limit(limit).all()


@router.get("/count")
def count_flights(
    search: Optional[str] = None,
    aircraft_id: Optional[int] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    db: Session = Depends(get_db),
    owner: Profile | None = Depends(require_active),
):
    """Retorna total de voos e soma de minutos — usa COUNT/SUM no banco, sem carregar registros."""
    base_q = _scope(db.query(Flight), owner)
    base_q = _apply_filters(base_q, search, aircraft_id, date_from, date_to)

    # Total de voos via COUNT direto no banco
    total = base_q.with_entities(func.count(Flight.id)).scalar()

    # Soma dos segundos de voo via SUM no banco, convertido para minutos
    seconds_sum = base_q.with_entities(
        func.sum(_duration_seconds_expr(db))
    ).scalar() or 0

    total_minutes = round(seconds_sum / 60)
    return {"total": total, "total_minutes": total_minutes}


@router.get("/stats", response_model=Stats)
def get_stats(db: Session = Depends(get_db), owner: Profile | None = Depends(require_active)):
    """Estatísticas gerais — usa SQL aggregates, sem carregar voos na memória."""
    total_flights = _scope(db.query(func.count(Flight.id)), owner).scalar() or 0

    # Horas de logbooks anteriores (arrasto, por ano) — somam ao total da carreira.
    prior_hours = sum((owner.prior_hours_by_year or {}).values()) if owner else 0

    if total_flights == 0:
        return Stats(total_flights=0, total_block_hours=round(prior_hours, 2), unique_airports=0, unique_aircraft=0)

    # Horas totais via SUM no banco + horas anteriores
    seconds = _scope(db.query(func.sum(_duration_seconds_expr(db))), owner).scalar() or 0
    total_block_hours = round(seconds / 3600 + prior_hours, 2)

    # Aeroportos únicos (origens + destinos)
    origins = {r[0] for r in _scope(db.query(func.distinct(Flight.origin_icao)), owner).all()}
    dests   = {r[0] for r in _scope(db.query(func.distinct(Flight.destination_icao)), owner).all()}
    unique_airports = len(origins | dests)

    # Aeronaves únicas
    unique_aircraft = _scope(db.query(func.count(func.distinct(Flight.aircraft_id))), owner).scalar() or 0

    return Stats(
        total_flights=total_flights,
        total_block_hours=total_block_hours,
        unique_airports=unique_airports,
        unique_aircraft=unique_aircraft,
    )


@router.get("/hours-by-year")
def hours_by_year(db: Session = Depends(get_db), owner: Profile | None = Depends(require_active)):
    """Horas por ano da carreira: voos registrados (logged) + horas anteriores (prior)."""
    rows = _scope(
        db.query(Flight.date, Flight.departure_time, Flight.arrival_time), owner
    ).limit(10000).all()

    logged = defaultdict(float)
    for r in rows:
        logged[r.date.year] += (r.arrival_time - r.departure_time).total_seconds() / 3600

    prior = (owner.prior_hours_by_year or {}) if owner else {}
    years = set(logged) | {int(y) for y in prior if str(y).isdigit()}

    result = []
    for y in sorted(years):
        lg = round(logged.get(y, 0), 1)
        pr = round(float(prior.get(str(y), 0)), 1)
        result.append({"year": y, "logged": lg, "prior": pr, "total": round(lg + pr, 1)})
    return result


@router.get("/detailed-stats")
def get_detailed_stats(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
    owner: Profile | None = Depends(require_active),
):
    """Estatísticas detalhadas para a página de análise, com filtro de período."""
    q = _scope(db.query(Flight), owner)
    if date_from:
        q = q.filter(Flight.date >= datetime.fromisoformat(date_from))
    if date_to:
        q = q.filter(Flight.date <= datetime.fromisoformat(date_to))

    # Cap defensivo: análise carrega os voos em memória — 5000 cobre décadas de carreira
    flights = q.order_by(Flight.date).limit(5000).all()

    if not flights:
        return {
            "summary": {"total_flights": 0, "total_hours": 0.0, "longest_flight": None, "top_route": None},
            "hours_by_month": [],
            "top_airports": [],
            "hours_by_aircraft": [],
        }

    # -- horas de bloco por voo --
    def block(f): return round((f.arrival_time - f.departure_time).total_seconds() / 3600, 2)

    # -- Summary --
    all_hours = [block(f) for f in flights]
    total_hours = round(sum(all_hours), 2)

    longest = max(flights, key=block)
    longest_flight = {
        "route": f"{longest.origin_icao} → {longest.destination_icao}",
        "hours": block(longest),
        "date": longest.date.strftime("%d/%m/%Y"),
    }

    route_counts = defaultdict(int)
    for f in flights:
        route_counts[f"{f.origin_icao} → {f.destination_icao}"] += 1
    top_route_name = max(route_counts, key=route_counts.get)
    top_route = {"route": top_route_name, "count": route_counts[top_route_name]}

    # -- Horas por mês --
    month_hours = defaultdict(float)
    for f, h in zip(flights, all_hours):
        key = f.date.strftime("%Y-%m")
        month_hours[key] = round(month_hours[key] + h, 2)
    hours_by_month = [
        {"month": k, "label": datetime.strptime(k, "%Y-%m").strftime("%b/%y"), "hours": v}
        for k, v in sorted(month_hours.items())
    ]

    # -- Top aeroportos (pousos = destinos de cada voo) --
    airport_counts = defaultdict(int)
    for f in flights:
        airport_counts[f.destination_icao] += 1
    top_airports = [
        {"icao": k, "count": v}
        for k, v in sorted(airport_counts.items(), key=lambda x: x[1], reverse=True)[:8]
    ]

    # -- Total de milhas náuticas --
    icao_set = {f.origin_icao for f in flights} | {f.destination_icao for f in flights}
    airport_map_nm = {
        ap.icao: ap for ap in db.query(Airport).filter(Airport.icao.in_(icao_set)).all()
    }

    def haversine_nm(orig, dest):
        R = 3440.065
        lat1, lon1 = math.radians(orig.latitude), math.radians(orig.longitude)
        lat2, lon2 = math.radians(dest.latitude), math.radians(dest.longitude)
        dlat, dlon = lat2 - lat1, lon2 - lon1
        a = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    total_nm = 0
    for f in flights:
        orig = airport_map_nm.get(f.origin_icao)
        dest = airport_map_nm.get(f.destination_icao)
        if orig and dest and orig.latitude and dest.latitude:
            total_nm += haversine_nm(orig, dest)
    total_nm = round(total_nm)

    # -- Horas por aeronave (carrega todos de uma vez, sem N+1) --
    ac_ids = {f.aircraft_id for f in flights}
    aircraft_map = {
        ac.id: ac for ac in db.query(Aircraft).filter(Aircraft.id.in_(ac_ids)).all()
    }
    aircraft_hours = defaultdict(float)
    aircraft_names = {}
    for f, h in zip(flights, all_hours):
        ac = aircraft_map.get(f.aircraft_id)
        if ac:
            aircraft_hours[ac.registration] = round(aircraft_hours[ac.registration] + h, 2)
            aircraft_names[ac.registration] = ac.model
    hours_by_aircraft = [
        {"registration": k, "model": aircraft_names[k], "hours": v}
        for k, v in sorted(aircraft_hours.items(), key=lambda x: x[1], reverse=True)
    ]

    return {
        "summary": {
            "total_flights": len(flights),
            "total_hours": total_hours,
            "total_nm": total_nm,
            "longest_flight": longest_flight,
            "top_route": top_route,
        },
        "hours_by_month": hours_by_month,
        "top_airports": top_airports,
        "hours_by_aircraft": hours_by_aircraft,
    }


@router.get("/map-routes")
def get_map_routes(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
    owner: Profile | None = Depends(require_active),
):
    """Rotas únicas (com coordenadas, aeronaves e horas) para o mapa, filtrável por período."""
    q = _scope(db.query(Flight), owner)
    if date_from:
        q = q.filter(Flight.date >= datetime.fromisoformat(date_from))
    if date_to:
        q = q.filter(Flight.date <= datetime.fromisoformat(date_to))
    flights = q.limit(5000).all()
    if not flights:
        return []

    # Pré-carrega aeroportos e aeronaves sem N+1
    icao_set = {f.origin_icao for f in flights} | {f.destination_icao for f in flights}
    airport_map = {
        ap.icao: ap for ap in db.query(Airport).filter(Airport.icao.in_(icao_set)).all()
    }
    ac_ids = {f.aircraft_id for f in flights}
    aircraft_map = {
        ac.id: ac for ac in db.query(Aircraft).filter(Aircraft.id.in_(ac_ids)).all()
    }

    routes = {}
    for f in flights:
        # Chave normalizada: independente do sentido (menor ICAO sempre primeiro)
        pair = sorted([f.origin_icao, f.destination_icao])
        norm_key = f"{pair[0]}-{pair[1]}"

        if norm_key not in routes:
            ap1 = airport_map.get(pair[0])
            ap2 = airport_map.get(pair[1])
            if not (ap1 and ap2):
                continue
            routes[norm_key] = {
                "origin":      {"icao": ap1.icao, "name": ap1.name, "lat": ap1.latitude, "lng": ap1.longitude},
                "destination": {"icao": ap2.icao, "name": ap2.name, "lat": ap2.latitude, "lng": ap2.longitude},
                "directions":  {},   # dados por sentido
            }

        if norm_key not in routes:
            continue

        # Acumula por sentido (ex: "SBCC→SBBR")
        dir_key = f"{f.origin_icao}→{f.destination_icao}"
        if dir_key not in routes[norm_key]["directions"]:
            routes[norm_key]["directions"][dir_key] = {
                "origin_icao":      f.origin_icao,
                "destination_icao": f.destination_icao,
                "count":            0,
                "total_minutes":    0,
                "aircraft":         set(),
            }
        d = routes[norm_key]["directions"][dir_key]
        d["count"] += 1
        d["total_minutes"] += round(
            (f.arrival_time - f.departure_time).total_seconds() / 60
        )
        ac = aircraft_map.get(f.aircraft_id)
        if ac:
            d["aircraft"].add(ac.registration)

    # Converte para lista serializável
    result = []
    for r in routes.values():
        directions = []
        for dk, dv in sorted(r["directions"].items()):
            directions.append({**dv, "aircraft": sorted(dv["aircraft"])})
        total_count   = sum(d["count"] for d in directions)
        total_minutes = sum(d["total_minutes"] for d in directions)
        result.append({
            **r,
            "directions":    directions,
            "count":         total_count,
            "total_minutes": total_minutes,
        })
    return result


@router.get("/pending-review", response_model=list[FlightOut])
def get_pending_review(db: Session = Depends(get_db), owner: Profile | None = Depends(require_active)):
    """Voos registrados via bot que aguardam revisão do usuário."""
    q = _scope(db.query(Flight), owner).filter(Flight.needs_review == True)
    return q.order_by(Flight.created_at.desc()).limit(100).all()


@router.patch("/{flight_id}/mark-reviewed", response_model=FlightOut)
def mark_reviewed(flight_id: int, db: Session = Depends(get_db), owner: Profile | None = Depends(require_active)):
    """Marca um voo como revisado (needs_review=False)."""
    flight = _scope(db.query(Flight), owner).filter(Flight.id == flight_id).first()
    if not flight:
        raise HTTPException(status_code=404, detail="Flight not found")
    flight.needs_review = False
    db.commit()
    db.refresh(flight)
    return flight


@router.get("/{flight_id}", response_model=FlightOut)
def get_flight(flight_id: int, db: Session = Depends(get_db), owner: Profile | None = Depends(require_active)):
    flight = _scope(db.query(Flight), owner).filter(Flight.id == flight_id).first()
    if not flight:
        raise HTTPException(status_code=404, detail="Flight not found")
    return flight


def _validate_refs(payload: FlightCreate, db: Session, owner: Profile | None):
    """Aeroportos são compartilhados; aeronave precisa pertencer ao dono (quando há auth)."""
    if not db.query(Airport).filter(Airport.icao == payload.origin_icao).first():
        raise HTTPException(status_code=404, detail=f"Airport {payload.origin_icao} not found")
    if not db.query(Airport).filter(Airport.icao == payload.destination_icao).first():
        raise HTTPException(status_code=404, detail=f"Airport {payload.destination_icao} not found")
    ac_q = db.query(Aircraft).filter(Aircraft.id == payload.aircraft_id)
    if owner:
        ac_q = ac_q.filter(Aircraft.owner_id == owner.id)
    if not ac_q.first():
        raise HTTPException(status_code=404, detail="Aircraft not found")


@router.post("/", response_model=FlightOut, status_code=201)
def create_flight(payload: FlightCreate, db: Session = Depends(get_db), owner: Profile | None = Depends(require_active)):
    _validate_times(payload)
    _validate_refs(payload, db, owner)
    flight = Flight(**payload.model_dump(), owner_id=owner.id if owner else None)
    db.add(flight)
    db.commit()
    db.refresh(flight)
    return flight


@router.put("/{flight_id}", response_model=FlightOut)
def update_flight(flight_id: int, payload: FlightCreate, db: Session = Depends(get_db), owner: Profile | None = Depends(require_active)):
    flight = _scope(db.query(Flight), owner).filter(Flight.id == flight_id).first()
    if not flight:
        raise HTTPException(status_code=404, detail="Flight not found")
    _validate_times(payload)
    _validate_refs(payload, db, owner)
    for key, value in payload.model_dump().items():
        setattr(flight, key, value)
    db.commit()
    db.refresh(flight)
    return flight


@router.delete("/{flight_id}", status_code=204)
def delete_flight(flight_id: int, db: Session = Depends(get_db), owner: Profile | None = Depends(require_active)):
    flight = _scope(db.query(Flight), owner).filter(Flight.id == flight_id).first()
    if not flight:
        raise HTTPException(status_code=404, detail="Flight not found")
    db.delete(flight)
    db.commit()
