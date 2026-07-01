"""
Dependências de autenticação/autorização (FastAPI).

Valida o JWT do Supabase (HS256 com o JWT secret do projeto) e resolve o Profile
do usuário. Quando AUTH_ENABLED=False (dev/desktop sem Supabase), todas as
dependências retornam None e os endpoints ficam abertos — preservando o app atual.

Uso nos endpoints:
    owner = Depends(require_active)   # usuário ativo, ou None se auth desabilitada
    admin = Depends(require_admin)    # exige role=admin

    if owner:                         # aplica escopo por dono só quando há auth
        query = query.filter(Model.owner_id == owner.id)
"""
import jwt
from fastapi import Depends, HTTPException, Header
from sqlalchemy.orm import Session

import config
from database import get_db
from models import Profile


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Profile | None:
    """Valida o token e retorna o Profile. None quando auth está desabilitada."""
    if not config.AUTH_ENABLED:
        return None

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Não autenticado")

    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(
            token,
            config.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token sem usuário")

    # Cria o profile na primeira requisição (fallback caso o trigger do Supabase
    # não tenha rodado). Novo usuário nasce 'pending' até o admin aprovar.
    profile = db.query(Profile).filter(Profile.id == user_id).first()
    if not profile:
        profile = Profile(
            id=user_id,
            email=payload.get("email", ""),
            role="pilot",
            status="pending",
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def require_active(user: Profile | None = Depends(get_current_user)) -> Profile | None:
    """Exige conta ativa. None quando auth desabilitada (libera dev/desktop)."""
    if user is None:
        return None
    if user.status != "active":
        # 403 com o motivo estruturado (pending | disabled) para o frontend tratar.
        raise HTTPException(status_code=403, detail={"reason": user.status})
    return user


def require_admin(user: Profile | None = Depends(require_active)) -> Profile | None:
    """Exige role=admin. None quando auth desabilitada."""
    if user is None:
        return None
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores")
    return user
