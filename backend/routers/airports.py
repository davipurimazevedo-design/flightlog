import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from models import Airport, Profile
from schemas import AirportOut
from auth import require_admin
import httpx

router = APIRouter(prefix="/airports", tags=["airports"])
log = logging.getLogger("uvicorn.error")

# GeoAISWEB WFS — fonte oficial DECEA (sem autenticação)
GEOAISWEB_WFS = "https://geoaisweb.decea.mil.br/geoserver/wfs"


def _cql_escape(s: str) -> str:
    """Escapa string literal para o CQL_FILTER do GeoAISWEB: aspa simples vira '',
    conforme o padrão OGC. Impede que a entrada quebre/injete no filtro externo."""
    return s.replace("'", "''")


async def fetch_from_aisweb(icao: str) -> dict | None:
    """Consulta o GeoAISWEB e retorna dados do aeródromo pelo código ICAO."""
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": "ICA:airport",
        "outputFormat": "application/json",
        "CQL_FILTER": f"localidade_id='{_cql_escape(icao.upper())}'",
    }
    try:
        # verify=False: certificado do geoaisweb.decea.mil.br pode ter problemas de cadeia
        async with httpx.AsyncClient(timeout=15, verify=False) as client:
            resp = await client.get(GEOAISWEB_WFS, params=params)
            resp.raise_for_status()
            data = resp.json()

        features = data.get("features", [])
        if not features:
            return None

        props = features[0]["properties"]
        return {
            "icao": props["localidade_id"],
            "iata": None,  # AISWEB não fornece IATA
            "name": props["nome"],
            "city": props.get("cidade", ""),
            "country": "Brazil",
            "latitude": float(props["latitude_dec"]),
            "longitude": float(props["longitude_dec"]),
        }
    except Exception as e:
        log.warning(f"GeoAISWEB indisponível ao buscar {icao}: {e}")
        return None


async def search_aisweb(q: str, limit: int = 10) -> list[dict]:
    """Busca aeródromos pelo nome ou ICAO no GeoAISWEB (retorna vários resultados)."""
    # Tenta ICAO exato primeiro
    if len(q) == 4:
        result = await fetch_from_aisweb(q)
        if result:
            return [result]

    # Busca por nome (CQL LIKE)
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": "ICA:airport",
        "outputFormat": "application/json",
        "count": limit,
        "CQL_FILTER": (
            f"nome ILIKE '%{_cql_escape(q)}%' OR localidade_id ILIKE '%{_cql_escape(q)}%' "
            f"OR cidade ILIKE '%{_cql_escape(q)}%'"
        ),
    }
    try:
        async with httpx.AsyncClient(timeout=15, verify=False) as client:
            resp = await client.get(GEOAISWEB_WFS, params=params)
            resp.raise_for_status()
            data = resp.json()

        results = []
        for feat in data.get("features", []):
            p = feat["properties"]
            results.append({
                "icao": p["localidade_id"],
                "iata": None,
                "name": p["nome"],
                "city": p.get("cidade", ""),
                "country": "Brazil",
                "latitude": float(p["latitude_dec"]),
                "longitude": float(p["longitude_dec"]),
            })
        return results
    except Exception as e:
        log.warning(f"GeoAISWEB indisponível na busca '{q}': {e}")
        return []


@router.get("/search", response_model=list[AirportOut])
async def search_airports(q: str = Query(min_length=2, max_length=60), db: Session = Depends(get_db)):
    """Busca aeroportos: primeiro no cache local, depois consulta o GeoAISWEB (DECEA)."""
    q_clean = q.upper().strip()

    # 1. Cache local (DB)
    local = db.query(Airport).filter(
        (Airport.icao.ilike(f"%{q_clean}%")) |
        (Airport.name.ilike(f"%{q_clean}%")) |
        (Airport.city.ilike(f"%{q_clean}%"))
    ).limit(10).all()

    if local:
        return local

    # 2. Consulta AISWeb se não achou localmente
    remote = await search_aisweb(q_clean, limit=10)
    if not remote:
        return []

    # Salva no cache local
    saved = []
    for ap in remote:
        existing = db.query(Airport).filter(Airport.icao == ap["icao"]).first()
        if not existing:
            obj = Airport(**ap)
            db.add(obj)
            db.commit()
            db.refresh(obj)
            saved.append(obj)
        else:
            saved.append(existing)

    return saved


@router.get("/lookup/{icao}", response_model=AirportOut)
async def lookup_airport(icao: str, db: Session = Depends(get_db)):
    """Busca um aeródromo pelo ICAO: cache local → GeoAISWEB."""
    icao = icao.upper()

    # Cache local
    airport = db.query(Airport).filter(Airport.icao == icao).first()
    if airport:
        return airport

    # GeoAISWEB
    data = await fetch_from_aisweb(icao)
    if not data:
        raise HTTPException(status_code=404, detail=f"Aeródromo {icao} não encontrado no AISWeb")

    obj = Airport(**data)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/{icao}", response_model=AirportOut)
def get_airport(icao: str, db: Session = Depends(get_db)):
    icao = icao.upper()
    airport = db.query(Airport).filter(Airport.icao == icao).first()
    if not airport:
        raise HTTPException(status_code=404, detail="Airport not found")
    return airport


@router.post("/seed")
async def seed_airports(db: Session = Depends(get_db), _admin: Profile | None = Depends(require_admin)):
    """Busca os principais aeródromos brasileiros diretamente do GeoAISWEB (DECEA) e salva no cache."""
    # Códigos ICAO dos principais aeródromos do Brasil
    icao_list = [
        "SBGR", "SBSP", "SBBR", "SBGL", "SBSV", "SBCF", "SBRF",
        "SBPA", "SBFZ", "SBMN", "SBFL", "SBCY", "SBKP", "SBLO",
        "SBCT", "SBVT", "SBMQ", "SBSL", "SBTE", "SBJU", "SBMO",
        "SBNT", "SBIZ", "SBPV", "SBEG", "SBBE", "SBBH", "SBNF",
        "SBFI", "SBGO",
    ]

    seeded = 0
    failed = []

    for icao in icao_list:
        existing = db.query(Airport).filter(Airport.icao == icao).first()
        if existing:
            # Atualiza coordenadas com dados do AISWeb
            data = await fetch_from_aisweb(icao)
            if data:
                existing.latitude = data["latitude"]
                existing.longitude = data["longitude"]
                existing.name = data["name"]
                existing.city = data["city"]
                db.commit()
            seeded += 1
            continue

        data = await fetch_from_aisweb(icao)
        if data:
            db.add(Airport(**data))
            db.commit()
            seeded += 1
        else:
            failed.append(icao)

    return {
        "seeded": seeded,
        "failed": failed,
        "source": "GeoAISWEB / DECEA",
    }
