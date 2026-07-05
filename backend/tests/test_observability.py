"""
Testes da Fase 3 — rate limiting, erros padronizados e observabilidade.

Cobre:
- request_id (header X-Request-ID) em toda resposta
- Shape padronizado de erro {detail, request_id} sem vazar stack
- Handler 500 (testado direto, sem rota real por causa do catch-all do SPA)
- Rate limiting → 429
- /health checa o banco
"""
import asyncio
import json

from starlette.requests import Request

import main


# ── request_id / headers ──────────────────────────────────────────────────────

def test_toda_resposta_tem_request_id(client):
    r = client.get("/health")
    assert r.headers.get("X-Request-ID")


def test_erro_http_tem_shape_padronizado(client):
    """404 (HTTPException) preserva `detail` e inclui `request_id`."""
    r = client.get("/flights/9999")
    assert r.status_code == 404
    body = r.json()
    assert body["detail"] == "Flight not found"
    assert body["request_id"]
    assert r.headers.get("X-Request-ID")


def test_erro_validacao_tem_request_id(client_with_seed):
    """422 (validação) mantém `detail` (lista) e inclui `request_id`."""
    client, _ = client_with_seed
    r = client.get("/flights/?limit=99999999")
    assert r.status_code == 422
    body = r.json()
    assert isinstance(body["detail"], list)
    assert body["request_id"]


# ── Handler 500 (direto — não vaza a exceção interna) ─────────────────────────

def test_handler_500_nao_vaza_e_tem_request_id():
    scope = {"type": "http", "method": "GET", "path": "/x", "headers": [], "query_string": b""}
    req = Request(scope)
    resp = asyncio.new_event_loop().run_until_complete(
        main.unhandled_exception_handler(req, RuntimeError("segredo interno super secreto"))
    )
    assert resp.status_code == 500
    body = json.loads(resp.body)
    assert body["detail"] == "Erro interno do servidor"
    assert body["request_id"]
    assert "segredo interno" not in resp.body.decode()


# ── Rate limiting ─────────────────────────────────────────────────────────────

def test_rate_limit_retorna_429(client, monkeypatch):
    """Com o limitador ligado e teto baixo, o excedente recebe 429 padronizado."""
    monkeypatch.setattr(main.config, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(main, "_RL_MAX", 5)
    main._rl_hits.clear()
    try:
        codes = []
        for i in range(8):
            r = client.post(
                "/aircraft/",
                json={"registration": f"PT-{i:03d}", "model": "Cessna", "category": "SEP"},
            )
            codes.append(r.status_code)
            if r.status_code == 429:
                assert r.json()["request_id"]  # 429 também é padronizado
        assert 429 in codes
    finally:
        main._rl_hits.clear()


def test_health_isento_de_rate_limit(client, monkeypatch):
    """/health nunca é limitado (keep-alive/monitor externo)."""
    monkeypatch.setattr(main.config, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(main, "_RL_MAX", 3)
    main._rl_hits.clear()
    try:
        for _ in range(10):
            assert client.get("/health").status_code == 200
    finally:
        main._rl_hits.clear()
