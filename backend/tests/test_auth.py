"""
Testes da camada de autenticação/isolamento por usuário.

Habilita a auth (que fica desligada por padrão em dev/testes) via monkeypatch do
módulo `config`, gera JWTs HS256 como o Supabase faria, e verifica:
- 401 sem token
- 403 para conta pending/disabled
- isolamento: cada piloto só vê os próprios voos/aeronaves
- /me retorna o perfil
- /admin exige role=admin
"""
import jwt
import pytest

import config
from models import Profile

SECRET = "test-jwt-secret"


@pytest.fixture()
def auth_on(monkeypatch):
    """Liga a auth com um segredo de teste."""
    monkeypatch.setattr(config, "SUPABASE_JWT_SECRET", SECRET)
    monkeypatch.setattr(config, "AUTH_ENABLED", True)
    yield


def token_for(user_id: str, email: str = "x@y.z") -> str:
    return jwt.encode(
        {"sub": user_id, "email": email, "aud": "authenticated"},
        SECRET, algorithm="HS256",
    )


def auth_headers(user_id: str, email: str = "x@y.z") -> dict:
    return {"Authorization": f"Bearer {token_for(user_id, email)}"}


def make_profile(db, user_id, email="x@y.z", role="pilot", status="active"):
    p = Profile(id=user_id, email=email, role=role, status=status)
    db.add(p)
    db.commit()
    return p


# ── Sem token / status ────────────────────────────────────────────────────────

def test_sem_token_retorna_401(auth_on, client):
    assert client.get("/flights/").status_code == 401


def test_conta_pending_retorna_403(auth_on, client, db):
    make_profile(db, "u-pending", status="pending")
    r = client.get("/flights/", headers=auth_headers("u-pending"))
    assert r.status_code == 403


def test_conta_disabled_retorna_403(auth_on, client, db):
    make_profile(db, "u-disabled", status="disabled")
    assert client.get("/flights/", headers=auth_headers("u-disabled")).status_code == 403


# ── Isolamento entre pilotos ──────────────────────────────────────────────────

def test_pilotos_nao_veem_voos_um_do_outro(auth_on, client, db, seed):
    make_profile(db, "piloto-A", email="a@x.z")
    make_profile(db, "piloto-B", email="b@x.z")

    payload = {
        "date": "2026-06-01T10:00:00Z",
        "origin_icao": "SBPA", "destination_icao": "SBPF",
        "aircraft_id": seed["aircraft"].id,
        "departure_time": "2026-06-01T10:30:00Z",
        "arrival_time": "2026-06-01T11:15:00Z",
    }
    # A aeronave do seed não tem dono; para o teste de isolamento de voo,
    # A cria a própria aeronave e um voo com ela.
    ac = client.post("/aircraft/", json={"registration": "PA-AAA", "model": "X", "category": "SEP"},
                     headers=auth_headers("piloto-A")).json()
    payload_a = {**payload, "aircraft_id": ac["id"]}
    r = client.post("/flights/", json=payload_a, headers=auth_headers("piloto-A"))
    assert r.status_code == 201

    # A vê 1 voo; B vê 0
    assert len(client.get("/flights/", headers=auth_headers("piloto-A")).json()) == 1
    assert client.get("/flights/", headers=auth_headers("piloto-B")).json() == []


def test_piloto_nao_usa_aeronave_de_outro(auth_on, client, db):
    make_profile(db, "piloto-A", email="a@x.z")
    make_profile(db, "piloto-B", email="b@x.z")
    ac = client.post("/aircraft/", json={"registration": "PA-BBB", "model": "X", "category": "SEP"},
                     headers=auth_headers("piloto-A")).json()
    # B não enxerga a aeronave de A
    assert client.get("/aircraft/", headers=auth_headers("piloto-B")).json() == []


def test_dois_pilotos_podem_ter_mesma_matricula(auth_on, client, db):
    """A matrícula é única POR DONO — dois pilotos com o mesmo prefixo é permitido."""
    make_profile(db, "piloto-A", email="a@x.z")
    make_profile(db, "piloto-B", email="b@x.z")
    body = {"registration": "AT-54", "model": "X", "category": "MEP"}
    assert client.post("/aircraft/", json=body, headers=auth_headers("piloto-A")).status_code == 201
    assert client.post("/aircraft/", json=body, headers=auth_headers("piloto-B")).status_code == 201
    # Mas o MESMO dono não pode duplicar
    assert client.post("/aircraft/", json=body, headers=auth_headers("piloto-A")).status_code == 400


# ── /me e /admin ──────────────────────────────────────────────────────────────

def test_me_retorna_perfil(auth_on, client, db):
    make_profile(db, "u1", email="me@x.z", role="pilot", status="active")
    r = client.get("/me", headers=auth_headers("u1", "me@x.z"))
    assert r.status_code == 200
    assert r.json()["email"] == "me@x.z"
    assert r.json()["role"] == "pilot"


def test_novo_usuario_nasce_pending(auth_on, client):
    """Sem profile prévio, o primeiro acesso cria como pending."""
    r = client.get("/me", headers=auth_headers("u-novo", "novo@x.z"))
    assert r.status_code == 200
    assert r.json()["status"] == "pending"


def test_admin_bloqueia_piloto_comum(auth_on, client, db):
    make_profile(db, "comum", role="pilot", status="active")
    assert client.get("/admin/users", headers=auth_headers("comum")).status_code == 403


def test_airports_seed_exige_admin(auth_on, client, db):
    """POST /airports/seed dispara chamadas externas — só admin pode."""
    assert client.post("/airports/seed").status_code == 401  # sem token
    make_profile(db, "comum2", role="pilot", status="active")
    assert client.post("/airports/seed", headers=auth_headers("comum2")).status_code == 403


def test_admin_libera_admin(auth_on, client, db):
    make_profile(db, "chefe", role="admin", status="active")
    r = client.get("/admin/users", headers=auth_headers("chefe"))
    assert r.status_code == 200
    assert any(u["id"] == "chefe" for u in r.json())
