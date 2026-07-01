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
from jwt import PyJWKClient
from fastapi import Depends, HTTPException, Header
from sqlalchemy.orm import Session

import config
from database import get_db
from models import Profile

# ── Validação de token ────────────────────────────────────────────────────────
# O Supabase migrou para chaves assimétricas (ES256): os tokens novos são
# assinados com uma chave privada e verificados pela chave pública publicada no
# endpoint JWKS. Tokens legados (HS256) ainda existem por até 1h após a rotação,
# então aceitamos os dois algoritmos.
_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    """Cliente JWKS (cacheia as chaves públicas internamente)."""
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(
            f"{config.SUPABASE_URL}/auth/v1/.well-known/jwks.json",
            headers={"apikey": config.SUPABASE_ANON_KEY} if config.SUPABASE_ANON_KEY else None,
        )
    return _jwks_client


def _decode_token(token: str) -> dict:
    """Valida o JWT do Supabase (ES256 via JWKS ou HS256 legado) e retorna o payload."""
    alg = jwt.get_unverified_header(token).get("alg", "")
    if alg == "HS256":
        # Token legado (ou os JWTs de teste) — verifica com o segredo compartilhado.
        return jwt.decode(
            token, config.SUPABASE_JWT_SECRET,
            algorithms=["HS256"], audience="authenticated",
        )
    # Token atual (assimétrico) — pega a chave pública do JWKS pelo `kid` do token.
    signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
    return jwt.decode(
        token, signing_key.key,
        algorithms=["ES256", "RS256"], audience="authenticated",
    )


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
        payload = _decode_token(token)
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
