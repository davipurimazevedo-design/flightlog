from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from database import engine, Base
from routers import flights, aircraft, airports, account, admin
from pathlib import Path
import sqlalchemy as sa
import config

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
        conn.commit()

_migrate()

app = FastAPI(title="Flight Logbook API", version="1.15.1")

# CORS: na nuvem, travar nos domínios de CORS_ORIGINS; vazio (dev/desktop) = libera tudo.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(flights.router)
app.include_router(aircraft.router)
app.include_router(airports.router)
app.include_router(account.router)
app.include_router(admin.router)


@app.get("/health")
def health():
    """Endpoint usado pelo Electron para saber quando o backend está pronto."""
    return {"status": "ok"}

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
