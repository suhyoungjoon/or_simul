from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db import Base
from ingestion.sync_log import sync_run
from models import LegacySyncLog


def make_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_sync_run_records_success():
    db = make_session()
    with sync_run(db, "orders_batch") as ctx:
        ctx.records = 5

    log = db.query(LegacySyncLog).one()
    assert log.status == "success"
    assert log.records_processed == 5
    assert log.finished_at is not None


def test_sync_run_records_failure_and_reraises():
    db = make_session()
    try:
        with sync_run(db, "orders_batch") as ctx:
            ctx.records = 0
            raise RuntimeError("boom")
    except RuntimeError:
        pass

    log = db.query(LegacySyncLog).one()
    assert log.status == "failed"
    assert "boom" in log.error_message
