import hashlib
import hmac
import json
import time
from decimal import Decimal

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from eth_account import Account
from eth_abi import encode
from web3 import Web3

from app.hsp.cart_mandate import LineItem, PaymentConditions, build_cart_mandate
from app.hsp.networks import HASHKEY_MAINNET
from app.hsp.payment_mandate import (
    USDC_DOMAIN,
    build_payment_mandate,
    recover_payer,
    select_method,
)
from app.hsp.signing import (
    build_hmac_headers,
    canonical_json,
    cart_hash,
    verify_merchant_authorization,
    verify_webhook_signature,
)

# DOMAIN_SEPARATOR() read from USDC (0x054e...8D0a) on HashKey Chain mainnet.
ONCHAIN_USDC_DOMAIN_SEPARATOR = "78101f50ab6b299bde76a9973e97b1c9ead7df26f6a40692f4440296a507259d"


@pytest.fixture(scope="module")
def merchant_keys():
    key = ec.generate_private_key(ec.SECP256K1())
    priv = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    pub = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
    return priv, pub


def _conditions(pay_to="0x99c1aA23e3a5A9C5c8E1F7D6E6b1a5C4e3D2B1A0"):
    return PaymentConditions(
        cart_mandate_id="CRED-ORDER-1",
        payment_request_id="CRED-PAY-1",
        merchant_name="Credence Data Agent",
        pay_to=pay_to,
        items=[LineItem("Credit report", Decimal("1.50")), LineItem("Risk feed", Decimal("0.50"))],
        network=HASHKEY_MAINNET,
    )


def test_canonical_json_matches_spec_example():
    assert canonical_json({"b": 2, "a": 1, "nested": {"z": "last", "m": "middle"}}) == '{"a":1,"b":2,"nested":{"m":"middle","z":"last"}}'


def test_hmac_headers_follow_spec_message_format():
    body = {"cart_mandate": {"x": 1}}
    h = build_hmac_headers("ak_test", "secret", "POST", "/api/v1/merchant/orders", body=body, timestamp=1709123456, nonce="a3f1b2c4d5e6")
    body_hash = hashlib.sha256(b'{"cart_mandate":{"x":1}}').hexdigest()
    message = f"POST\n/api/v1/merchant/orders\n\n{body_hash}\n1709123456\na3f1b2c4d5e6"
    assert h["X-Signature"] == hmac.new(b"secret", message.encode(), hashlib.sha256).hexdigest()
    assert h["X-App-Key"] == "ak_test" and h["X-Timestamp"] == "1709123456"


def test_hmac_get_has_empty_body_hash():
    h = build_hmac_headers("ak", "s", "GET", "/api/v1/merchant/payments", query="cart_mandate_id=X", timestamp=1, nonce="n")
    message = "GET\n/api/v1/merchant/payments\ncart_mandate_id=X\n\n1\nn"
    assert h["X-Signature"] == hmac.new(b"s", message.encode(), hashlib.sha256).hexdigest()


def test_cart_mandate_jwt_binds_contents(merchant_keys):
    priv, pub = merchant_keys
    body = build_cart_mandate(_conditions(), priv)
    contents = body["cart_mandate"]["contents"]
    token = body["cart_mandate"]["merchant_authorization"]

    assert jwt.get_unverified_header(token)["alg"] == "ES256K"
    claims = verify_merchant_authorization(contents, token, pub)
    assert claims["aud"] == "HashkeyMerchant"
    assert claims["cart_hash"] == cart_hash(contents)
    assert contents["payment_request"]["details"]["total"]["amount"]["value"] == "2.00"
    assert contents["payment_request"]["method_data"][0]["data"]["chain_id"] == 177

    tampered = json.loads(json.dumps(contents))
    tampered["payment_request"]["method_data"][0]["data"]["pay_to"] = "0x000000000000000000000000000000000000dEaD"
    with pytest.raises(ValueError, match="cart_hash mismatch"):
        verify_merchant_authorization(tampered, token, pub)


def test_webhook_signature_verification():
    raw = b'{"event_type":"payment","status":"payment-finalized"}'
    ts = int(time.time())
    sig = hmac.new(b"app_secret", f"{ts}.".encode() + raw, hashlib.sha256).hexdigest()
    assert verify_webhook_signature(raw, f"t={ts},v1={sig}", "app_secret")
    assert not verify_webhook_signature(raw + b" ", f"t={ts},v1={sig}", "app_secret")
    assert not verify_webhook_signature(raw, f"t={ts - 301},v1={sig}", "app_secret")
    assert not verify_webhook_signature(raw, "garbage", "app_secret")


def test_usdc_domain_matches_mainnet_contract():
    typehash = Web3.keccak(text="EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
    separator = Web3.keccak(encode(
        ["bytes32", "bytes32", "bytes32", "uint256", "address"],
        [typehash, Web3.keccak(text=USDC_DOMAIN["name"]), Web3.keccak(text=USDC_DOMAIN["version"]), 177, HASHKEY_MAINNET.tokens["USDC"].address],
    ))
    assert separator.hex().removeprefix("0x") == ONCHAIN_USDC_DOMAIN_SEPARATOR


def test_payment_mandate_signature_recovers_payer(merchant_keys):
    priv, _ = merchant_keys
    payer = Account.create()
    contents = build_cart_mandate(_conditions(), priv)["cart_mandate"]["contents"]

    pm = build_payment_mandate(contents, HASHKEY_MAINNET, payer.key.hex())
    auth = pm["x402"]["payload"]["authorization"]
    assert auth["value"] == "2000000"  # 2.00 USDC, 6 decimals
    assert auth["to"] == contents["payment_request"]["method_data"][0]["data"]["pay_to"]
    assert pm["cart_hash"] == cart_hash(contents)
    assert recover_payer(HASHKEY_MAINNET, pm["x402"]["asset"], auth, pm["x402"]["payload"]["signature"]) == payer.address


def test_payment_agent_rejects_spoofed_token(merchant_keys):
    priv, _ = merchant_keys
    contents = build_cart_mandate(_conditions(), priv)["cart_mandate"]["contents"]
    contents["payment_request"]["method_data"][0]["data"]["contract_address"] = "0x000000000000000000000000000000000000bEEF"
    with pytest.raises(ValueError, match="unexpected USDC contract"):
        select_method(contents, HASHKEY_MAINNET)
