import httpx


class LegacyClientError(Exception):
    pass


class LegacyClient:
    def __init__(self, base_url: str, timeout: float = 10.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def _get(self, path: str, params: dict | None = None) -> dict | list:
        url = f"{self.base_url}{path}"
        last_error = None
        for attempt in range(3):
            try:
                response = httpx.get(url, params=params, timeout=self.timeout)
                if response.status_code >= 500:
                    last_error = LegacyClientError(
                        f"legacy server error {response.status_code} on {url}"
                    )
                    continue
                response.raise_for_status()
                return response.json()
            except httpx.TimeoutException as exc:
                last_error = LegacyClientError(f"timeout calling {url}: {exc}")
            except httpx.HTTPStatusError as exc:
                raise LegacyClientError(f"legacy client error: {exc}") from exc
            except httpx.RequestError as exc:
                last_error = LegacyClientError(f"connection error calling {url}: {exc}")
        raise last_error

    def fetch_orders(self, batch_date: str) -> list[dict]:
        return self._get("/orders", params={"date": batch_date})

    def fetch_order(self, order_id: int) -> dict:
        return self._get(f"/orders/{order_id}")
