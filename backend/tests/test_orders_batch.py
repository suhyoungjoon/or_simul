from unittest.mock import MagicMock

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db import Base
from ingestion import orders_batch
from models import Customer, LegacySyncLog


def make_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_run_upserts_orders_and_logs_success():
    db = make_session()
    fake_client = MagicMock()
    fake_client.fetch_orders.return_value = [
        {
            "id": 1,
            "name": "고객A",
            "x": 0.1,
            "y": 0.2,
            "svc": "internet",
            "region": "A",
            "time_window": "morning",
            "vip": False,
            "overdue": False,
        }
    ]

    orders_batch.run(db, client=fake_client, batch_date="2026-06-28")

    customer = db.get(Customer, 1)
    assert customer.source == "batch"

    log = db.query(LegacySyncLog).one()
    assert log.status == "success"
    assert log.records_processed == 1
