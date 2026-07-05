from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean, ForeignKey, UniqueConstraint, Index, JSON
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base


class Profile(Base):
    """Dados de app do usuário — espelha auth.users do Supabase (id = UUID do Supabase)."""
    __tablename__ = "profiles"

    id = Column(String, primary_key=True)              # = auth.users.id (UUID do Supabase)
    email = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    role = Column(String, default="pilot")             # 'pilot' | 'admin'
    status = Column(String, default="pending")         # 'pending' | 'active' | 'disabled'
    # Horas de logbooks anteriores, por ano: {"2019": 120.5, "2020": 150}. O total
    # (soma dos valores) entra no Dashboard; a distribuição vai pro gráfico por ano.
    prior_hours_by_year = Column(JSON, default=dict)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Aircraft(Base):
    __tablename__ = "aircraft"
    # Matrícula única POR DONO (dois pilotos podem ter o mesmo prefixo cadastrado).
    __table_args__ = (UniqueConstraint("owner_id", "registration", name="uq_aircraft_owner_registration"),)

    id = Column(Integer, primary_key=True, index=True)
    registration = Column(String, nullable=False)               # PR-ABC
    model = Column(String, nullable=False)                      # Cessna 172
    category = Column(String, default="SEP")                   # SEP, MEP, JET, etc.
    # Dono do registro. ON DELETE CASCADE: ao excluir o profile, apaga suas aeronaves
    # (bancos novos). No Postgres existente, a cascata é feita em app por purge_account().
    owner_id = Column(String, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    flights = relationship("Flight", back_populates="aircraft")


class Airport(Base):
    __tablename__ = "airports"

    icao = Column(String(4), primary_key=True)
    iata = Column(String(3), nullable=True)
    name = Column(String, nullable=False)
    city = Column(String, nullable=True)
    country = Column(String, nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)


class Flight(Base):
    __tablename__ = "flights"
    # Índice composto: a listagem principal filtra por dono e ordena por data.
    __table_args__ = (Index("ix_flights_owner_date", "owner_id", "date"),)

    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime, nullable=False)

    origin_icao = Column(String(4), ForeignKey("airports.icao"), nullable=False)
    destination_icao = Column(String(4), ForeignKey("airports.icao"), nullable=False)

    aircraft_id = Column(Integer, ForeignKey("aircraft.id"), nullable=False)

    departure_time = Column(DateTime, nullable=False)   # block out
    arrival_time = Column(DateTime, nullable=False)     # block in
    airborne_time = Column(Float, nullable=True)        # horas em voo (opcional)

    role = Column(String, default="PIC")                # PIC, SIC, Dual, Solo
    flight_rules = Column(String, default="VFR")        # VFR, IFR
    day_night = Column(String, default="DAY")           # DAY, NIGHT, MIXED

    remarks = Column(Text, nullable=True)
    source = Column(String, default="app")          # "app" | "telegram"
    needs_review = Column(Boolean, default=False)   # True quando registrado via bot
    # Dono do voo. ON DELETE CASCADE em bancos novos; no Postgres existente a cascata
    # é feita em app por purge_account(). aircraft_id fica RESTRICT (bloqueio na Fase 1).
    owner_id = Column(String, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    aircraft = relationship("Aircraft", back_populates="flights")
    origin = relationship("Airport", foreign_keys=[origin_icao])
    destination = relationship("Airport", foreign_keys=[destination_icao])
