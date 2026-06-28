from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db import get_db
from models import Customer, Worker

router = APIRouter()


class WorkerOut(BaseModel):
    id: int
    name: str
    x: float | None = None
    y: float | None = None
    color: str | None = None
    can_iptv: bool | None = None
    as_rate: float | None = None
    region: str | None = None

    class Config:
        from_attributes = True


class CustomerOut(BaseModel):
    id: int
    name: str
    x: float | None = None
    y: float | None = None
    svc: str | None = None
    region: str | None = None
    time_window: str | None = None
    vip: bool | None = None
    overdue: bool | None = None

    class Config:
        from_attributes = True


@router.get("/workers", response_model=list[WorkerOut])
def get_workers(db: Session = Depends(get_db)):
    return db.query(Worker).all()


@router.get("/customers", response_model=list[CustomerOut])
def get_customers(db: Session = Depends(get_db)):
    return db.query(Customer).all()
