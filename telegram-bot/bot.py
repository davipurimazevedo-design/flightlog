"""
FlightLog Telegram Bot
======================
Registra voos via mensagem de texto ou áudio no Telegram.

Setup:
  1. Crie um bot com o @BotFather no Telegram e copie o token
  2. Crie uma chave gratuita em https://console.groq.com
  3. Copie o arquivo .env.example para .env e preencha as chaves
  4. pip install -r requirements.txt
  5. python bot.py
"""

import os
import json
import logging
import tempfile
import httpx
from datetime import datetime, timezone
from dotenv import load_dotenv
from groq import Groq
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, MessageHandler, CommandHandler, CallbackQueryHandler,
    filters, ContextTypes,
)

load_dotenv()

TELEGRAM_TOKEN   = os.getenv("TELEGRAM_TOKEN")
GROQ_API_KEY     = os.getenv("GROQ_API_KEY")
FLIGHTLOG_URL    = os.getenv("FLIGHTLOG_URL", "http://127.0.0.1:8000")
ALLOWED_USER_IDS = os.getenv("ALLOWED_USER_IDS", "")  # IDs separados por vírgula

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(message)s",
    level=logging.INFO,
)
log = logging.getLogger(__name__)

groq_client = Groq(api_key=GROQ_API_KEY)

# ── Segurança: só o dono do bot pode usar ─────────────────────────────────────
ALLOWED_IDS = set()
if ALLOWED_USER_IDS:
    ALLOWED_IDS = {int(x.strip()) for x in ALLOWED_USER_IDS.split(",") if x.strip()}


def is_allowed(user_id: int) -> bool:
    return not ALLOWED_IDS or user_id in ALLOWED_IDS


# ── Estado de conversa por usuário ────────────────────────────────────────────
# user_id -> {
#   "mode": "clarify" | "correct",
#   "data": {...}            # dados parciais (modo clarify)
#   "missing": [...]         # campos que faltam (modo clarify)
#   "flight_id": int         # voo a corrigir (modo correct)
#   "aircraft_id": int       # aeronave já resolvida (modo correct)
# }
user_state: dict[int, dict] = {}

# Estados "flight:{id}" guardam dados de um voo para edição posterior. Só são
# removidos ao confirmar; quem edita e nunca confirma deixaria lixo acumulando.
# Mantém no máximo os MAX_FLIGHT_STATES mais recentes (dict preserva ordem de inserção).
MAX_FLIGHT_STATES = 50


def _prune_flight_states():
    flight_keys = [k for k in user_state if isinstance(k, str) and k.startswith("flight:")]
    excess = len(flight_keys) - MAX_FLIGHT_STATES
    for k in flight_keys[:excess]:
        user_state.pop(k, None)


FIELD_LABELS = {
    "aeronave":     "a aeronave (ex: AT-54)",
    "origem_icao":  "o aeroporto de origem (nome ou ICAO, ex: Passo Fundo / SBPF)",
    "destino_icao": "o aeroporto de destino (nome ou ICAO)",
    "data":         "a data do voo (ex: hoje, ontem, 05/06/2026)",
    "decolagem":    "o horário de decolagem em Zulu (ex: 10:30Z)",
    "pouso":        "o horário de pouso em Zulu (ex: 11:15Z)",
}

REQUIRED_FIELDS = ["aeronave", "origem_icao", "destino_icao", "decolagem", "pouso"]


def find_aircraft(query: str | None, aircraft_list: list[dict]) -> dict | None:
    """Encontra a aeronave na lista mesmo com ruído (ex: 'C-98 2709' → '2709')."""
    if not query:
        return None
    import re
    q = query.upper().strip()
    q_digits = re.sub(r"\D", "", q)

    # 1. Igualdade exata
    for a in aircraft_list:
        if a["registration"].upper() == q:
            return a
    # 2. Substring em qualquer direção (ex: 'C-98 2709' contém '2709')
    for a in aircraft_list:
        reg = a["registration"].upper()
        if reg and (reg in q or q in reg):
            return a
    # 3. Compara só os dígitos (ex: '2709' == dígitos de 'AT-2709')
    if q_digits:
        for a in aircraft_list:
            reg_digits = re.sub(r"\D", "", a["registration"].upper())
            if reg_digits and reg_digits == q_digits:
                return a
    return None


