from models import Customer, LegacyOrder


def test_lookup_upserts_and_returns_customer(client, db_session):
    db_session.add(
        LegacyOrder(
            id=555,
            name="고객B",
            x=0.3,
            y=0.4,
            svc="iptv",
            region="B",
            time_window="afternoon",
            vip=True,
            overdue=False,
        )
    )
    db_session.commit()

    response = client.get("/legacy/orders/555")

    assert response.status_code == 200
    assert response.json()["name"] == "고객B"

    saved = db_session.get(Customer, 555)
    assert saved is not None
    assert saved.source == "ondemand"


def test_lookup_returns_404_when_order_not_found(client, db_session):
    response = client.get("/legacy/orders/999")

    assert response.status_code == 404
