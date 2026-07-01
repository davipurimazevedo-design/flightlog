"""
Migração ÚNICA: copia aircraft/airports/flights do SQLite local para o Postgres
da nuvem (Supabase), atribuindo owner_id ao dono (resolvido pelo email).

Pré-requisitos:
  - backend/.env com DATABASE_URL apontando para o Postgres do Supabase
  - o dono já ter feito login pelo menos uma vez (para o profile existir)
  - pip install psycopg2-binary

Uso:
  python migrate_to_cloud.py --dry-run      # simula, não grava nada
  python migrate_to_cloud.py                # migra de verdade
  python migrate_to_cloud.py --email outro@x.com
  python migrate_to_cloud.py --force        # migra mesmo se o dono já tiver voos

Regras:
  - airports: compartilhados — só insere os que ainda não existem (por ICAO)
  - aircraft: insere com owner_id; se já existir a mesma matrícula, reusa
  - flights: insere com owner_id e aircraft_id remapeado
"""
import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker

load_dotenv(Path(__file__).parent / ".env")

from models import Base, Aircraft, Airport, Flight, Profile

DEFAULT_EMAIL = "davipurimazevedo@gmail.com"


def main():
    ap = argparse.ArgumentParser(description="Migra o logbook local para a nuvem.")
    ap.add_argument("--email", default=DEFAULT_EMAIL, help="email do dono (default: %(default)s)")
    ap.add_argument("--sqlite", default=str(Path(__file__).parent / "logbook.db"),
                    help="caminho do SQLite de origem")
    ap.add_argument("--dry-run", action="store_true", help="simula sem gravar")
    ap.add_argument("--force", action="store_true", help="migra mesmo se o dono já tiver voos")
    args = ap.parse_args()

    # ── Conexões ──────────────────────────────────────────────────────────────
    dest_url = os.environ.get("DATABASE_URL")
    if not dest_url:
        sys.exit("ERRO: DATABASE_URL não setado. Ponha o Postgres do Supabase em backend/.env")
    if dest_url.startswith("postgres://"):
        dest_url = dest_url.replace("postgres://", "postgresql://", 1)

    src_path = Path(args.sqlite)
    if not src_path.exists():
        sys.exit(f"ERRO: SQLite não encontrado em {src_path}")

    src_engine = create_engine(f"sqlite:///{src_path}")
    dest_engine = create_engine(dest_url, pool_pre_ping=True)
    Base.metadata.create_all(dest_engine)  # garante que as tabelas existem

    src = sessionmaker(bind=src_engine)()
    dest = sessionmaker(bind=dest_engine)()

    # ── Resolve o dono pelo email ─────────────────────────────────────────────
    profile = dest.query(Profile).filter(func.lower(Profile.email) == args.email.lower()).first()
    if not profile:
        sys.exit(
            f"ERRO: nenhum profile com email '{args.email}' na nuvem.\n"
            "Faça login no app pelo menos uma vez para o profile ser criado."
        )
    owner = profile.id
    print(f"Dono: {args.email}  ->  owner_id = {owner}")

    # ── Guarda contra migração dupla ──────────────────────────────────────────
    already = dest.query(func.count(Flight.id)).filter(Flight.owner_id == owner).scalar() or 0
    if already and not args.force:
        sys.exit(f"ERRO: o dono já tem {already} voos na nuvem. Use --force para migrar assim mesmo (pode duplicar).")

    # ── 1) Aeroportos (compartilhados) ────────────────────────────────────────
    dest_icaos = {r[0] for r in dest.query(Airport.icao).all()}
    n_air = 0
    for a in src.query(Airport).all():
        if a.icao not in dest_icaos:
            dest.add(Airport(
                icao=a.icao, iata=a.iata, name=a.name, city=a.city,
                country=a.country, latitude=a.latitude, longitude=a.longitude,
            ))
            dest_icaos.add(a.icao)
            n_air += 1
    dest.flush()

    # ── 2) Aeronaves (com dono; remapeia id antigo -> novo) ───────────────────
    id_map = {}
    n_ac = 0
    for ac in src.query(Aircraft).all():
        existing = dest.query(Aircraft).filter(Aircraft.registration == ac.registration).first()
        if existing:
            id_map[ac.id] = existing.id
            continue
        new = Aircraft(registration=ac.registration, model=ac.model,
                       category=ac.category, owner_id=owner)
        dest.add(new)
        dest.flush()  # obtém new.id
        id_map[ac.id] = new.id
        n_ac += 1

    # ── 3) Voos (com dono e aircraft_id remapeado) ────────────────────────────
    n_fl = 0
    skipped = 0
    for f in src.query(Flight).all():
        new_ac_id = id_map.get(f.aircraft_id)
        if new_ac_id is None:
            skipped += 1
            continue
        dest.add(Flight(
            date=f.date, origin_icao=f.origin_icao, destination_icao=f.destination_icao,
            aircraft_id=new_ac_id,
            departure_time=f.departure_time, arrival_time=f.arrival_time,
            airborne_time=f.airborne_time, role=f.role, flight_rules=f.flight_rules,
            day_night=f.day_night, remarks=f.remarks,
            source=f.source, needs_review=f.needs_review,
            owner_id=owner, created_at=f.created_at,
        ))
        n_fl += 1

    # ── Fecha ─────────────────────────────────────────────────────────────────
    if args.dry_run:
        dest.rollback()
        print(f"[DRY-RUN] Migraria: {n_air} aeroportos novos, {n_ac} aeronaves, {n_fl} voos.")
        if skipped:
            print(f"[DRY-RUN] {skipped} voos seriam pulados (aeronave não encontrada).")
        print("Nada foi gravado.")
    else:
        dest.commit()
        print(f"OK! Migrado: {n_air} aeroportos novos, {n_ac} aeronaves, {n_fl} voos para {args.email}.")
        if skipped:
            print(f"Aviso: {skipped} voos pulados (aeronave não encontrada).")

    src.close()
    dest.close()


if __name__ == "__main__":
    main()
