"""Testes básicos de sanidade da API."""


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "database": "ok"}


def test_health_head(client):
    # Alguns monitores usam HEAD; deve responder 200 (não 405).
    r = client.head("/health")
    assert r.status_code == 200
