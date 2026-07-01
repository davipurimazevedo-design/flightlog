from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from pathlib import Path
import sys
import os

# Em produção (PyInstaller), o banco fica em %APPDATA%\FlightLog\ para sobreviver a updates
# Em desenvolvimento, fica na pasta backend/ como antes
def _get_db_path() -> Path:
    if getattr(sys, 'frozen', False):
        # Rodando como executável PyInstaller
        appdata = Path(os.environ.get('APPDATA', Path.home())) / 'FlightLog'
        appdata.mkdir(parents=True, exist_ok=True)
        return appdata / 'logbook.db'
    else:
        # Desenvolvimento normal
        return Path(__file__).parent / 'logbook.db'

# DATABASE_URL na env → Postgres (nuvem). Sem env → SQLite local (dev/desktop).
DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL:
    # Supabase/Render/Heroku às vezes entregam "postgres://"; SQLAlchemy 2.x exige "postgresql://"
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    # pool_pre_ping evita erros de conexão "morta" (comum em Postgres gerenciado)
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
else:
    DB_PATH = _get_db_path()
    DATABASE_URL = f"sqlite:///{DB_PATH}"
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
