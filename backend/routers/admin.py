"""
Endpoints de administração (só para role=admin).

Combina duas fontes:
- Nosso Postgres: profiles (role/status) + contagem de voos por usuário.
- Supabase Admin API (service_role): last_sign_in_at, deletar usuário, reset de senha.
"""
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel

import config
from database import get_db
from models import Profile, Flight, Aircraft
from auth import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])


class AdminUser(BaseModel):
    id: str
    email: str
    full_name: str | None
    role: str
    status: str
    flight_count: int
    last_sign_in_at: str | None


def _require_service_key():
    if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=503, detail="Admin do Supabase não configurado no servidor")


def _supabase_admin(method: str, path: str, **kwargs) -> httpx.Response:
    """Chamada autenticada à Auth Admin API do Supabase com a service_role key."""
    _require_service_key()
    headers = {
        "apikey": config.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {config.SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }
    url = f"{config.SUPABASE_URL}/auth/v1{path}"
    with httpx.Client(timeout=15) as client:
        return client.request(method, url, headers=headers, **kwargs)


def _last_sign_in_map() -> dict[str, str]:
    """Busca last_sign_in_at de todos os usuários na Auth Admin API do Supabase."""
    try:
        resp = _supabase_admin("GET", "/admin/users", params={"per_page": 1000})
        if resp.status_code != 200:
            return {}
        users = resp.json().get("users", [])
        return {u["id"]: u.get("last_sign_in_at") for u in users}
    except Exception:
        return {}


def _flight_count(db: Session, user_id: str) -> int:
    return db.query(func.count(Flight.id)).filter(Flight.owner_id == user_id).scalar() or 0


def _to_admin_user(p: Profile, db: Session) -> AdminUser:
    """Monta o AdminUser com a contagem de voos real (usado nos retornos de ação)."""
    return AdminUser(
        id=p.id, email=p.email, full_name=p.full_name, role=p.role,
        status=p.status, flight_count=_flight_count(db, p.id), last_sign_in_at=None,
    )


@router.get("/users", response_model=list[AdminUser])
def list_users(db: Session = Depends(get_db), _admin: Profile = Depends(require_admin)):
    profiles = db.query(Profile).order_by(Profile.created_at.asc()).limit(200).all()

    # Contagem de voos por dono, em uma query só.
    counts = dict(
        db.query(Flight.owner_id, func.count(Flight.id)).group_by(Flight.owner_id).all()
    )
    last_sign_in = _last_sign_in_map()

    return [
        AdminUser(
            id=p.id,
            email=p.email,
            full_name=p.full_name,
            role=p.role,
            status=p.status,
            flight_count=counts.get(p.id, 0),
            last_sign_in_at=last_sign_in.get(p.id),
        )
        for p in profiles
    ]


def _get_profile(user_id: str, db: Session) -> Profile:
    profile = db.query(Profile).filter(Profile.id == user_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return profile


@router.post("/users/{user_id}/approve", response_model=AdminUser)
def approve_user(user_id: str, db: Session = Depends(get_db), _admin: Profile = Depends(require_admin)):
    p = _get_profile(user_id, db)
    p.status = "active"
    db.commit()
    return _to_admin_user(p, db)


@router.post("/users/{user_id}/disable", response_model=AdminUser)
def disable_user(user_id: str, db: Session = Depends(get_db), admin: Profile = Depends(require_admin)):
    # `admin` pode ser None quando a auth está desligada (dev) — daí não há "si mesmo".
    if admin and admin.id == user_id:
        raise HTTPException(status_code=400, detail="Você não pode desativar a si mesmo")
    p = _get_profile(user_id, db)
    p.status = "disabled"
    db.commit()
    return _to_admin_user(p, db)


@router.post("/users/{user_id}/promote", response_model=AdminUser)
def promote_user(user_id: str, db: Session = Depends(get_db), _admin: Profile = Depends(require_admin)):
    p = _get_profile(user_id, db)
    p.role = "admin"
    # Promover implica ativar (um admin precisa poder usar o sistema).
    if p.status == "pending":
        p.status = "active"
    db.commit()
    return _to_admin_user(p, db)


@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: str, db: Session = Depends(get_db), _admin: Profile = Depends(require_admin)):
    """Dispara o email de redefinição de senha do Supabase para o usuário."""
    p = _get_profile(user_id, db)
    resp = _supabase_admin("POST", "/recover", json={"email": p.email})
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail="Falha ao enviar email de reset")
    return {"ok": True, "email": p.email}


def purge_account(db: Session, user_id: str) -> None:
    """Remove o usuário no Supabase Auth e cascateia voos/aeronaves/profile no nosso
    banco. Compartilhado entre a exclusão pelo admin e a auto-exclusão (LGPD)."""
    p = _get_profile(user_id, db)

    # 1. Remove o usuário do Supabase Auth (service_role). 404 = já não existe (ok).
    resp = _supabase_admin("DELETE", f"/admin/users/{user_id}")
    if resp.status_code not in (200, 204, 404):
        raise HTTPException(status_code=502, detail="Falha ao remover usuário no Supabase")

    # 2. Cascata: remove voos, aeronaves e o profile dele no nosso banco.
    db.query(Flight).filter(Flight.owner_id == user_id).delete(synchronize_session=False)
    db.query(Aircraft).filter(Aircraft.owner_id == user_id).delete(synchronize_session=False)
    db.delete(p)
    db.commit()


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: str, db: Session = Depends(get_db), admin: Profile = Depends(require_admin)):
    if admin and admin.id == user_id:
        raise HTTPException(status_code=400, detail="Você não pode remover a si mesmo")
    purge_account(db, user_id)
