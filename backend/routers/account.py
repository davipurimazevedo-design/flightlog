"""Endpoints da conta do próprio usuário logado."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models import Profile, Aircraft, Flight
from auth import get_current_user
from routers.admin import purge_account

router = APIRouter(prefix="/me", tags=["account"])


def _iso(dt):
    return dt.isoformat() if dt else None


class ProfileOut(BaseModel):
    id: str
    email: str
    full_name: str | None
    role: str
    status: str
    prior_hours_by_year: dict[str, float] = {}
    model_config = {"from_attributes": True}


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    prior_hours_by_year: dict[str, float] | None = None


@router.get("", response_model=ProfileOut)
def read_me(user: Profile | None = Depends(get_current_user)):
    """Perfil do usuário logado. O frontend usa isso para saber role/status."""
    if user is None:
        # Auth desabilitada (desktop/local) — sem conceito de usuário.
        raise HTTPException(status_code=404, detail="Auth desabilitada")
    return user


@router.patch("", response_model=ProfileOut)
def update_me(payload: ProfileUpdate, db: Session = Depends(get_db), user: Profile | None = Depends(get_current_user)):
    if user is None:
        raise HTTPException(status_code=404, detail="Auth desabilitada")
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.prior_hours_by_year is not None:
        # Sanitiza: só anos plausíveis (1900-2100) e horas >= 0; descarta zeros.
        clean = {}
        for year, hours in payload.prior_hours_by_year.items():
            if str(year).isdigit() and 1900 <= int(year) <= 2100 and hours and hours > 0:
                clean[str(year)] = round(float(hours), 2)
        user.prior_hours_by_year = clean
    db.commit()
    db.refresh(user)
    return user


@router.get("/export")
def export_me(db: Session = Depends(get_db), user: Profile | None = Depends(get_current_user)):
    """LGPD — portabilidade: retorna TODOS os dados do usuário (perfil + aeronaves + voos)."""
    if user is None:
        raise HTTPException(status_code=404, detail="Auth desabilitada")
    aircraft = db.query(Aircraft).filter(Aircraft.owner_id == user.id).order_by(Aircraft.registration).all()
    flights = db.query(Flight).filter(Flight.owner_id == user.id).order_by(Flight.date).all()
    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "profile": {
            "id": user.id, "email": user.email, "full_name": user.full_name,
            "role": user.role, "status": user.status,
            "prior_hours_by_year": user.prior_hours_by_year or {},
            "created_at": _iso(user.created_at),
        },
        "aircraft": [
            {"id": a.id, "registration": a.registration, "model": a.model,
             "category": a.category, "created_at": _iso(a.created_at)}
            for a in aircraft
        ],
        "flights": [
            {"id": f.id, "date": _iso(f.date),
             "origin_icao": f.origin_icao, "destination_icao": f.destination_icao,
             "aircraft_id": f.aircraft_id,
             "departure_time": _iso(f.departure_time), "arrival_time": _iso(f.arrival_time),
             "airborne_time": f.airborne_time,
             "role": f.role, "flight_rules": f.flight_rules, "day_night": f.day_night,
             "remarks": f.remarks, "source": f.source, "needs_review": f.needs_review,
             "created_at": _iso(f.created_at)}
            for f in flights
        ],
    }


@router.delete("", status_code=204)
def delete_me(db: Session = Depends(get_db), user: Profile | None = Depends(get_current_user)):
    """LGPD — direito ao esquecimento: apaga a conta e TODOS os dados do usuário.
    Reusa a cascata testada do admin (Supabase Auth + voos/aeronaves/profile)."""
    if user is None:
        raise HTTPException(status_code=404, detail="Auth desabilitada")
    purge_account(db, user.id)
