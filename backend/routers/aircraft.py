from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
from models import Aircraft, Flight, Profile
from schemas import AircraftCreate, AircraftOut
from auth import require_active

router = APIRouter(prefix="/aircraft", tags=["aircraft"])


def _scope(q, owner: Profile | None):
    """Restringe a query às aeronaves do dono logado. Sem auth (dev), não filtra."""
    return q.filter(Aircraft.owner_id == owner.id) if owner else q


@router.get("/", response_model=list[AircraftOut])
def list_aircraft(db: Session = Depends(get_db), owner: Profile | None = Depends(require_active)):
    return _scope(db.query(Aircraft), owner).order_by(Aircraft.registration).all()


@router.post("/", response_model=AircraftOut, status_code=201)
def create_aircraft(payload: AircraftCreate, db: Session = Depends(get_db), owner: Profile | None = Depends(require_active)):
    # Duplicidade é checada apenas dentro do escopo do dono.
    dup_q = _scope(db.query(Aircraft).filter(Aircraft.registration == payload.registration.upper()), owner)
    if dup_q.first():
        raise HTTPException(status_code=400, detail="Aircraft already registered")
    data = payload.model_dump()
    data['registration'] = data['registration'].upper()
    aircraft = Aircraft(**data, owner_id=owner.id if owner else None)
    db.add(aircraft)
    db.commit()
    db.refresh(aircraft)
    return aircraft


@router.put("/{aircraft_id}", response_model=AircraftOut)
def update_aircraft(aircraft_id: int, payload: AircraftCreate, db: Session = Depends(get_db), owner: Profile | None = Depends(require_active)):
    aircraft = _scope(db.query(Aircraft).filter(Aircraft.id == aircraft_id), owner).first()
    if not aircraft:
        raise HTTPException(status_code=404, detail="Aircraft not found")
    data = payload.model_dump()
    data['registration'] = data['registration'].upper()
    for key, value in data.items():
        setattr(aircraft, key, value)
    db.commit()
    db.refresh(aircraft)
    return aircraft


@router.delete("/{aircraft_id}", status_code=204)
def delete_aircraft(aircraft_id: int, db: Session = Depends(get_db), owner: Profile | None = Depends(require_active)):
    aircraft = _scope(db.query(Aircraft).filter(Aircraft.id == aircraft_id), owner).first()
    if not aircraft:
        raise HTTPException(status_code=404, detail="Aircraft not found")
    # Preserva o histórico: no Postgres a FK (sem ON DELETE) faria a exclusão
    # estourar 500 quando há voos; aqui recusamos explicitamente com 409 e a
    # contagem, para o usuário excluir/reatribuir os voos antes.
    flight_count = db.query(func.count(Flight.id)).filter(Flight.aircraft_id == aircraft_id).scalar()
    if flight_count:
        raise HTTPException(
            status_code=409,
            detail=f"Esta aeronave tem {flight_count} voo(s) registrado(s). "
                   "Exclua ou reatribua esses voos antes de remover a aeronave.",
        )
    db.delete(aircraft)
    db.commit()
