"""
Testes da Fase 4 — LGPD (portabilidade e direito ao esquecimento).

Usa a auth ligada (fixture local, igual test_auth) e mocka a chamada ao Supabase
Admin na auto-exclusão, para não depender de rede.
"""
import types

import jwt
import pytest

import config
import routers.admin as admin_mod
from models import Profile, Aircraft, Flight

SECRET = "test-jwt-secret"


@pytest.fixture()
def auth_on(monkeypatch):
    monkeypatch.setattr(config, "SUPABASE_JWT_SECRET", SECRET)
    monkeypatch.setattr(config, "AUTH_ENABLED", True)
    yield


def _headers(user_id, email="me@x.z"):
    tok = jwt.encode({"sub": user_id, "email": email, "aud": "authenticated"}, SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {tok}"}


def _seed_user_with_data(client, db, user_id="u-lgpd"):
    db.add(Profile(id=user_id, email="me@x.z", role="pilot", status="active"))
    db.commit()
    # 2 aeroportos p/ o voo
    from models import Airport
    db.add_all([
        Airport(icao="SBPA", name="POA", latitude=-30, longitude=-51),
        Airport(icao="SBPF", name="PF", latitude=-28, longitude=-52),
    ])
    db.commit()
    ac = client.post("/aircraft/", json={"registration": "PT-LGP", "model": "Cessna", "category": "SEP"},
                     headers=_headers(user_id)).json()
    client.post("/flights/", json={
        "date": "2026-06-01T10:00:00Z", "origin_icao": "SBPA", "destination_icao": "SBPF",
        "aircraft_id": ac["id"], "departure_time": "2026-06-01T10:30:00Z",
        "arrival_time": "2026-06-01T11:15:00Z",
    }, headers=_headers(user_id))
    return user_id


# ── Portabilidade (export) ────────────────────────────────────────────────────

def test_export_traz_perfil_aeronaves_e_voos(auth_on, client, db):
    uid = _seed_user_with_data(client, db)
    r = client.get("/me/export", headers=_headers(uid))
    assert r.status_code == 200
    data = r.json()
    assert data["profile"]["id"] == uid
    assert data["profile"]["email"] == "me@x.z"
    assert len(data["aircraft"]) == 1 and data["aircraft"][0]["registration"] == "PT-LGP"
    assert len(data["flights"]) == 1 and data["flights"][0]["origin_icao"] == "SBPA"
    assert data["exported_at"]


def test_export_sem_token_401(auth_on, client):
    assert client.get("/me/export").status_code == 401


# ── Direito ao esquecimento (delete) ──────────────────────────────────────────

def test_delete_me_apaga_tudo(auth_on, client, db, monkeypatch):
    # Mocka a chamada ao Supabase Admin (não bater na rede).
    monkeypatch.setattr(admin_mod, "_supabase_admin",
                        lambda *a, **k: types.SimpleNamespace(status_code=204))
    uid = _seed_user_with_data(client, db)

    r = client.delete("/me", headers=_headers(uid))
    assert r.status_code == 204

    # Nada do usuário sobrou no banco.
    assert db.query(Profile).filter(Profile.id == uid).first() is None
    assert db.query(Aircraft).filter(Aircraft.owner_id == uid).count() == 0
    assert db.query(Flight).filter(Flight.owner_id == uid).count() == 0


def test_delete_me_sem_token_401(auth_on, client):
    assert client.delete("/me").status_code == 401


def test_delete_me_falha_no_supabase_retorna_502(auth_on, client, db, monkeypatch):
    """Se o Supabase recusar (ex.: 500), não apagamos os dados e devolvemos 502."""
    monkeypatch.setattr(admin_mod, "_supabase_admin",
                        lambda *a, **k: types.SimpleNamespace(status_code=500))
    uid = _seed_user_with_data(client, db)
    r = client.delete("/me", headers=_headers(uid))
    assert r.status_code == 502
    # Dados preservados (a exclusão não prosseguiu).
    assert db.query(Profile).filter(Profile.id == uid).first() is not None
