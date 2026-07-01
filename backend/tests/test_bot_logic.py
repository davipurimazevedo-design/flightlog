"""
Testes das funções puras do bot do Telegram.

Cobre funções que processam dados sem chamar APIs externas:
- missing_fields()        : detecta campos obrigatórios ausentes
- ask_for_field()         : monta pergunta amigável para cada campo
- _build_flight_payload() : converte dict de dados → payload JSON (inclui lógica de meia-noite)
- format_flight_summary() : formata resumo legível do voo
- is_allowed()            : whitelist de user_ids

O import do bot.py usa o mesmo padrão de test_bot_matching.py —
load_dotenv() em bot.py acha o .env em telegram-bot/ automaticamente.
"""
import sys
import os
import importlib
import unittest.mock
from datetime import datetime

# Adiciona telegram-bot/ ao path para importar bot.py
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'telegram-bot'))

import bot

# ── Dados de teste compartilhados ─────────────────────────────────────────────

FULL_DATA = {
    "aeronave": "AT-54",
    "origem_icao": "SBPA",
    "destino_icao": "SBPF",
    "data": "2026-06-01",
    "decolagem": "10:30",
    "pouso": "11:15",
}

PARTIAL_DATA = {
    "aeronave": "AT-54",
    "origem_icao": "SBPA",
    # faltam: destino_icao, decolagem, pouso
}


# ── missing_fields() ──────────────────────────────────────────────────────────

def test_missing_fields_data_none():
    """Sem dados, todos os campos obrigatórios faltam."""
    result = bot.missing_fields(None)
    assert "aeronave" in result
    assert "origem_icao" in result
    assert "destino_icao" in result
    assert "decolagem" in result
    assert "pouso" in result


def test_missing_fields_dict_vazio():
    """Dict vazio equivale a None — tudo falta."""
    result = bot.missing_fields({})
    assert len(result) == len(bot.REQUIRED_FIELDS)


def test_missing_fields_parcial():
    """Apenas os campos ausentes devem aparecer."""
    result = bot.missing_fields(PARTIAL_DATA)
    assert "aeronave" not in result
    assert "origem_icao" not in result
    assert "destino_icao" in result
    assert "decolagem" in result
    assert "pouso" in result


def test_missing_fields_completo():
    """Dados completos → lista vazia."""
    assert bot.missing_fields(FULL_DATA) == []


def test_missing_fields_valor_none_conta_como_ausente():
    """Campo presente mas com valor None deve ser tratado como faltando."""
    data = {**FULL_DATA, "destino_icao": None}
    result = bot.missing_fields(data)
    assert "destino_icao" in result


# ── ask_for_field() ───────────────────────────────────────────────────────────

def test_ask_for_field_retorna_string_nao_vazia():
    """Cada campo obrigatório deve ter uma pergunta definida."""
    for field in bot.REQUIRED_FIELDS:
        pergunta = bot.ask_for_field(field)
        assert isinstance(pergunta, str)
        assert len(pergunta) > 0, f"Pergunta vazia para campo: {field}"


def test_ask_for_field_aeronave_menciona_aeronave():
    pergunta = bot.ask_for_field("aeronave").lower()
    assert "aeronave" in pergunta or "registro" in pergunta or "prefixo" in pergunta


def test_ask_for_field_origem_menciona_aeroporto():
    pergunta = bot.ask_for_field("origem_icao").lower()
    assert "origem" in pergunta or "aeroporto" in pergunta or "icao" in pergunta or "partiu" in pergunta


def test_ask_for_field_campo_desconhecido_nao_crasha():
    """Campo desconhecido não deve lançar exceção — retorna algo genérico."""
    try:
        resultado = bot.ask_for_field("campo_inventado")
        assert isinstance(resultado, str)
    except Exception as e:
        assert False, f"ask_for_field lançou exceção para campo desconhecido: {e}"


# ── _build_flight_payload() ───────────────────────────────────────────────────

def test_build_payload_campos_basicos():
    """Payload deve conter os campos esperados pelo backend."""
    p = bot._build_flight_payload(FULL_DATA, aircraft_id=5)
    assert p["aircraft_id"] == 5
    assert p["origin_icao"] == "SBPA"
    assert p["destination_icao"] == "SBPF"
    assert "departure_time" in p
    assert "arrival_time" in p


def test_build_payload_source_e_needs_review():
    """Voos via bot devem ter source='telegram' e needs_review=True."""
    p = bot._build_flight_payload(FULL_DATA, aircraft_id=1)
    assert p["source"] == "telegram"
    assert p["needs_review"] is True


