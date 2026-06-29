from scripts.seed_dummy_data import build_customers, build_legacy_orders, build_workers, seed
from models import Customer, LegacyOrder, Worker


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


def test_build_legacy_orders_returns_ten_orders_disjoint_from_customers():
    orders = build_legacy_orders()
    assert len(orders) == 10
    customer_ids = {c["id"] for c in build_customers()}
    order_ids = {o["id"] for o in orders}
    assert order_ids.isdisjoint(customer_ids)
    assert all(o["svc"] in {"internet", "iptv", "combo"} for o in orders)


def test_seed_upserts_into_db_with_mock_source(db_session):
    seed(db_session)

    workers = db_session.query(Worker).all()
    customers = db_session.query(Customer).all()
    legacy_orders = db_session.query(LegacyOrder).all()
    assert len(workers) == 5
    assert len(customers) == 20
    assert len(legacy_orders) == 10
    assert all(w.source == "mock" for w in workers)
    assert all(c.source == "mock" for c in customers)


def test_seed_is_idempotent(db_session):
    seed(db_session)
    seed(db_session)

    assert db_session.query(Worker).count() == 5
    assert db_session.query(Customer).count() == 20
    assert db_session.query(LegacyOrder).count() == 10


def test_build_workers_includes_address_and_coords():
    workers = build_workers()
    assert all(w["address"] for w in workers)
    assert all(37.4 <= w["lat"] <= 37.7 for w in workers)
    assert all(126.8 <= w["lng"] <= 127.2 for w in workers)


def test_build_customers_includes_address_and_coords():
    customers = build_customers()
    assert all(c["address"] for c in customers)
    assert all(37.4 <= c["lat"] <= 37.7 for c in customers)
    assert all(126.8 <= c["lng"] <= 127.2 for c in customers)


def test_build_legacy_orders_includes_address_and_coords():
    orders = build_legacy_orders()
    assert all(o["address"] for o in orders)
    assert all(37.4 <= o["lat"] <= 37.7 for o in orders)
    assert all(126.8 <= o["lng"] <= 127.2 for o in orders)


def test_address_matches_region_neighborhood_pool():
    from scripts.seed_dummy_data import REGION_NEIGHBORHOODS

    customers = build_customers()
    for c in customers:
        pool = REGION_NEIGHBORHOODS[c["region"]]
        assert any(c["address"].startswith(dong) for dong in pool)
