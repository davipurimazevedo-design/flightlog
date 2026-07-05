from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional


class AircraftCreate(BaseModel):
    registration: str = Field(min_length=1, max_length=20)
    model: str = Field(min_length=1, max_length=60)
    category: str = "SEP"

    @field_validator("registration", "model")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("não pode ser vazio")
        return v


class AircraftOut(AircraftCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class AirportOut(BaseModel):
    icao: str
    iata: Optional[str]
    name: str
    city: Optional[str]
    country: Optional[str]
    latitude: float
    longitude: float

    model_config = {"from_attributes": True}


class FlightCreate(BaseModel):
    date: datetime
    origin_icao: str
    destination_icao: str
    aircraft_id: int
    departure_time: datetime
    arrival_time: datetime
    remarks: Optional[str] = Field(default=None, max_length=2000)
    role: Optional[str] = "PIC"            # PIC | SIC | Dual | Solo
    flight_rules: Optional[str] = "VFR"    # VFR | IFR
    day_night: Optional[str] = "DAY"       # DAY | NIGHT
    source: Optional[str] = "app"
    needs_review: Optional[bool] = False

    # NOTA: origem == destino é PERMITIDO de propósito — voo local (treinamento,
    # tráfego) decola e pousa no mesmo aeródromo. O logbook do Davi tem vários.
    @field_validator("origin_icao", "destination_icao")
    @classmethod
    def upper_icao(cls, v: str) -> str:
        v = v.strip().upper()
        if len(v) != 4 or not v.isalpha():
            raise ValueError("código ICAO deve ter exatamente 4 letras (ex: SBBR)")
        return v


class FlightOut(BaseModel):
    id: int
    date: datetime
    origin_icao: str
    destination_icao: str
    aircraft_id: int
    departure_time: datetime
    arrival_time: datetime
    remarks: Optional[str]
    role: Optional[str]
    flight_rules: Optional[str]
    day_night: Optional[str]
    source: str
    needs_review: bool
    created_at: datetime
    aircraft: AircraftOut

    model_config = {"from_attributes": True}


class Stats(BaseModel):
    total_flights: int
    total_block_hours: float
    unique_airports: int
    unique_aircraft: int
