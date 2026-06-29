from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
from models import Customer, LegacyOrder

router = APIRouter(prefix="/legacy")


@router.get("/orders/{order_id}")
def lookup_order(order_id: int, db: Session = Depends(get_db)):
    order = db.get(LegacyOrder, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="order not found")

    customer = Customer(
        id=order.id,
        name=order.name,
        x=order.x,
        y=order.y,
        svc=order.svc,
        region=order.region,
        time_window=order.time_window,
        vip=order.vip,
        overdue=order.overdue,
        source="ondemand",
    )
    db.merge(customer)
    db.commit()

    return {
        "id": order.id,
        "name": order.name,
        "x": order.x,
        "y": order.y,
        "svc": order.svc,
        "region": order.region,
        "time_window": order.time_window,
        "vip": order.vip,
        "overdue": order.overdue,
    }
