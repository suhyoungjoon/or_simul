from scripts.seed_dummy_data import seed


def test_get_workers_includes_address_lat_lng(client, db_session):
    seed(db_session)
    res = client.get("/workers")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 5
    assert all("address" in w and "lat" in w and "lng" in w for w in body)
    assert all(w["address"] for w in body)


def test_get_customers_includes_address_lat_lng(client, db_session):
    seed(db_session)
    res = client.get("/customers")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 20
    assert all("address" in c and "lat" in c and "lng" in c for c in body)
    assert all(c["address"] for c in body)
