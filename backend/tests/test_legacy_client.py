import httpx
import pytest
import respx

from legacy_client import LegacyClient, LegacyClientError


@respx.mock
def test_fetch_orders_returns_list_of_dicts():
    respx.get("https://legacy.example.com/orders", params={"date": "2026-06-28"}).mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "id": 101,
                    "name": "고객A",
                    "x": 0.5,
                    "y": 0.5,
                    "svc": "internet",
                    "region": "A",
                    "time_window": "morning",
                    "vip": False,
                    "overdue": False,
                }
            ],
        )
    )
    client = LegacyClient(base_url="https://legacy.example.com")
    orders = client.fetch_orders("2026-06-28")

    assert len(orders) == 1
    assert orders[0]["id"] == 101


@respx.mock
def test_fetch_order_returns_single_dict():
    respx.get("https://legacy.example.com/orders/101").mock(
        return_value=httpx.Response(200, json={"id": 101, "name": "고객A"})
    )
    client = LegacyClient(base_url="https://legacy.example.com")
    order = client.fetch_order(101)

    assert order["id"] == 101


@respx.mock
def test_fetch_orders_retries_then_raises_on_persistent_500():
    route = respx.get("https://legacy.example.com/orders", params={"date": "2026-06-28"}).mock(
        return_value=httpx.Response(500)
    )
    client = LegacyClient(base_url="https://legacy.example.com")

    with pytest.raises(LegacyClientError):
        client.fetch_orders("2026-06-28")

    assert route.call_count == 3


@respx.mock
def test_fetch_order_raises_legacy_client_error_on_connect_error():
    respx.get("https://legacy.example.com/orders/101").mock(
        side_effect=httpx.ConnectError("nodename nor servname provided, or not known")
    )
    client = LegacyClient(base_url="https://legacy.example.com")

    with pytest.raises(LegacyClientError):
        client.fetch_order(101)
