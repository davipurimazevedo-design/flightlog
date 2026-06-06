from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Optional


class AircraftCreate(BaseModel):
    registration: str
    model: str
    category: str = "SEP"


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
    remarks: Optional[str] = None

    @field_validator("origin_icao", "destination_icao")
    @classmethod
    def upper_icao(cls, v: str) -> str:
        return v.upper()


class FlightOut(BaseModel):
    id: int
    date: datetime
    origin_icao: str
    destination_icao: str
    aircraft_id: int
    departure_time: datetime
    arrival_time: datetime
    remarks: Optional[str]
    created_at: datetime
    aircraft: AircraftOut

    model_config = {"from_attributes": True}


class Stats(BaseModel):
    total_flights: int
    total_block_hours: float
    unique_airports: int
    unique_aircraft: int
