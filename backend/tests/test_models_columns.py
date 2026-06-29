from models import Customer, LegacyOrder, Worker


def test_worker_has_address_lat_lng_columns(db_session):
    w = Worker(id=1, name="테스트", address="역삼동 1길 1", lat=37.5, lng=127.0, source="mock")
    db_session.add(w)
    db_session.commit()
    fetched = db_session.get(Worker, 1)
    assert fetched.address == "역삼동 1길 1"
    assert fetched.lat == 37.5
    assert fetched.lng == 127.0


def test_customer_has_address_lat_lng_columns(db_session):
    c = Customer(id=1, name="고객1", address="잠실동 2길 3", lat=37.51, lng=127.1, source="mock")
    db_session.add(c)
    db_session.commit()
    fetched = db_session.get(Customer, 1)
    assert fetched.address == "잠실동 2길 3"
    assert fetched.lat == 37.51
    assert fetched.lng == 127.1


def test_legacy_order_has_address_lat_lng_columns(db_session):
    o = LegacyOrder(id=101, name="고객101", address="연남동 4길 5", lat=37.56, lng=126.92)
    db_session.add(o)
    db_session.commit()
    fetched = db_session.get(LegacyOrder, 101)
    assert fetched.address == "연남동 4길 5"
    assert fetched.lat == 37.56
    assert fetched.lng == 126.92
