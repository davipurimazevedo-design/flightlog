"""
Configuração compartilhada dos testes.

- Usa banco SQLite em memória com StaticPool (todas as conexões compartilham
  o mesmo banco — obrigatório para SQLite :memory: funcionar com FastAPI)
- Cria/destroi tabelas por teste para isolamento total
- Substitui a dependência get_db do FastAPI pela sessão de teste
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from database import Base, get_db
from main import app
from models import Aircraft, Airport

# StaticPool garante que create_all, as sessões do app e a sessão de teste
# todas enxergam o MESMO banco em memória (sem StaticPool, cada conexão
# cria um banco em memória separado e as tabelas "somem").
engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture()
def db():
    """Banco limpo para cada teste: cria as tabelas antes, destrói depois."""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db):
    """TestClient sem dados pré-inseridos. Depende de `db` para ter as tabelas."""
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def seed(db):
    """Insere dados base: 1 aeronave + 2 aeroportos."""
    aircraft = Aircraft(registration="AT-54", model="Piper Seneca", category="MEP")
    airport_poa = Airport(
        icao="SBPA", iata="POA",
        name="Aeroporto Internacional Salgado Filho",
        city="Porto Alegre", country="BR",
        latitude=-29.9944, longitude=-51.1714,
    )
    airport_pfn = Airport(
        icao="SBPF", iata="PFN",
        name="Aeroporto de Passo Fundo",
        city="Passo Fundo", country="BR",
        latitude=-28.2439, longitude=-52.3269,
    )
    db.add_all([aircraft, airport_poa, airport_pfn])
    db.commit()
    db.refresh(aircraft)
    return {"aircraft": aircraft, "origin": airport_poa, "destination": airport_pfn}


@pytest.fixture()
def client_with_seed(seed, db):
    """TestClient com banco já populado (aeronave + aeroportos)."""
    with TestClient(app) as c:
        yield c, seed


@pytest.fixture()
def sample_flight_payload(seed):
    """Payload válido para criar um voo (requer seed)."""
    return {
        "date": "2026-06-01T10:00:00Z",
        "origin_icao": "SBPA",
        "destination_icao": "SBPF",
        "aircraft_id": seed["aircraft"].id,
        "departure_time": "2026-06-01T10:30:00Z",
        "arrival_time": "2026-06-01T11:15:00Z",
        "remarks": "Voo de teste",
        "source": "app",
        "needs_review": False,
    }
