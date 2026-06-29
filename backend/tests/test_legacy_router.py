from unittest.mock import patch

from legacy_client import LegacyClientError
from models import Customer


def test_lookup_upserts_and_returns_customer(client, db_session):
    fake_order = {
        "id": 555,
        "name": "고객B",
        "x": 0.3,
        "y": 0.4,
        "svc": "iptv",
        "region": "B",
        "time_window": "afternoon",
        "vip": True,
        "overdue": False,
    }
    with patch("routers.legacy.LegacyClient.fetch_order", return_value=fake_order):
        response = client.get("/legacy/orders/555")

    assert response.status_code == 200
    assert response.json()["name"] == "고객B"

    saved = db_session.get(Customer, 555)
    assert saved is not None
    assert saved.source == "ondemand"


def test_lookup_returns_503_when_legacy_unavailable(client, db_session):
    with patch(
        "routers.legacy.LegacyClient.fetch_order",
        side_effect=LegacyClientError("timeout"),
    ):
        response = client.get("/legacy/orders/999")

    assert response.status_code == 503