def test_build_payload_formato_iso():
    """departure_time e arrival_time devem estar em formato ISO 8601."""
    p = bot._build_flight_payload(FULL_DATA, aircraft_id=1)
    # Deve conter data e hora separadas por T
    assert "T" in p["departure_time"]
    assert "T" in p["arrival_time"]
    # Deve conter a data do voo
    assert "2026-06-01" in p["departure_time"]
    assert "2026-06-01" in p["arrival_time"]


def test_build_payload_horarios_corretos():
    """10:30 decolagem e 11:15 pouso devem aparecer no payload."""
    p = bot._build_flight_payload(FULL_DATA, aircraft_id=1)
    assert "10:30" in p["departure_time"]
    assert "11:15" in p["arrival_time"]


def test_build_payload_voo_noturno_corrige_data_pouso():
    """
    Voo que cruza meia-noite: decolagem 23:00, pouso 01:30.
    O arrival_time deve ser do DIA SEGUINTE (2026-06-02).
    """
    data_noturna = {**FULL_DATA, "decolagem": "23:00", "pouso": "01:30"}
    p = bot._build_flight_payload(data_noturna, aircraft_id=1)
    assert "2026-06-01" in p["departure_time"]
    assert "2026-06-02" in p["arrival_time"], (
        f"Pouso deveria ser no dia 02, mas foi: {p['arrival_time']}"
    )


def test_build_payload_voo_noturno_meia_meia_noite_exata():
    """Decolagem 22:00 e pouso 00:00 também deve avançar um dia."""
    data_noturna = {**FULL_DATA, "decolagem": "22:00", "pouso": "00:00"}
    p = bot._build_flight_payload(data_noturna, aircraft_id=1)
    assert "2026-06-02" in p["arrival_time"]


def test_build_payload_sem_campo_data_usa_hoje():
    """
    Regressão: 'data' NÃO está em REQUIRED_FIELDS, então pode chegar ausente.
    Antes isso quebrava com KeyError; agora deve assumir a data de hoje.
    """
    sem_data = {k: v for k, v in FULL_DATA.items() if k != "data"}
    p = bot._build_flight_payload(sem_data, aircraft_id=1)
    hoje = datetime.now().strftime("%Y-%m-%d")
    assert hoje in p["departure_time"]
    assert hoje in p["arrival_time"]


def test_build_payload_data_none_usa_hoje():
    """Campo 'data' presente mas None também não pode quebrar."""
    p = bot._build_flight_payload({**FULL_DATA, "data": None}, aircraft_id=1)
    hoje = datetime.now().strftime("%Y-%m-%d")
    assert hoje in p["departure_time"]


# ── format_flight_summary() ───────────────────────────────────────────────────

def test_format_summary_retorna_string():
    result = bot.format_flight_summary(FULL_DATA, "AT-54")
    assert isinstance(result, str)
    assert len(result) > 0


def test_format_summary_contem_origem_e_destino():
    result = bot.format_flight_summary(FULL_DATA, "AT-54")
    assert "SBPA" in result
    assert "SBPF" in result


def test_format_summary_contem_aeronave():
    result = bot.format_flight_summary(FULL_DATA, "AT-54")
    assert "AT-54" in result


def test_format_summary_contem_horarios():
    result = bot.format_flight_summary(FULL_DATA, "AT-54")
    assert "10:30" in result
    assert "11:15" in result


def test_format_summary_contem_duracao():
    """10:30 → 11:15 = 45 minutos."""
    result = bot.format_flight_summary(FULL_DATA, "AT-54")
    # Duração pode aparecer como "0h45" ou "45min" ou "45m" — checa pelo número
    assert "45" in result


def test_format_summary_sem_campo_data_nao_quebra():
    """Regressão: resumo não pode quebrar com KeyError se 'data' faltar."""
    sem_data = {k: v for k, v in FULL_DATA.items() if k != "data"}
    result = bot.format_flight_summary(sem_data, "AT-54")
    assert "AT-54" in result
    assert "45" in result


# ── is_allowed() ─────────────────────────────────────────────────────────────

def test_is_allowed_lista_vazia_permite_todos():
    """ALLOWED_IDS vazio = sem restrição — qualquer usuário é permitido."""
    original = bot.ALLOWED_IDS
    try:
        bot.ALLOWED_IDS = set()
        assert bot.is_allowed(123456) is True
        assert bot.is_allowed(999999) is True
    finally:
        bot.ALLOWED_IDS = original


def test_is_allowed_id_na_lista():
    original = bot.ALLOWED_IDS
    try:
        bot.ALLOWED_IDS = {111, 222, 333}
        assert bot.is_allowed(111) is True
        assert bot.is_allowed(222) is True
    finally:
        bot.ALLOWED_IDS = original


def test_is_allowed_id_fora_da_lista():
    original = bot.ALLOWED_IDS
    try:
        bot.ALLOWED_IDS = {111, 222}
        assert bot.is_allowed(999) is False
    finally:
        bot.ALLOWED_IDS = original