def missing_fields(data: dict | None) -> list[str]:
    if not data:
        return list(REQUIRED_FIELDS)
    return [k for k in REQUIRED_FIELDS if not data.get(k)]


def ask_for_field(field: str) -> str:
    return f"❓ Não entendi {FIELD_LABELS.get(field, field)}. Pode me dizer?"


# ── Transcrever áudio com Groq Whisper ────────────────────────────────────────
async def transcribe_audio(file_bytes: bytes, filename: str = "audio.ogg") -> str:
    with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        with open(tmp_path, "rb") as f:
            transcription = groq_client.audio.transcriptions.create(
                file=(filename, f, "audio/ogg"),
                model="whisper-large-v3",
                language="pt",
            )
        return transcription.text
    finally:
        os.unlink(tmp_path)


# ── Extrair dados do voo com Groq Llama ──────────────────────────────────────
def extract_flight_data(text: str, aircraft_list: list[dict]) -> dict | None:
    aircraft_registrations = ", ".join(a["registration"] for a in aircraft_list)

    prompt = f"""Você é um assistente de logbook de aviação militar brasileira.
Extraia os dados do voo da mensagem abaixo e retorne APENAS um JSON válido, sem texto adicional.

Aeronaves disponíveis no sistema: {aircraft_registrations}

Mensagem: "{text}"

Retorne este JSON (use null para campos não informados):
{{
  "aeronave": "registro da aeronave (ex: AT-54, C-105)",
  "origem_icao": "código ICAO de 4 letras do aeroporto de origem (ex: SBPF)",
  "destino_icao": "código ICAO de 4 letras do aeroporto de destino (ex: SBPA)",
  "data": "YYYY-MM-DD (use a data de hoje se não informada: {datetime.now().strftime('%Y-%m-%d')})",
  "decolagem": "HH:MM em Zulu/UTC",
  "pouso": "HH:MM em Zulu/UTC"
}}

Regras:
- Códigos ICAO brasileiros começam com SB (ex: SBPA=Porto Alegre, SBPF=Passo Fundo, SBGR=Guarulhos)
- Horários são sempre em Zulu (UTC)
- Se o usuário disser "local" converta para Zulu (Brasil = UTC-3 normalmente)
- Retorne APENAS o JSON, sem explicação"""

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=300,
        )
    except Exception as e:
        # Falha de rede / API indisponível — não deixa a exceção subir e travar o handler
        log.error(f"Erro ao chamar a IA (Groq): {e}")
        return None

    raw = response.choices[0].message.content.strip()

    # Remove markdown code blocks se presentes
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        log.error(f"JSON inválido do LLM: {raw}")
        return None


# ── Chamar API do FlightLog ───────────────────────────────────────────────────
def get_aircraft_list() -> list[dict]:
    try:
        r = httpx.get(f"{FLIGHTLOG_URL}/aircraft/", timeout=5)
        return r.json()
    except Exception as e:
        log.error(f"Erro ao buscar aeronaves: {e}")
        return []


def get_or_create_airport(icao: str) -> bool:
    """Verifica se o aeroporto existe, tentando auto-seed via API de busca."""
    try:
        r = httpx.get(f"{FLIGHTLOG_URL}/airports/{icao.upper()}", timeout=5)
        if r.status_code == 200:
            return True
        # Tenta buscar e cachear via GeoAISWEB
        r2 = httpx.get(f"{FLIGHTLOG_URL}/airports/lookup/{icao.upper()}", timeout=10)
        return r2.status_code == 200
    except Exception as e:
        log.error(f"Erro ao verificar aeroporto {icao}: {e}")
        return False


