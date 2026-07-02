"""
Importador de voos a partir de planilha Excel (.xlsx / .xls / .csv)

Colunas usadas:
  B = Data       (DD/MM/AAAA)
  D = Origem     (ICAO)
  E = Destino    (ICAO)
  F = Aeronave   (modelo)
  G = Matrícula  (prefixo)
  K = DEP        (HH:MM)
  L = POUSO      (HH:MM)

Uso:
  python importar_voos.py minha_planilha.xlsx
"""

import sys
import sqlite3
from pathlib import Path
from datetime import datetime, timezone

# ── Dependência: openpyxl (para .xlsx) ou csv embutido
try:
    import openpyxl
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False

# ── Caminho do banco de dados
SCRIPT_DIR = Path(__file__).parent
DB_PATH = SCRIPT_DIR / "backend" / "logbook.db"


# ───────────────────────────────────────────────────────────────
def parse_date(val) -> str:
    """Converte DD/MM/AAAA → AAAA-MM-DD."""
    if val is None:
        return None
    s = str(val).strip()
    # Tenta DD/MM/AAAA
    for fmt in ("%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    # Se vier como objeto date/datetime do openpyxl
    if hasattr(val, "strftime"):
        return val.strftime("%Y-%m-%d")
    raise ValueError(f"Não foi possível interpretar a data: {val!r}")


def parse_time(val) -> str:
    """Converte HH:MM (ou variações) para HH:MM."""
    if val is None:
        return "00:00"
    s = str(val).strip()
    # Já é HH:MM ou HH:MM:SS
    if ":" in s:
        return s[:5]
    # HHMM sem separador
    if len(s) == 4 and s.isdigit():
        return f"{s[:2]}:{s[2:]}"
    # openpyxl às vezes retorna fração do dia (float 0.0–1.0)
    try:
        frac = float(s)
        total_min = round(frac * 24 * 60)
        h, m = divmod(total_min, 60)
        return f"{h:02d}:{m:02d}"
    except ValueError:
        pass
    return "00:00"


def cell_val(row, col_index):
    """Retorna o valor de uma célula por índice (0-based)."""
    try:
        v = row[col_index]
        if hasattr(v, "value"):   # célula openpyxl
            return v.value
        return v                  # já é valor puro (csv/lista)
    except IndexError:
        return None


# ───────────────────────────────────────────────────────────────
def load_rows(filepath: Path):
    """Carrega todas as linhas da planilha como listas de valores."""
    suffix = filepath.suffix.lower()

    if suffix in (".xlsx", ".xlsm", ".xls"):
        if not HAS_OPENPYXL:
            print("ERRO: Instale o openpyxl:  pip install openpyxl")
            sys.exit(1)
        wb = openpyxl.load_workbook(filepath, data_only=True)
        ws = wb.active
        return list(ws.iter_rows())          # linhas com objetos Cell

    elif suffix == ".csv":
        import csv
        with open(filepath, encoding="utf-8-sig", newline="") as f:
            reader = csv.reader(f)
            return list(reader)              # linhas como listas de strings

    else:
        print(f"ERRO: Formato nao suportado: {suffix}  (use .xlsx ou .csv)")
        sys.exit(1)


# ───────────────────────────────────────────────────────────────
def clean_registration(val) -> str:
    """Remove .0 de matrículas numéricas e limpa espaços."""
    s = str(val).strip()
    if s.endswith('.0') and s[:-2].isdigit():
        s = s[:-2]
    return s.upper()


def ensure_aircraft(conn, registration: str, model: str, owner_id: str | None = None) -> int:
    """Retorna o ID da aeronave, criando se não existir."""
    reg = registration.upper().strip()
    cur = conn.execute("SELECT id FROM aircraft WHERE registration = ?", (reg,))
    row = cur.fetchone()
    if row:
        return row[0]
    conn.execute(
        "INSERT INTO aircraft (registration, model, category, owner_id, created_at) VALUES (?, ?, 'SEP', ?, ?)",
        (reg, model.strip(), owner_id, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    cur = conn.execute("SELECT id FROM aircraft WHERE registration = ?", (reg,))
    return cur.fetchone()[0]


def ensure_airports(conn, icao: str) -> bool:
    """Retorna True se o aeroporto já existe no cache local."""
    icao = icao.upper().strip()
    cur = conn.execute("SELECT icao FROM airports WHERE icao = ?", (icao,))
    return cur.fetchone() is not None


def insert_airports_placeholder(conn, icao: str):
    """Insere aeroporto com coordenadas zeradas (será enriquecido pelo app depois)."""
    icao = icao.upper().strip()
    conn.execute(
        """INSERT OR IGNORE INTO airports
           (icao, iata, name, city, country, latitude, longitude)
           VALUES (?, NULL, ?, '', 'Brazil', 0.0, 0.0)""",
        (icao, icao),
    )
    conn.commit()


# ───────────────────────────────────────────────────────────────
def merge_rota_flights(conn) -> int:
    """
    Detecta pares de voos onde destino='ROTA' / origem='ROTA' (voo cruzou meia-noite)
    e os mescla em um único voo: origem do primeiro + destino do segundo,
    decolagem do primeiro + pouso do segundo.
    """
    merged = 0

    # Busca todos os voos com destino ROTA
    saidas = conn.execute(
        "SELECT id, origin_icao, departure_time, aircraft_id FROM flights WHERE destination_icao='ROTA' ORDER BY departure_time"
    ).fetchall()

    for (id1, origem, dep_time, aircraft_id) in saidas:
        # Procura o voo seguinte com origem ROTA e mesma aeronave
        chegada = conn.execute(
            """SELECT id, destination_icao, arrival_time FROM flights
               WHERE origin_icao='ROTA' AND aircraft_id=?
               ORDER BY arrival_time LIMIT 1""",
            (aircraft_id,)
        ).fetchone()

        if not chegada:
            print(f"  [ROTA] Voo {id1} ({origem}->ROTA) sem continuacao encontrada, mantido.")
            continue

        id2, destino, arr_time = chegada

        # Mescla: atualiza voo 1 com destino e pouso corretos
        conn.execute(
            "UPDATE flights SET destination_icao=?, arrival_time=? WHERE id=?",
            (destino, arr_time, id1)
        )
        # Remove voo 2 (fragmento ROTA->destino)
        conn.execute("DELETE FROM flights WHERE id=?", (id2,))
        conn.commit()

        merged += 1
        print(f"  [ROTA] Mesclado: {origem} -> {destino} (voos {id1}+{id2} unificados)")

    # Remove aeroporto placeholder ROTA se existir
    conn.execute("DELETE FROM airports WHERE icao='ROTA'")
    conn.commit()

    return merged


# ───────────────────────────────────────────────────────────────
def main():
    # --owner-id <uuid>: atribui os voos/aeronaves a um usuário (multi-usuário).
    # Sem ele, os registros ficam sem dono — ok só em uso local single-user.
    owner_id = None
    if "--owner-id" in sys.argv:
        i = sys.argv.index("--owner-id")
        try:
            owner_id = sys.argv[i + 1]
        except IndexError:
            print("ERRO: --owner-id requer um valor (UUID do usuário)")
            sys.exit(1)
        del sys.argv[i:i + 2]

    if len(sys.argv) < 2:
        print(__doc__)
        print("\nUso:  python importar_voos.py <caminho_da_planilha> [--owner-id <uuid>]")
        sys.exit(0)

    filepath = Path(sys.argv[1])
    if not filepath.exists():
        print(f"ERRO: Arquivo nao encontrado: {filepath}")
        sys.exit(1)

    if not DB_PATH.exists():
        print(f"ERRO: Banco de dados nao encontrado em: {DB_PATH}")
        print("   Certifique-se de ter iniciado o backend ao menos uma vez.")
        sys.exit(1)

    print(f"\nPlanilha : {filepath.name}")
    print(f"Banco    : {DB_PATH}\n")

    rows = load_rows(filepath)

    # Pula linha de cabeçalho
    data_rows = rows[1:]

    conn = sqlite3.connect(DB_PATH)

    ok = 0
    skipped = 0
    errors = []

    for i, row in enumerate(data_rows, start=2):   # linha 2 = primeira de dados

        # Extrai valores pelas colunas (índice 0-based: B=1, D=3, E=4, F=5, G=6, K=10, L=11)
        raw_data       = cell_val(row, 1)   # B
        raw_origem     = cell_val(row, 3)   # D
        raw_destino    = cell_val(row, 4)   # E
        raw_modelo     = cell_val(row, 5)   # F
        raw_matricula  = cell_val(row, 6)   # G
        raw_dep        = cell_val(row, 10)  # K
        raw_pouso      = cell_val(row, 11)  # L

        # Linha em branco?
        if not raw_data and not raw_origem:
            continue

        try:
            date_str = parse_date(raw_data)
            dep_str  = parse_time(raw_dep)
            arr_str  = parse_time(raw_pouso)

            origin_icao = str(raw_origem).upper().strip()
            dest_icao   = str(raw_destino).upper().strip()
            modelo      = str(raw_modelo).strip() if raw_modelo else "Desconhecido"
            matricula   = clean_registration(raw_matricula) if raw_matricula else "N/A"

            # Pula se pouso estiver vazio
            if not raw_pouso:
                print(f"  [--] Linha {i:>4}: pouso vazio, ignorada.")
                skipped += 1
                continue

            # Verifica duplicata
            dup = conn.execute(
                "SELECT id FROM flights WHERE date=? AND origin_icao=? AND destination_icao=? AND departure_time=?",
                (f"{date_str}T00:00:00+00:00", origin_icao, dest_icao, f"{date_str}T{dep_str}:00+00:00")
            ).fetchone()
            if dup:
                print(f"  [DUP] Linha {i:>4}: {date_str}  {origin_icao} -> {dest_icao}  ja existe, ignorada.")
                skipped += 1
                continue

            # Monta ISO UTC: horarios da planilha já estão em Zulu, usa direto
            dep_iso = f"{date_str}T{dep_str}:00+00:00"
            arr_iso = f"{date_str}T{arr_str}:00+00:00"
            dat_iso = f"{date_str}T00:00:00+00:00"

            # Aeronave
            aircraft_id = ensure_aircraft(conn, matricula, modelo, owner_id)

            # Aeroportos (cria placeholder se não existir)
            for icao in (origin_icao, dest_icao):
                if not ensure_airports(conn, icao):
                    insert_airports_placeholder(conn, icao)
                    print(f"  [!] Aeroporto {icao} criado como placeholder (coordenadas serao buscadas pelo app)")

            # Insere voo
            conn.execute(
                """INSERT INTO flights
                   (date, origin_icao, destination_icao, aircraft_id,
                    departure_time, arrival_time, airborne_time,
                    role, flight_rules, day_night, remarks, owner_id, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, NULL, 'PIC', 'VFR', 'DAY', NULL, ?, ?)""",
                (dat_iso, origin_icao, dest_icao, aircraft_id,
                 dep_iso, arr_iso, owner_id,
                 datetime.now(timezone.utc).isoformat()),
            )
            conn.commit()
            ok += 1
            print(f"  [OK] Linha {i:>4}: {date_str}  {origin_icao} -> {dest_icao}  ({matricula})")

        except Exception as e:
            skipped += 1
            errors.append(f"  Linha {i}: {e}")
            print(f"  [ERRO] Linha {i}: {e}")

    # ── Mescla voos com ROTA (voos que cruzam meia-noite) ──────────────────
    merged = merge_rota_flights(conn)

    conn.close()

    print("\n" + "-"*50)
    print(f"Importados : {ok}")
    print(f"Mesclados (ROTA) : {merged}")
    print(f"Com erro   : {skipped}")
    if errors:
        print("\nDetalhes dos erros:")
        for err in errors:
            print(err)
    print("-"*50 + "\n")
    print("Pronto! Abra o app e os voos vao aparecer.")


if __name__ == "__main__":
    main()
