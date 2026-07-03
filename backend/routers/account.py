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
    prior_hours: float = 0
    model_config = {"from_attributes": True}


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    prior_hours: float | None = None


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
    if payload.prior_hours is not None:
        user.prior_hours = max(0, payload.prior_hours)  # nunca negativo
    db.commit()
    db.refresh(user)
    return user
