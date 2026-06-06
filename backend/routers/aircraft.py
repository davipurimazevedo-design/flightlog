from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Aircraft
from schemas import AircraftCreate, AircraftOut

router = APIRouter(prefix="/aircraft", tags=["aircraft"])


@router.get("/", response_model=list[AircraftOut])
def list_aircraft(db: Session = Depends(get_db)):
    return db.query(Aircraft).order_by(Aircraft.registration).all()


@router.post("/", response_model=AircraftOut, status_code=201)
def create_aircraft(payload: AircraftCreate, db: Session = Depends(get_db)):
    existing = db.query(Aircraft).filter(Aircraft.registration == payload.registration.upper()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Aircraft already registered")
    data = payload.model_dump()
    data['registration'] = data['registration'].upper()
    aircraft = Aircraft(**data)
    db.add(aircraft)
    db.commit()
    db.refresh(aircraft)
    return aircraft


@router.put("/{aircraft_id}", response_model=AircraftOut)
def update_aircraft(aircraft_id: int, payload: AircraftCreate, db: Session = Depends(get_db)):
    aircraft = db.query(Aircraft).filter(Aircraft.id == aircraft_id).first()
    if not aircraft:
        raise HTTPException(status_code=404, detail="Aircraft not found")
    for key, value in payload.model_dump().items():
        setattr(aircraft, key, value)
    db.commit()
    db.refresh(aircraft)
    return aircraft


@router.delete("/{aircraft_id}", status_code=204)
def delete_aircraft(aircraft_id: int, db: Session = Depends(get_db)):
    aircraft = db.query(Aircraft).filter(Aircraft.id == aircraft_id).first()
    if not aircraft:
        raise HTTPException(status_code=404, detail="Aircraft not found")
    db.delete(aircraft)
    db.commit()
