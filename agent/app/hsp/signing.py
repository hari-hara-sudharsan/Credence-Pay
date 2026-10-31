"""HSP (HashKey Merchant) signing primitives.

Implements the three cryptographic layers from the HashKey Merchant docs
(https://hashkey-merchant.github.io/#/):

1. Canonical JSON: sorted keys, no whitespace (RFC 8785 subset)
2. HMAC-SHA256 request signing for every /api/v1/merchant/* call
3. ES256K JWT for cart_mandate.merchant_authorization
4. Webhook signature verification (X-Signature: t=<ts>,v1=<hmac>)
"""

import hashlib
import hmac
import json
import secrets
import time
from typing import Any

import jwt

JWT_AUDIENCE = "HashkeyMerchant"
SIGNATURE_TOLERANCE_SECS = 300


def canonical_json(value: Any) -> str:
    """Deterministic JSON: keys sorted lexicographically, arrays keep order, no whitespace."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_hex(data: str) -> str:
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def cart_hash(contents: dict) -> str:
    """SHA-256 of canonical cart_mandate.contents, as carried in the JWT `cart_hash` claim."""
    return sha256_hex(canonical_json(contents))


def build_hmac_headers(
    app_key: str,
    app_secret: str,
    method: str,
    path: str,
    query: str = "",
    body: dict | None = None,
    timestamp: int | None = None,
    nonce: str | None = None,
) -> dict:
    """Headers for a signed merchant API call.

    message = METHOD \\n PATH \\n QUERY \\n bodyHash \\n timestamp \\n nonce
    """
    ts = str(timestamp if timestamp is not None else int(time.time()))
    nonce = nonce or secrets.token_hex(16)
    body_hash = sha256_hex(canonical_json(body)) if body is not None else ""
    message = "\n".join([method.upper(), path, query, body_hash, ts, nonce])
    signature = hmac.new(app_secret.encode(), message.encode(), hashlib.sha256).hexdigest()
    return {
        "X-App-Key": app_key,
        "X-Signature": signature,
        "X-Timestamp": ts,
        "X-Nonce": nonce,
    }


def sign_merchant_authorization(
    contents: dict,
    merchant_name: str,
    private_key_pem: str,
    ttl_secs: int = 3600,
) -> str:
    """ES256K JWT binding the merchant to this exact cart."""
    now = int(time.time())
    claims = {
        "iss": merchant_name,
        "sub": merchant_name,
        "aud": JWT_AUDIENCE,
        "iat": now,
        "exp": now + ttl_secs,
        "jti": f"JWT-{now}-{secrets.token_hex(6)}",
        "cart_hash": cart_hash(contents),
    }
    return jwt.encode(claims, private_key_pem, algorithm="ES256K", headers={"typ": "JWT"})


def verify_merchant_authorization(contents: dict, token: str, public_key_pem: str) -> dict:
    """Used by the payment agent: prove the cart was issued by the merchant and not altered.

    Raises jwt.InvalidTokenError (or ValueError on cart mismatch).
    """
    claims = jwt.decode(token, public_key_pem, algorithms=["ES256K"], audience=JWT_AUDIENCE)
    if claims.get("cart_hash") != cart_hash(contents):
        raise ValueError("cart_hash mismatch: cart contents were modified after merchant signing")
    return claims


def verify_webhook_signature(raw_body: bytes, header: str, app_secret: str, now: int | None = None) -> bool:
    """Verify `X-Signature: t=<ts>,v1=<hex>` where v1 = HMAC(app_secret, f"{t}.{raw_body}")."""
    if not header:
        return False
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    try:
        ts = int(parts["t"])
        received = parts["v1"]
    except (KeyError, ValueError):
        return False
    current = now if now is not None else int(time.time())
    if abs(current - ts) > SIGNATURE_TOLERANCE_SECS:
        return False
    message = f"{ts}.".encode() + raw_body
    expected = hmac.new(app_secret.encode(), message, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, received)
