"""
Testes da Fase 2 — guardrails de config e hardening de segurança.

Cobre:
- Escape de CQL_FILTER (airports)
- Security headers nas respostas
- validate_production_config (guard de fail-fast)
- Comportamento em produção: /docs escondido e recusa de subir sem auth
"""
import os
import subprocess
import sys

import pytest

import config
from routers.airports import _cql_escape

BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))


# ── CQL escape ────────────────────────────────────────────────────────────────

def test_cql_escape_dobra_aspa_simples():
    assert _cql_escape("SBPA") == "SBPA"
    assert _cql_escape("O'Hare") == "O''Hare"
    assert _cql_escape("a' OR '1'='1") == "a'' OR ''1''=''1"


# ── Security headers ──────────────────────────────────────────────────────────

def test_security_headers_presentes(client):
    r = client.get("/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert r.headers["Referrer-Policy"] == "no-referrer"
    assert "camera=()" in r.headers["Permissions-Policy"]
    assert r.headers["Content-Security-Policy"] == "frame-ancestors 'none'"
    # HSTS só em produção — em dev/teste não deve aparecer.
    assert "Strict-Transport-Security" not in r.headers


# ── Guard de produção (fail-fast) ─────────────────────────────────────────────

def test_guard_producao_sem_auth_levanta(monkeypatch):
    monkeypatch.setattr(config, "IS_PRODUCTION", True)
    monkeypatch.setattr(config, "AUTH_ENABLED", False)
    monkeypatch.setattr(config, "CORS_ORIGINS", ["https://app.example.com"])
    with pytest.raises(RuntimeError):
        config.validate_production_config()


def test_guard_producao_sem_cors_levanta(monkeypatch):
    monkeypatch.setattr(config, "IS_PRODUCTION", True)
    monkeypatch.setattr(config, "AUTH_ENABLED", True)
    monkeypatch.setattr(config, "CORS_ORIGINS", [])
    with pytest.raises(RuntimeError):
        config.validate_production_config()


def test_guard_producao_ok_nao_levanta(monkeypatch):
    monkeypatch.setattr(config, "IS_PRODUCTION", True)
    monkeypatch.setattr(config, "AUTH_ENABLED", True)
    monkeypatch.setattr(config, "CORS_ORIGINS", ["https://app.example.com"])
    config.validate_production_config()  # não deve levantar


def test_guard_dev_e_noop(monkeypatch):
    monkeypatch.setattr(config, "IS_PRODUCTION", False)
    monkeypatch.setattr(config, "AUTH_ENABLED", False)
    monkeypatch.setattr(config, "CORS_ORIGINS", [])
    config.validate_production_config()  # no-op em dev, mesmo sem auth/CORS


# ── Comportamento real em produção (subprocesso, sem tocar no banco real) ──────

def _import_main(env_extra, tmp_path):
    """Importa o app em um processo novo com env controlada; DB sqlite temporário."""
    env = dict(os.environ)
    env.update(env_extra)
    env["DATABASE_URL"] = f"sqlite:///{tmp_path / 'guard_test.db'}"
    code = "import main; print('DOCS', main.app.docs_url, main.app.openapi_url)"
    return subprocess.run(
        [sys.executable, "-c", code],
        cwd=BACKEND_DIR, env=env, capture_output=True, text=True,
    )


def test_producao_esconde_docs(tmp_path):
    r = _import_main(
        {
            "ENVIRONMENT": "production",
            "SUPABASE_URL": "https://demo.supabase.co",
            "CORS_ORIGINS": "https://app.example.com",
        },
        tmp_path,
    )
    assert r.returncode == 0, r.stderr
    assert "DOCS None None" in r.stdout


def test_producao_sem_auth_recusa_subir(tmp_path):
    r = _import_main(
        {
            "ENVIRONMENT": "production",
            "SUPABASE_URL": "",
            "CORS_ORIGINS": "https://app.example.com",
        },
        tmp_path,
    )
    assert r.returncode != 0
    assert "Configuração de produção inválida" in (r.stderr + r.stdout)