def register_flight(data: dict, aircraft_id: int) -> dict | None:
    payload = _build_flight_payload(data, aircraft_id)
    try:
        r = httpx.post(f"{FLIGHTLOG_URL}/flights/", json=payload, timeout=10)
        if r.status_code == 201:
            return r.json()
        log.error(f"Erro ao registrar voo: {r.status_code} — {r.text}")
        return None
    except Exception as e:
        log.error(f"Erro na requisição: {e}")
        return None


def _build_flight_payload(data: dict, aircraft_id: int) -> dict:
    # "data" não é campo obrigatório (REQUIRED_FIELDS) — se a IA não preencher,
    # assume hoje em vez de quebrar com KeyError.
    date_str = data.get("data") or datetime.now().strftime("%Y-%m-%d")
    dep_str  = f"{date_str}T{data['decolagem']}:00Z"
    arr_str  = f"{date_str}T{data['pouso']}:00Z"
    dep_dt = datetime.fromisoformat(dep_str.replace("Z", "+00:00"))
    arr_dt = datetime.fromisoformat(arr_str.replace("Z", "+00:00"))
    if arr_dt <= dep_dt:
        from datetime import timedelta
        arr_dt += timedelta(days=1)
        arr_str = arr_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "date":             dep_str,
        "origin_icao":      data["origem_icao"].upper(),
        "destination_icao": data["destino_icao"].upper(),
        "aircraft_id":      aircraft_id,
        "departure_time":   dep_str,
        "arrival_time":     arr_str,
        "source":           "telegram",
        "needs_review":     True,
    }


def update_flight_api(flight_id: int, data: dict, aircraft_id: int) -> dict | None:
    payload = _build_flight_payload(data, aircraft_id)
    try:
        r = httpx.put(f"{FLIGHTLOG_URL}/flights/{flight_id}", json=payload, timeout=10)
        if r.status_code == 200:
            return r.json()
        log.error(f"Erro ao atualizar voo: {r.status_code} — {r.text}")
        return None
    except Exception as e:
        log.error(f"Erro na requisição de atualização: {e}")
        return None


def mark_reviewed_api(flight_id: int) -> bool:
    try:
        r = httpx.patch(f"{FLIGHTLOG_URL}/flights/{flight_id}/mark-reviewed", timeout=10)
        return r.status_code == 200
    except Exception as e:
        log.error(f"Erro ao marcar voo como revisado: {e}")
        return False


def format_flight_summary(data: dict, aeronave_reg: str) -> str:
    dep = data["decolagem"]
    arr = data["pouso"]
    date_str = data.get("data") or datetime.now().strftime("%Y-%m-%d")
    dep_dt = datetime.strptime(f"{date_str} {dep}", "%Y-%m-%d %H:%M")
    arr_dt = datetime.strptime(f"{date_str} {arr}", "%Y-%m-%d %H:%M")
    if arr_dt <= dep_dt:
        from datetime import timedelta
        arr_dt += timedelta(days=1)
    duration_min = int((arr_dt - dep_dt).total_seconds() / 60)
    hh, mm = duration_min // 60, duration_min % 60
    date_br = datetime.strptime(date_str, "%Y-%m-%d").strftime("%d/%m/%Y")
    return (
        f"✈️ {aeronave_reg}  •  {data['origem_icao'].upper()} → {data['destino_icao'].upper()}\n"
        f"🕐 {dep}Z – {arr}Z  ({hh}h{mm:02d}min)\n"
        f"📅 {date_br}"
    )


