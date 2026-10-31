"""Sandbox payment rail: the HSP Agentic Payment tool surface, executed on HSK testnet.

Exposes the same eight tools as the HSP MCP server (get_chain_config, create_order,
get_order, prepare_payment, finalize_payment, estimate_fee, submit_payment,
query_payment) so the agents run the identical flow and approval gates. Settlement
is a real EIP-3009 transferWithAuthorization of Credence Test USD (cUSD), relayed
by the receiving agent, so every purchase produces verifiable testnet transactions
before HSP access is granted. It never claims to be HSP: runs are labelled "sandbox".
"""

import json
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from eth_account import Account
from web3 import Web3

from app.chain.nonce import next_nonce
from app.config import settings
from app.hsp.signing import cart_hash

RAIL_NAME = "sandbox"
TOOLS = ["get_chain_config", "create_order", "get_order", "prepare_payment",
         "finalize_payment", "estimate_fee", "submit_payment", "query_payment"]

CUSD_ABI = [
    {"name": "transferWithAuthorization", "type": "function", "stateMutability": "nonpayable", "outputs": [],
     "inputs": [{"name": "from", "type": "address"}, {"name": "to", "type": "address"}, {"name": "value", "type": "uint256"},
                {"name": "validAfter", "type": "uint256"}, {"name": "validBefore", "type": "uint256"},
                {"name": "nonce", "type": "bytes32"}, {"name": "v", "type": "uint8"}, {"name": "r", "type": "bytes32"},
                {"name": "s", "type": "bytes32"}]},
]


