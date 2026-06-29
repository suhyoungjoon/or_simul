from scripts.seed_dummy_data import build_customers, build_workers, seed
from models import Customer, Worker


def test_build_workers_returns_five_fixed_workers():
    workers = build_workers()
    assert len(workers) == 5
    assert {w["id"] for w in workers} == {1, 2, 3, 4, 5}
    assert all(w["name"] for w in workers)
    assert all(0.0 <= w["x"] <= 1.0 and 0.0 <= w["y"] <= 1.0 for w in workers)


def test_build_customers_returns_twenty_fixed_customers():
    customers = build_customers()
    assert len(customers) == 20
    assert {c["id"] for c in customers} == set(range(1, 21))
    assert all(c["svc"] in {"internet", "iptv", "combo"} for c in customers)


def test_seed_upserts_into_db_with_mock_source(db_session):
    seed(db_session)

    workers = db_session.query(Worker).all()
    customers = db_session.query(Customer).all()
    assert len(workers) == 5
    assert len(customers) == 20
    assert all(w.source == "mock" for w in workers)
    assert all(c.source == "mock" for c in customers)


def test_seed_is_idempotent(db_session):
    seed(db_session)
    seed(db_session)

    assert db_session.query(Worker).count() == 5
    assert db_session.query(Customer).count() == 20