# ── Handlers do Telegram ──────────────────────────────────────────────────────
async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update.effective_user.id):
        return
    await update.message.reply_text(
        "✈️ *FlightLog Bot*\n\n"
        "Me mande uma mensagem de texto ou áudio descrevendo seu voo:\n\n"
        "_Voei o AT-54 de Passo Fundo pra Porto Alegre, "
        "decolei as 10:30Z e pousamos as 11:15Z_\n\n"
        "Vou registrar automaticamente no FlightLog. "
        "Se faltar algum dado eu pergunto, e depois de registrar você pode "
        "✅ confirmar ou ✏️ corrigir direto por aqui — sem precisar abrir o app.",
        parse_mode="Markdown"
    )


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if not is_allowed(user_id):
        return

    text = update.message.text
    state = user_state.get(user_id)

    # Continuação de uma conversa em andamento (esclarecimento ou correção)
    if state and state.get("mode") == "clarify":
        await continue_clarification(update, text, state)
        return
    if state and state.get("mode") == "correct":
        await apply_correction(update, text, state)
        return

    await process_flight_message(update, text)


async def handle_voice(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update.effective_user.id):
        return

    msg = await update.message.reply_text("🎤 Transcrevendo áudio...")

    # Baixa o arquivo de áudio
    voice_file = await update.message.voice.get_file()
    file_bytes = await voice_file.download_as_bytearray()

    try:
        text = await transcribe_audio(bytes(file_bytes))
        log.info(f"Transcrição: {text}")
        await msg.edit_text(f"🎤 _{text}_", parse_mode="Markdown")
    except Exception as e:
        log.error(f"Erro na transcrição: {e}")
        await msg.edit_text("❌ Erro ao transcrever o áudio. Tente enviar como texto.")
        return

    await process_flight_message(update, text)


async def process_flight_message(update: Update, text: str, original_text: str | None = None):
    """Extrai dados do voo; se faltar algo, pergunta; senão registra no FlightLog."""
    user_id = update.effective_user.id
    base_text = original_text if original_text is not None else text
    processing_msg = await update.message.reply_text("⏳ Processando voo...")

    # 1. Busca aeronaves disponíveis
    aircraft_list = get_aircraft_list()
    if not aircraft_list:
        await processing_msg.edit_text(
            "❌ Não consegui conectar ao FlightLog.\n"
            "Verifique se o app está aberto e tente novamente."
        )
        return

    # 2. Extrai dados com IA
    data = extract_flight_data(text, aircraft_list)
    if data is None:
        # Falha total (rede/IA fora ou resposta ilegível) — avisa em vez de travar
        await processing_msg.edit_text(
            "❌ Não consegui processar a mensagem agora.\n"
            "Pode ser instabilidade na conexão com a IA. Tente novamente em instantes."
        )
        return

    # 3. Tratamento de ambiguidade — pergunta pelo que faltar, em vez de desistir
    missing = missing_fields(data)
    if missing:
        user_state[user_id] = {
            "mode": "clarify",
            "data": data or {},
            "missing": missing,
            "text": base_text,
        }
        next_field = missing[0]
        await processing_msg.edit_text(
            f"🤔 Quase lá! {ask_for_field(next_field)}"
        )
        return

    await finish_registration(update, processing_msg, data, aircraft_list, user_id)


async def continue_clarification(update: Update, reply_text: str, state: dict):
    """Recebe a resposta a uma pergunta de esclarecimento e tenta completar os dados."""
    user_id = update.effective_user.id
    msg = await update.message.reply_text("⏳ Entendido, processando...")

    aircraft_list = get_aircraft_list()
    if not aircraft_list:
        await msg.edit_text("❌ Não consegui conectar ao FlightLog. Tente novamente.")
        return

    # Junta o texto original com a resposta e re-extrai, mesclando o que já tínhamos
    combined_text = f"{state['text']}\n{reply_text}"
    fresh = extract_flight_data(combined_text, aircraft_list) or {}
    merged = dict(state.get("data") or {})
    for k, v in fresh.items():
        if v:
            merged[k] = v

    # Se a pergunta era sobre um campo simples (ex: data, horário) e o LLM não
    # capturou, usa a resposta crua como valor para aquele campo.
    asked_field = state["missing"][0]
    if not merged.get(asked_field):
        cleaned = reply_text.strip()
        if asked_field in ("decolagem", "pouso"):
            cleaned = cleaned.upper().replace("H", ":").replace("Z", "").strip()
            if ":" not in cleaned and len(cleaned) == 4 and cleaned.isdigit():
                cleaned = f"{cleaned[:2]}:{cleaned[2:]}"
            merged[asked_field] = cleaned
        elif asked_field == "data":
            low = cleaned.lower()
            if low in ("hoje",):
                merged[asked_field] = datetime.now().strftime("%Y-%m-%d")
            elif low in ("ontem",):
                from datetime import timedelta
                merged[asked_field] = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
            else:
                merged[asked_field] = cleaned
        else:
            merged[asked_field] = cleaned

    still_missing = missing_fields(merged)
    if still_missing:
        user_state[user_id] = {
            "mode": "clarify",
            "data": merged,
            "missing": still_missing,
            "text": combined_text,
        }
        next_field = still_missing[0]
        await msg.edit_text(f"🤔 {ask_for_field(next_field)}")
        return

    user_state.pop(user_id, None)
    await finish_registration(update, msg, merged, aircraft_list, user_id)


