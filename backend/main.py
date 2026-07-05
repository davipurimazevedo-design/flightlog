from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session
from database import engine, Base, get_db
from routers import flights, aircraft, airports, account, admin
from pathlib import Path
from collections import defaultdict, deque
import logging
import re
import time
import uuid
import sqlalchemy as sa
import config

log = logging.getLogger("uvicorn.error")


def _app_version() -> str:
    """Versão exibida pela API. Fonte única = frontend/src/version.js (APP_VERSION);
    fallback defensivo caso o arquivo não esteja acessível no deploy."""
    try:
        vjs = Path(__file__).parent.parent / "frontend" / "src" / "version.js"
        m = re.search(r"APP_VERSION\s*=\s*['\"]([^'\"]+)['\"]", vjs.read_text(encoding="utf-8"))
        if m:
            return m.group(1)
    except Exception:
        pass
    return "0.0.0"

Base.metadata.create_all(bind=engine)

# ── Migration: adiciona colunas novas sem apagar dados existentes ─────────────
def _migrate():
    if engine.dialect.name == "postgresql":
        # Troca a UNIQUE global de registration pela composta (owner_id, registration):
        # dois pilotos podem cadastrar o mesmo prefixo. Idempotente.
        with engine.connect() as conn:
            conn.execute(sa.text(
                "ALTER TABLE aircraft DROP CONSTRAINT IF EXISTS aircraft_registration_key"
            ))
            conn.execute(sa.text("""
                DO $$ BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint WHERE conname = 'uq_aircraft_owner_registration'
                    ) THEN
                        ALTER TABLE aircraft
                        ADD CONSTRAINT uq_aircraft_owner_registration UNIQUE (owner_id, registration);
                    END IF;
                END $$;
            """))
            conn.execute(sa.text(
                "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS prior_hours DOUBLE PRECISION DEFAULT 0"
            ))
            conn.execute(sa.text(
                "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS prior_hours_by_year JSON DEFAULT '{}'"
            ))
            # Índice composto p/ a listagem (filtra por dono, ordena por data).
            conn.execute(sa.text(
                "CREATE INDEX IF NOT EXISTS ix_flights_owner_date ON flights (owner_id, date)"
            ))
            conn.commit()
        return
    if engine.dialect.name != "sqlite":
        return
    with engine.connect() as conn:
        flight_cols = {row[1] for row in conn.execute(sa.text("PRAGMA table_info(flights)"))}
        if "source" not in flight_cols:
            conn.execute(sa.text("ALTER TABLE flights ADD COLUMN source TEXT DEFAULT 'app'"))
        if "needs_review" not in flight_cols:
            conn.execute(sa.text("ALTER TABLE flights ADD COLUMN needs_review INTEGER DEFAULT 0"))
        if "owner_id" not in flight_cols:
            conn.execute(sa.text("ALTER TABLE flights ADD COLUMN owner_id TEXT"))

        aircraft_cols = {row[1] for row in conn.execute(sa.text("PRAGMA table_info(aircraft)"))}
        if "owner_id" not in aircraft_cols:
            conn.execute(sa.text("ALTER TABLE aircraft ADD COLUMN owner_id TEXT"))

        profile_cols = {row[1] for row in conn.execute(sa.text("PRAGMA table_info(profiles)"))}
        if profile_cols and "prior_hours" not in profile_cols:
            conn.execute(sa.text("ALTER TABLE profiles ADD COLUMN prior_hours REAL DEFAULT 0"))
        if profile_cols and "prior_hours_by_year" not in profile_cols:
            conn.execute(sa.text("ALTER TABLE profiles ADD COLUMN prior_hours_by_year JSON DEFAULT '{}'"))
        conn.execute(sa.text(
            "CREATE INDEX IF NOT EXISTS ix_flights_owner_date ON flights (owner_id, date)"
        ))
        conn.commit()

_migrate()

# Guardrail: em produção, não sobe sem auth/CORS (evita vazamento entre usuários).
config.validate_production_config()


def _init_sentry():
    """Observabilidade opcional: só liga com SENTRY_DSN setado e sentry-sdk instalado.
    Nunca derruba o boot — falha vira warning."""
    if not config.SENTRY_DSN:
        return
    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=config.SENTRY_DSN,
            environment=config.ENVIRONMENT,
            release=_app_version(),
            traces_sample_rate=0.1,
        )
        log.info("Sentry inicializado.")
    except Exception as e:  # ImportError ou DSN inválido
        log.warning(f"SENTRY_DSN setado mas não consegui iniciar o Sentry: {e}")


