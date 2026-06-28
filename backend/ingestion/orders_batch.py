import os
from datetime import date

from db import SessionLocal
from ingestion.sync_log import sync_run
from legacy_client import LegacyClient
from models import Customer

LEGACY_BASE_URL = os.environ.get("LEGACY_BASE_URL", "https://legacy.example.com")


def run(db, client=None, batch_date: str | None = None):
    client = client or LegacyClient(base_url=LEGACY_BASE_URL)
    batch_date = batch_date or date.today().isoformat()

    with sync_run(db, "orders_batch") as ctx:
        orders = client.fetch_orders(batch_date)
        for order in orders:
            db.merge(
                Customer(
                    id=order["id"],
                    name=order["name"],
                    x=order.get("x"),
                    y=order.get("y"),
                    svc=order.get("svc"),
                    region=order.get("region"),
                    time_window=order.get("time_window"),
                    vip=order.get("vip"),
                    overdue=order.get("overdue"),
                    source="batch",
                    batch_date=date.fromisoformat(batch_date),
                )
            )
        db.commit()
        ctx.records = len(orders)


def main():
    db = SessionLocal()
    try:
        run(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