async def finish_registration(update, processing_msg, data: dict, aircraft_list: list[dict], user_id: int):
    """Resolve aeronave/aeroportos, registra o voo e envia confirmação com botões inline."""
    # Encontra o aircraft_id
    aeronave_reg = data["aeronave"].upper()
    aircraft = find_aircraft(data["aeronave"], aircraft_list)
    if not aircraft:
        regs = ", ".join(a["registration"] for a in aircraft_list)
        user_state[user_id] = {
            "mode": "clarify",
            "data": {**data, "aeronave": None},
            "missing": ["aeronave"],
            "text": data.get("aeronave", ""),
        }
        await processing_msg.edit_text(
            f"❓ Aeronave *{aeronave_reg}* não encontrada no sistema.\n\n"
            f"Aeronaves cadastradas: {regs}\n\nQual delas foi?",
            parse_mode="Markdown"
        )
        return

    # Verifica aeroportos (auto-seed se necessário)
    for icao in [data["origem_icao"], data["destino_icao"]]:
        if not get_or_create_airport(icao):
            field = "origem_icao" if icao == data["origem_icao"] else "destino_icao"
            user_state[user_id] = {
                "mode": "clarify",
                "data": {**data, field: None},
                "missing": [field],
                "text": icao,
            }
            await processing_msg.edit_text(
                f"❓ Aeroporto *{icao}* não encontrado.\n"
                "Qual o código ICAO correto (4 letras, ex: SBPA)?",
                parse_mode="Markdown"
            )
            return

    # Registra o voo
    flight = register_flight(data, aircraft["id"])
    if not flight:
        await processing_msg.edit_text(
            "❌ Erro ao registrar o voo. Verifique o FlightLog e tente novamente."
        )
        return

    summary = format_flight_summary(data, aeronave_reg)
    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Confirmar", callback_data=f"confirm:{flight['id']}"),
        InlineKeyboardButton("✏️ Editar", callback_data=f"edit:{flight['id']}:{aircraft['id']}"),
    ]])

    await processing_msg.edit_text(
        f"✅ *Voo registrado!*\n\n{summary}\n\n"
        f"_Confirme ou peça pra corrigir direto aqui._",
        parse_mode="Markdown",
        reply_markup=keyboard,
    )

    # Guarda os dados do voo para uma eventual edição via botão
    user_state[f"flight:{flight['id']}"] = {"data": data, "aircraft_id": aircraft["id"]}
    _prune_flight_states()