_init_sentry()

# ── Rate limiting simples (in-memory, janela deslizante por IP) ───────────────
# Escolha consciente: em vez de dependência externa (slowapi) + middleware com
# ordenação delicada, um limitador próprio — testável e com 429 padronizado.
# Trade-off: estado em memória serve 1 instância (free tier). Multi-instância no
# futuro → mover para Redis. Ativo só em produção (config.RATE_LIMIT_ENABLED).
_RL_WINDOW = 60  # segundos
_RL_MAX = config.RATE_LIMIT_MAX
_rl_hits: dict[str, deque] = defaultdict(deque)


def _rate_limited(ip: str) -> bool:
    now = time.monotonic()
    dq = _rl_hits[ip]
    while dq and dq[0] <= now - _RL_WINDOW:
        dq.popleft()
    if len(dq) >= _RL_MAX:
        return True
    dq.append(now)
    return False


# Em produção, esconde a documentação interativa (não vaza schema/rotas).
_docs_kwargs = (
    {"docs_url": None, "redoc_url": None, "openapi_url": None}
    if config.IS_PRODUCTION else {}
)

app = FastAPI(title="Flight Logbook API", version=_app_version(), **_docs_kwargs)


# ── Tratamento padronizado de erros (JSON com request_id, sem vazar stack) ────
def _error_response(status_code: int, detail, request_id: str, headers=None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"detail": detail, "request_id": request_id},
        headers={**(headers or {}), "X-Request-ID": request_id},
    )


def _req_id(request: Request) -> str:
    return getattr(request.state, "request_id", None) or str(uuid.uuid4())


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # Preserva o `detail` (o frontend depende dele) e adiciona rastreabilidade.
    return _error_response(exc.status_code, exc.detail, _req_id(request), getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # jsonable_encoder sanitiza objetos não-serializáveis (ex.: ValueError em ctx).
    return _error_response(422, jsonable_encoder(exc.errors()), _req_id(request))


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Loga a exceção (com request_id) no servidor, mas NUNCA a devolve ao cliente.
    rid = _req_id(request)
    log.exception(f"[request_id={rid}] Erro não tratado")
    return _error_response(500, "Erro interno do servidor", rid)

# CORS: na nuvem, travar nos domínios de CORS_ORIGINS; vazio (dev/desktop) = libera tudo.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def request_context(request: Request, call_next):
    """Atribui um request_id, aplica rate limiting e injeta headers defensivos."""
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id

    # Rate limiting por IP (só em produção). /health é isento p/ keep-alive/monitor.
    if config.RATE_LIMIT_ENABLED and request.url.path != "/health":
        ip = request.client.host if request.client else "unknown"
        if _rate_limited(ip):
            return _error_response(
                429, "Muitas requisições em pouco tempo. Tente novamente em instantes.", request_id
            )

    response = await call_next(request)

    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    # frame-ancestors reforça o anti-clickjacking; não restringe carregamento de
    # recursos, então é seguro mesmo quando o backend serve o SPA localmente.
    response.headers["Content-Security-Policy"] = "frame-ancestors 'none'"
    # HSTS só faz sentido sob HTTPS (nuvem); em dev/localhost http poderia atrapalhar.
    if config.IS_PRODUCTION:
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


app.include_router(flights.router)
app.include_router(aircraft.router)
app.include_router(airports.router)
app.include_router(account.router)
app.include_router(admin.router)


@app.get("/health")
def health(db: Session = Depends(get_db)):
    """Health check p/ monitor externo (UptimeRobot) e keep-alive. Verifica o DB."""
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse(status_code=503, content={"status": "error", "database": "error"})
    return {"status": "ok", "database": "ok"}

# ── Serve o frontend buildado (React) ────────────────────────────────────────
DIST_DIR = Path(__file__).parent.parent / "frontend" / "dist"

if DIST_DIR.exists():
    # Arquivos estáticos (JS, CSS, imagens)
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    # Qualquer rota não-API devolve o index.html (React Router cuida do resto)
    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        index = DIST_DIR / "index.html"
        return FileResponse(index)
