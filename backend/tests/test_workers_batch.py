import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db import Base
from ingestion import workers_batch
from models import LegacySyncLog, Worker

FIXTURE_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


def make_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_run_upserts_workers_from_csv_dir():
    db = make_session()

    workers_batch.run(db, csv_dir=FIXTURE_DIR, filename="workers_sample.csv")

    workers = db.query(Worker).order_by(Worker.id).all()
    assert len(workers) == 2
    assert workers[0].name == "김민준"

    log = db.query(LegacySyncLog).one()
    assert log.status == "success"
    assert log.records_processed == 2