async def apply_correction(update: Update, reply_text: str, state: dict):
    """Recebe a descrição da correção, re-extrai os dados e atualiza o voo."""
    user_id = update.effective_user.id
    flight_id = state["flight_id"]
    msg = await update.message.reply_text("⏳ Aplicando correção...")

    aircraft_list = get_aircraft_list()
    stored = user_state.get(f"flight:{flight_id}", {})
    base_data = stored.get("data", {})

    fresh = extract_flight_data(reply_text, aircraft_list) or {}
    merged = dict(base_data)
    for k, v in fresh.items():
        if v:
            merged[k] = v

    aircraft = (
        find_aircraft(merged.get("aeronave"), aircraft_list)
        or next((a for a in aircraft_list if a["id"] == stored.get("aircraft_id")), None)
    )

    if not aircraft:
        await msg.edit_text("❌ Não consegui identificar a aeronave. Tente descrever a correção novamente.")
        return

    for icao in [merged.get("origem_icao"), merged.get("destino_icao")]:
        if icao and not get_or_create_airport(icao):
            await msg.edit_text(f"❓ Aeroporto *{icao}* não encontrado. Verifique o ICAO.", parse_mode="Markdown")
            return

    updated = update_flight_api(flight_id, merged, aircraft["id"])
    user_state.pop(user_id, None)
    if not updated:
        await msg.edit_text("❌ Não consegui atualizar o voo. Abra o FlightLog para corrigir manualmente.")
        return

    user_state[f"flight:{flight_id}"] = {"data": merged, "aircraft_id": aircraft["id"]}
    summary = format_flight_summary(merged, aircraft["registration"].upper())
    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Confirmar", callback_data=f"confirm:{flight_id}"),
        InlineKeyboardButton("✏️ Editar", callback_data=f"edit:{flight_id}:{aircraft['id']}"),
    ]])
    await msg.edit_text(
        f"✏️ *Voo atualizado!*\n\n{summary}",
        parse_mode="Markdown",
        reply_markup=keyboard,
    )


async def handle_callback_query(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    user_id = query.from_user.id
    if not is_allowed(user_id):
        await query.answer()
        return

    await query.answer()
    parts = query.data.split(":")
    action = parts[0]

    if action == "confirm":
        flight_id = int(parts[1])
        ok = mark_reviewed_api(flight_id)
        if ok:
            user_state.pop(f"flight:{flight_id}", None)
            try:
                await query.edit_message_reply_markup(reply_markup=None)
            except Exception:
                pass
            await query.message.reply_text("✅ Confirmado! Voo marcado como revisado.")
        else:
            await query.message.reply_text("❌ Não consegui confirmar agora. Tente novamente.")
        return

    if action == "edit":
        flight_id   = int(parts[1])
        aircraft_id = int(parts[2])
        user_state[user_id] = {"mode": "correct", "flight_id": flight_id, "aircraft_id": aircraft_id}
        await query.message.reply_text(
            "✏️ Pode me dizer o que corrigir? (ex: \"a decolagem foi as 11:00Z\" "
            "ou \"na verdade foi pra SBGR\")"
        )
        return


# ── Main ──────────────────────────────────────────────────────────────────────
async def main():
    if not TELEGRAM_TOKEN:
        raise ValueError("TELEGRAM_TOKEN não configurado no .env")
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY não configurado no .env")

    log.info("FlightLog Bot iniciando...")
    log.info(f"Conectando ao FlightLog em: {FLIGHTLOG_URL}")
    if ALLOWED_IDS:
        log.info(f"Acesso restrito aos IDs: {ALLOWED_IDS}")

    app = Application.builder().token(TELEGRAM_TOKEN).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    app.add_handler(MessageHandler(filters.VOICE, handle_voice))
    app.add_handler(CallbackQueryHandler(handle_callback_query))

    log.info("Bot rodando. Pressione Ctrl+C para encerrar.")
    async with app:
        await app.start()
        await app.updater.start_polling(drop_pending_updates=False)

        # Avisa o(s) usuário(s) autorizado(s) que o bot está online
        for uid in ALLOWED_IDS:
            try:
                await app.bot.send_message(
                    chat_id=uid,
                    text="🟢 *FlightLog Bot está online!*\n\nPode mandar texto ou áudio descrevendo seu voo.",
                    parse_mode="Markdown",
                )
            except Exception as e:
                log.error(f"Não consegui enviar aviso de início para {uid}: {e}")

        await asyncio.Event().wait()  # aguarda Ctrl+C


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
