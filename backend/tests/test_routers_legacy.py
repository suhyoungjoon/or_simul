from scripts.seed_dummy_data import seed


def test_lookup_order_includes_address_lat_lng(client, db_session):
    seed(db_session)
    res = client.get("/legacy/orders/101")
    assert res.status_code == 200
    body = res.json()
    assert body["address"]
    assert isinstance(body["lat"], float)
    assert isinstance(body["lng"], float)


def test_lookup_order_not_found_returns_404(client, db_session):
    res = client.get("/legacy/orders/9999")
    assert res.status_code == 404
