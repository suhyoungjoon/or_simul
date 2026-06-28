from models import Customer, Worker


def test_get_workers_returns_seeded_rows(client, db_session):
    db_session.add(Worker(id=1, name="김민준", region="A"))
    db_session.commit()

    response = client.get("/workers")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["name"] == "김민준"


def test_get_customers_returns_seeded_rows(client, db_session):
    db_session.add(Customer(id=101, name="고객A", svc="internet"))
    db_session.commit()

    response = client.get("/customers")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["svc"] == "internet"