class SandboxRail:
    def __init__(self, w3: Web3, relayer_key: str):
        self.w3 = w3
        self.relayer = Account.from_key(relayer_key)
        self.token = settings.test_usd_address
        self.path = settings.data_dir / "sandbox_orders.json"
        self.orders: dict = json.loads(self.path.read_text()) if self.path.exists() else {}

    def _save(self):
        self.path.write_text(json.dumps(self.orders, indent=1))

    async def schemas(self) -> dict:
        return {t: {"name": t, "schema": {}, "description": "Credence sandbox rail"} for t in TOOLS}

    async def call(self, tool: str, args: dict) -> dict:
        # Payment and receiving agents hold separate rail instances; disk is the shared truth.
        if self.path.exists():
            self.orders = json.loads(self.path.read_text())
        args = {k.split("|")[0]: v for k, v in args.items()}
        return getattr(self, f"_{tool}")(args)

    # --- tools ---

    def _get_chain_config(self, _):
        return {"networks": [{"network": settings.network.name, "chain_id": settings.network.chain_id, "tokens": [
            {"symbol": "cUSD", "address": self.token, "decimals": 6, "payment_protocol": "eip3009"}]}]}

    def _create_order(self, a):
        contents = a["cart_mandate"]["contents"]
        flow_id = "sbx_" + uuid.uuid4().hex[:16]
        for m in contents["payment_request"]["method_data"]:
            m["data"]["pay_to"] = a["pay_to"]  # HSP behaviour: separately supplied pay_to wins
        self.orders[flow_id] = {"flow_id": flow_id, "merchant_name": a["merchant_name"], "pay_to": a["pay_to"],
                                "contents": contents, "status": "payment-required", "gas_fee_advanced": True}
        self._save()
        return {"flow_id": flow_id, "payment_request_id": contents["payment_request"]["details"]["id"], "payment_url": None}

    def _get_order(self, a):
        o = self.orders[a["flow_id"]]
        return {"order": {"flow_id": o["flow_id"], "status": o["status"], "gas_fee_advanced": o["gas_fee_advanced"],
                          "total": o["contents"]["payment_request"]["details"]["total"]}}

    def _prepare_payment(self, a):
        o = self.orders[a["flow_id"]]
        total = Decimal(o["contents"]["payment_request"]["details"]["total"]["amount"]["value"])
        raw = int(total * 10**6)
        message = {"from": Web3.to_checksum_address(a["payer"]), "to": Web3.to_checksum_address(o["pay_to"]), "value": raw,
                   "validAfter": 0, "validBefore": int(time.time()) + 600, "nonce": "0x" + secrets.token_hex(32)}
        eip712 = {
            "types": {
                "EIP712Domain": [{"name": "name", "type": "string"}, {"name": "version", "type": "string"},
                                 {"name": "chainId", "type": "uint256"}, {"name": "verifyingContract", "type": "address"}],
                "TransferWithAuthorization": [{"name": "from", "type": "address"}, {"name": "to", "type": "address"},
                                              {"name": "value", "type": "uint256"}, {"name": "validAfter", "type": "uint256"},
                                              {"name": "validBefore", "type": "uint256"}, {"name": "nonce", "type": "bytes32"}]},
            "primaryType": "TransferWithAuthorization",
            "domain": {"name": "Credence Test USD", "version": "1", "chainId": settings.network.chain_id, "verifyingContract": self.token},
            "message": message,
        }
        o.update(payer=message["from"], eip712=eip712, status="payment-required")
        self._save()
        return {"eip712": eip712, "cart_hash": cart_hash(o["contents"]), "token_total_raw": str(raw),
                "quote_expires_at": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat(),
                "pay_to": o["pay_to"], "payer": message["from"], "payment_request_id": o["contents"]["payment_request"]["details"]["id"],
                "payment_payload": {"flow_id": o["flow_id"], "payload": {"signature": ""}}, "payment_mandate_contents": {"flow_id": o["flow_id"]}}

    def _finalize_payment(self, a):
        flow_id = a["payment_payload"]["flow_id"]
        return {"payment_mandate_json": {"flow_id": flow_id, "signature": a["signature"], "cart_hash": a["cart_hash"]}}

    def _estimate_fee(self, _):
        return {"gas_fee": "0", "gas_fee_advanced": True}

    def _submit_payment(self, a):
        pm = a["payment_mandate_json"]
        o = self.orders[pm["flow_id"]]
        msg = o["eip712"]["message"]
        sig = bytes.fromhex(pm["signature"].removeprefix("0x"))
        token = self.w3.eth.contract(address=Web3.to_checksum_address(self.token), abi=CUSD_ABI)
        tx = token.functions.transferWithAuthorization(
            msg["from"], msg["to"], int(msg["value"]), int(msg["validAfter"]), int(msg["validBefore"]),
            bytes.fromhex(msg["nonce"].removeprefix("0x")), sig[64], sig[:32], sig[32:64],
        ).build_transaction({"from": self.relayer.address, "chainId": settings.network.chain_id,
                             "nonce": next_nonce(self.w3, self.relayer.address)})
        tx_hash = self.w3.eth.send_raw_transaction(self.relayer.sign_transaction(tx).raw_transaction)
        o.update(status="payment-submitted", tx="0x" + tx_hash.hex().removeprefix("0x"))
        self._save()
        return {"status": "payment-submitted"}

    def _query_payment(self, a):
        o = self.orders[a["flow_id"]]
        payment = {"status": o["status"], "tx_signature": o.get("tx", ""), "payer_address": o.get("payer"),
                   "to_pay_address": o["pay_to"], "network": settings.network.name, "status_reason": ""}
        if o.get("tx") and o["status"] not in ("payment-finalized", "payment-failed"):
            try:
                receipt = self.w3.eth.get_transaction_receipt(o["tx"])
                o["status"] = "payment-finalized" if receipt.status == 1 else "payment-failed"
                if receipt.status != 1:
                    payment["status_reason"] = "transferWithAuthorization reverted"
                self._save()
            except Exception:
                o["status"] = "payment-processing"
            payment["status"] = o["status"]
        return {"payment": payment, "attribution_verified": a.get("expected_merchant_name") == o["merchant_name"]}
