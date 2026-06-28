from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db import Base
from models import Worker


def make_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_merge_inserts_new_worker():
    db = make_session()
    db.merge(Worker(id=1, name="김민준", region="A", batch_date=date(2026, 6, 28)))
    db.commit()

    worker = db.get(Worker, 1)
    assert worker.name == "김민준"


def test_merge_updates_existing_worker_by_id():
    db = make_session()
    db.merge(Worker(id=1, name="김민준", region="A"))
    db.commit()

    db.merge(Worker(id=1, name="김민준", region="B"))
    db.commit()

    workers = db.query(Worker).all()
    assert len(workers) == 1
    assert workers[0].region == "B"
