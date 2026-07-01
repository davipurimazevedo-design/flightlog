"""
Testes da lógica de matching de aeronaves do bot.

Esses testes cobrem o find_aircraft() — a função mais crítica e propensa a
regressão, já que precisou ser corrigida para resolver "C-98 2709" → "2709".
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'telegram-bot'))

from bot import find_aircraft

FLEET = [
    {"registration": "AT-54"},
    {"registration": "AT-75"},
    {"registration": "2709"},
    {"registration": "PT-ABC"},
]


# ── Casos normais ─────────────────────────────────────────────────────────────

def test_match_exato():
    assert find_aircraft("AT-54", FLEET)["registration"] == "AT-54"


def test_match_case_insensitive():
    assert find_aircraft("at-54", FLEET)["registration"] == "AT-54"


def test_match_substring_parcial():
    """LLM pode enviar texto extra ao redor do registro — deve encontrar mesmo assim."""
    assert find_aircraft("aeronave AT-54 hoje", FLEET)["registration"] == "AT-54"


def test_match_apenas_digitos():
    """
    Caso real que gerou bug: LLM extraiu "C-98 2709" em vez de "2709".
    O matcher por dígitos deve resolver: "2709" == dígitos de "C-98 2709".
    """
    assert find_aircraft("C-98 2709", FLEET)["registration"] == "2709"


def test_match_digitos_direto():
    assert find_aircraft("2709", FLEET)["registration"] == "2709"


def test_match_nao_encontrado_retorna_none():
    assert find_aircraft("XX-999", FLEET) is None


def test_match_none_retorna_none():
    assert find_aircraft(None, FLEET) is None


def test_match_string_vazia_retorna_none():
    assert find_aircraft("", FLEET) is None


def test_match_lista_vazia_retorna_none():
    assert find_aircraft("AT-54", []) is None


# ── Ambiguidade: múltiplos candidatos ────────────────────────────────────────

def test_match_prefere_exato_sobre_substring():
    """Se tem match exato, não deve cair no substring errado."""
    fleet = [{"registration": "AT-5"}, {"registration": "AT-54"}]
    assert find_aircraft("AT-54", fleet)["registration"] == "AT-54"
