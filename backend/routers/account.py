"""Endpoints da conta do próprio usuário logado."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models import Profile
from auth import get_current_user

router = APIRouter(prefix="/me", tags=["account"])


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
