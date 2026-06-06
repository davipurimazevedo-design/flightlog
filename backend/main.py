from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from database import engine, Base
from routers import flights, aircraft, airports
from pathlib import Path

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Flight Logbook API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # app local — Electron carrega via file://, sem risco de CORS externo
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(flights.router)
app.include_router(aircraft.router)
app.include_router(airports.router)


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
