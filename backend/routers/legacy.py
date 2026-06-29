import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
from legacy_client import LegacyClient, LegacyClientError
from models import Customer

router = APIRouter(prefix="/legacy")

LEGACY_BASE_URL = os.environ.get("LEGACY_BASE_URL", "https://legacy.example.com")


@router.get("/orders/{order_id}")
def lookup_order(order_id: int, db: Session = Depends(get_db)):
    client = LegacyClient(base_url=LEGACY_BASE_URL)
    try:
        order = client.fetch_order(order_id)
    except LegacyClientError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if "id" not in order or "name" not in order:
        raise HTTPException(
            status_code=503, detail="legacy response missing required fields"
        )

    customer = Customer(
        id=order["id"],
        name=order["name"],
        x=order.get("x"),
        y=order.get("y"),
        svc=order.get("svc"),
        region=order.get("region"),
        time_window=order.get("time_window"),
        vip=order.get("vip"),
        overdue=order.get("overdue"),
        source="ondemand",
    )
    db.merge(customer)
    db.commit()

    return order
