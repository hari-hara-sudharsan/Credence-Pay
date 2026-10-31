"""Payment Mandate construction (payment agent side).

The payment agent receives a Cart Mandate from the receiving agent, verifies
it, and authorises the transfer with an EIP-712 wallet signature. For USDC on
HashKey Chain, HSP's x402 method uses EIP-3009 `TransferWithAuthorization`:
the signature authorises exactly `value` to `pay_to` within a time window,
and anyone (the HSP gateway) can submit it on-chain. The agent never hands
over a private key or an open-ended allowance.
"""

import secrets
import time
from decimal import Decimal

from eth_account import Account
from eth_account.messages import encode_typed_data

from app.hsp.networks import Network
from app.hsp.signing import cart_hash

# EIP-712 domain of USDC on HashKey Chain (read from the contract: name(), version()).
USDC_DOMAIN = {"name": "Bridged USDC", "version": "2"}

TRANSFER_WITH_AUTHORIZATION_TYPES = {
    "EIP712Domain": [
        {"name": "name", "type": "string"},
        {"name": "version", "type": "string"},
        {"name": "chainId", "type": "uint256"},
        {"name": "verifyingContract", "type": "address"},
    ],
    "TransferWithAuthorization": [
        {"name": "from", "type": "address"},
        {"name": "to", "type": "address"},
        {"name": "value", "type": "uint256"},
        {"name": "validAfter", "type": "uint256"},
        {"name": "validBefore", "type": "uint256"},
        {"name": "nonce", "type": "bytes32"},
    ],
}


def select_method(contents: dict, network: Network, coin: str = "USDC") -> dict:
    """Pick the x402 method_data entry the agent will pay with, and sanity-check it."""
    for m in contents["payment_request"]["method_data"]:
        d = m["data"]
        if d["coin"] == coin and d["chain_id"] == network.chain_id:
            expected = network.tokens[coin].address.lower()
            if d["contract_address"].lower() != expected:
                raise ValueError(f"unexpected {coin} contract {d['contract_address']} (expected {expected})")
            return d
    raise ValueError(f"cart offers no {coin} method on chain {network.chain_id}")


def to_base_units(amount_usd: str, decimals: int) -> int:
    return int(Decimal(amount_usd) * (10 ** decimals))


def typed_data(network: Network, token_address: str, authorization: dict) -> dict:
    return {
        "types": TRANSFER_WITH_AUTHORIZATION_TYPES,
        "primaryType": "TransferWithAuthorization",
        "domain": {**USDC_DOMAIN, "chainId": network.chain_id, "verifyingContract": token_address},
        "message": authorization,
    }


def build_payment_mandate(
    contents: dict,
    network: Network,
    payer_private_key: str,
    coin: str = "USDC",
    valid_for_secs: int = 600,
) -> dict:
    """Sign the user's (agent's) authorisation for the cart and wrap it as a Payment Mandate."""
    method = select_method(contents, network, coin)
    if network.tokens[coin].protocol != "EIP-3009":
        raise NotImplementedError(f"{coin} on {network.name} uses {network.tokens[coin].protocol}")

    account = Account.from_key(payer_private_key)
    total = contents["payment_request"]["details"]["total"]["amount"]["value"]
    now = int(time.time())
    authorization = {
        "from": account.address,
        "to": method["pay_to"],
        "value": to_base_units(total, network.tokens[coin].decimals),
        "validAfter": 0,
        "validBefore": now + valid_for_secs,
        "nonce": "0x" + secrets.token_hex(32),
    }
    signed = account.sign_message(encode_typed_data(full_message=typed_data(network, method["contract_address"], authorization)))

    return {
        "payment_mandate_id": contents["payment_request"]["details"]["id"],
        "cart_mandate_id": contents["id"],
        "cart_hash": cart_hash(contents),
        "payer": account.address,
        "x402": {
            "x402Version": 2,
            "scheme": "exact",
            "network": network.name,
            "asset": method["contract_address"],
            "payload": {
                "signature": "0x" + signed.signature.hex().removeprefix("0x"),
                "authorization": {**authorization, "value": str(authorization["value"])},
            },
        },
    }


def recover_payer(network: Network, token_address: str, authorization: dict, signature: str) -> str:
    """Recover the signer of a TransferWithAuthorization (used to verify before settlement)."""
    auth = {**authorization, "value": int(authorization["value"])}
    msg = encode_typed_data(full_message=typed_data(network, token_address, auth))
    return Account.recover_message(msg, signature=signature)
