from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Aircraft, Profile
from schemas import AircraftCreate, AircraftOut
from auth import require_active

router = APIRouter(prefix="/aircraft", tags=["aircraft"])


@router.get("/", response_model=list[AircraftOut])
def list_aircraft(db: Session = Depends(get_db), owner: Profile | None = Depends(require_active)):
    q = db.query(Aircraft)
    if owner:
        q = q.filter(Aircraft.owner_id == owner.id)
    return q.order_by(Aircraft.registration).all()


@router.post("/", response_model=AircraftOut, status_code=201)
def create_aircraft(payload: AircraftCreate, db: Session = Depends(get_db), owner: Profile | None = Depends(require_active)):
    # Duplicidade é checada apenas dentro do escopo do dono.
    dup_q = db.query(Aircraft).filter(Aircraft.registration == payload.registration.upper())
    if owner:
        dup_q = dup_q.filter(Aircraft.owner_id == owner.id)
    if dup_q.first():
        raise HTTPException(status_code=400, detail="Aircraft already registered")
    data = payload.model_dump()
    data['registration'] = data['registration'].upper()
    aircraft = Aircraft(**data, owner_id=owner.id if owner else None)
    db.add(aircraft)
    db.commit()
    db.refresh(aircraft)
    return aircraft


@router.put("/{aircraft_id}", response_model=AircraftOut)
def update_aircraft(aircraft_id: int, payload: AircraftCreate, db: Session = Depends(get_db), owner: Profile | None = Depends(require_active)):
    q = db.query(Aircraft).filter(Aircraft.id == aircraft_id)
    if owner:
        q = q.filter(Aircraft.owner_id == owner.id)
    aircraft = q.first()
    if not aircraft:
        raise HTTPException(status_code=404, detail="Aircraft not found")
    data = payload.model_dump()
    data['registration'] = data['registration'].upper()
    for key, value in data.items():
        setattr(aircraft, key, value)
    db.commit()
    db.refresh(aircraft)
    return aircraft


@router.delete("/{aircraft_id}", status_code=204)
def delete_aircraft(aircraft_id: int, db: Session = Depends(get_db), owner: Profile | None = Depends(require_active)):
    q = db.query(Aircraft).filter(Aircraft.id == aircraft_id)
    if owner:
        q = q.filter(Aircraft.owner_id == owner.id)
    aircraft = q.first()
    if not aircraft:
        raise HTTPException(status_code=404, detail="Aircraft not found")
    db.delete(aircraft)
    db.commit()
