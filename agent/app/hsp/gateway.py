"""HTTP client for the HSP (HashKey Merchant) gateway."""

from urllib.parse import urlencode

import requests

from app.hsp.signing import build_hmac_headers, canonical_json

API_PREFIX = "/api/v1"


class HSPError(RuntimeError):
    def __init__(self, code: int, msg: str, http_status: int):
        super().__init__(f"HSP error {code} (HTTP {http_status}): {msg}")
        self.code = code
        self.msg = msg
        self.http_status = http_status


class HSPGateway:
    def __init__(self, base_url: str, app_key: str, app_secret: str, timeout: float = 15.0):
        self.base_url = base_url.rstrip("/")
        self.app_key = app_key
        self.app_secret = app_secret
        self.timeout = timeout

    # --- merchant APIs ---

    def create_order(self, cart_mandate_body: dict) -> dict:
        """One-time order. Returns data with payment_url and flow_id."""
        return self._post("/merchant/orders", cart_mandate_body)

    def create_reusable_order(self, cart_mandate_body: dict) -> dict:
        """Reusable mandate: many payments under one cart_mandate_id (agent tabs / subscriptions)."""
        return self._post("/merchant/orders/reusable", cart_mandate_body)

    def query_payments(self, **params) -> dict:
        """Filter by cart_mandate_id, payment_request_id or flow_id."""
        return self._get("/merchant/payments", params)

    def query_reusable_payments(self, **params) -> dict:
        return self._get("/merchant/payments/reusable", params)

    # --- transport ---

    def _post(self, path: str, body: dict) -> dict:
        full_path = API_PREFIX + path
        headers = build_hmac_headers(self.app_key, self.app_secret, "POST", full_path, body=body)
        headers["Content-Type"] = "application/json"
        # Send the exact canonical bytes that were hashed into the signature.
        resp = requests.post(self.base_url + full_path, data=canonical_json(body).encode(), headers=headers, timeout=self.timeout)
        return self._unwrap(resp)

    def _get(self, path: str, params: dict) -> dict:
        full_path = API_PREFIX + path
        query = urlencode({k: v for k, v in params.items() if v is not None})
        headers = build_hmac_headers(self.app_key, self.app_secret, "GET", full_path, query=query)
        url = self.base_url + full_path + (f"?{query}" if query else "")
        return self._unwrap(requests.get(url, headers=headers, timeout=self.timeout))

    @staticmethod
    def _unwrap(resp: requests.Response) -> dict:
        try:
            envelope = resp.json()
        except ValueError:
            raise HSPError(-1, resp.text[:200], resp.status_code)
        if envelope.get("code") != 0:
            raise HSPError(envelope.get("code", -1), envelope.get("msg", "unknown"), resp.status_code)
        return envelope.get("data") or {}
