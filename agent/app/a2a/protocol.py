"""A2A protocol primitives (JSON-RPC 2.0 transport, A2A spec v0.3) with AP2 payment mandates.

The receiving agent publishes an Agent Card at /.well-known/agent-card.json and accepts
`message/send` and `tasks/get`. Payment conditions travel as AP2 data parts:

  payment agent  --IntentMandate + QuoteRequest + identity proof-->  receiving agent
  receiving agent --Task(input-required) + CartMandate + terms------>  payment agent
  payment agent  --PaymentMandate (signed, submitted to HSP)-------->  receiving agent
  payment agent  --SettlementNotice--------------------------------->  receiving agent
  receiving agent --Task(completed) + receipt + goods--------------->  payment agent

The receiving agent never trusts the payer's word: identity is a wallet signature, and
settlement is verified independently against the payment rail before goods ship.
"""

import json
import time
import uuid
from datetime import datetime, timezone

from eth_account import Account
from eth_account.messages import encode_defunct

from app.config import settings

PROTOCOL_VERSION = "0.3.0"
AP2_EXTENSION = "https://github.com/google-agentic-commerce/ap2/tree/v0.1"
CREDENCE_EXTENSION = "https://credence.dev/a2a/trust-terms/v1"

INTENT_MANDATE = "ap2.mandates.IntentMandate"
CART_MANDATE = "ap2.mandates.CartMandate"
PAYMENT_MANDATE = "ap2.mandates.PaymentMandate"
QUOTE_REQUEST = "credence.QuoteRequest"
IDENTITY = "credence.IdentityProof"
TERMS = "credence.Terms"
SETTLEMENT_NOTICE = "credence.SettlementNotice"
RECEIPT = "credence.SettlementReceipt"
GOODS = "credence.RiskReports"

IDENTITY_MAX_AGE_S = 300


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str = "") -> str:
    return prefix + uuid.uuid4().hex[:16]


# ---------- Agent Card ----------

def agent_card(base_url: str, pay_to: str) -> dict:
    from app.agents.merchant_agent import CATALOG
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "name": "Credence Risk Agent",
        "description": ("Sells wallet and agent risk intelligence to other agents. Prices every buyer from its "
                        "on-chain payment history on HSK Chain: prepay, net terms or a credit tab. Payments settle "
                        "through HSP Agentic Payment."),
        "url": f"{base_url.rstrip('/')}/a2a",
        "preferredTransport": "JSONRPC",
        "version": "2.0.0",
        "provider": {"organization": "Credence", "url": base_url},
        "capabilities": {
            "streaming": False,
            "pushNotifications": False,
            "stateTransitionHistory": True,
            "extensions": [
                {"uri": AP2_EXTENSION, "description": "AP2 payment mandates (Intent, Cart, Payment)", "required": True,
                 "params": {"roles": ["merchant"]}},
                {"uri": CREDENCE_EXTENSION, "description": "Trust-gated terms: PREPAY, NET or CREDIT from on-chain history",
                 "required": False,
                 "params": {"registry": settings.registry_address, "policy": settings.policy_address,
                            "chainId": settings.network.chain_id, "network": settings.network.name}},
            ],
        },
        "defaultInputModes": ["application/json", "text/plain"],
        "defaultOutputModes": ["application/json"],
        "skills": [
            {"id": pid, "name": p["label"], "description": f"{p['label']} for any HSK Chain wallet. List price {p['price']} USD per wallet.",
             "tags": ["risk", "credit", "hsp", "payments"], "examples": [f"{p['label']} for 0x2988f0bE02e1a679430aEb4A6B9B10429F1e8e80"],
             "inputModes": ["application/json"], "outputModes": ["application/json"]}
            for pid, p in CATALOG.items()
        ],
        "payment": {"payTo": pay_to, "merchantName": settings.hsp_team_name, "rails": ["hsp", "sandbox"],
                    "network": settings.network.name, "chainId": settings.network.chain_id},
    }


# ---------- messages, parts, tasks ----------

def data_part(key: str, value) -> dict:
    return {"kind": "data", "data": {key: value}}


def text_part(text: str) -> dict:
    return {"kind": "text", "text": text}


def message(role: str, parts: list[dict], task_id: str | None = None, context_id: str | None = None) -> dict:
    msg = {"kind": "message", "messageId": new_id("msg_"), "role": role, "parts": parts}
    if task_id:
        msg["taskId"] = task_id
    if context_id:
        msg["contextId"] = context_id
    return msg


def artifact(name: str, key: str, value) -> dict:
    return {"artifactId": new_id("art_"), "name": name, "parts": [data_part(key, value)]}


def parts_data(msg_or_task: dict) -> dict:
    """Merge every data part of a message (or every artifact of a task) into one dict."""
    out: dict = {}
    for p in msg_or_task.get("parts", []):
        if p.get("kind") == "data":
            out.update(p.get("data") or {})
    for a in msg_or_task.get("artifacts", []) or []:
        for p in a.get("parts", []):
            if p.get("kind") == "data":
                out.update(p.get("data") or {})
    return out


def status_text(task: dict) -> str:
    msg = (task.get("status") or {}).get("message") or {}
    return " ".join(p.get("text", "") for p in msg.get("parts", []) if p.get("kind") == "text")


# ---------- payer identity proof ----------

def identity_message(payer: str, context_id: str, issued_at: int) -> str:
    return f"Credence A2A identity\npayer:{payer.lower()}\ncontext:{context_id}\nissued_at:{issued_at}"


def sign_identity(private_key: str, context_id: str) -> dict:
    acct = Account.from_key(private_key)
    issued_at = int(time.time())
    sig = acct.sign_message(encode_defunct(text=identity_message(acct.address, context_id, issued_at))).signature
    return {"payer": acct.address, "context_id": context_id, "issued_at": issued_at,
            "signature": "0x" + sig.hex().removeprefix("0x"), "scheme": "eip191"}


def verify_identity(proof: dict, context_id: str) -> str:
    """Return the proven payer address, or raise ValueError."""
    if not proof:
        raise ValueError("missing identity proof")
    if proof.get("context_id") != context_id:
        raise ValueError("identity proof is bound to a different context")
    age = abs(int(time.time()) - int(proof.get("issued_at", 0)))
    if age > IDENTITY_MAX_AGE_S:
        raise ValueError("identity proof expired")
    recovered = Account.recover_message(
        encode_defunct(text=identity_message(proof["payer"], context_id, int(proof["issued_at"]))), signature=proof["signature"])
    if recovered.lower() != proof["payer"].lower():
        raise ValueError("identity signature does not match payer")
    return recovered


# ---------- JSON-RPC ----------

class RPCError(Exception):
    def __init__(self, code: int, message: str, data=None):
        super().__init__(message)
        self.code, self.message, self.data = code, message, data


TASK_NOT_FOUND = -32001
INVALID_PARAMS = -32602
METHOD_NOT_FOUND = -32601


def rpc_request(method: str, params: dict) -> dict:
    return {"jsonrpc": "2.0", "id": new_id("rpc_"), "method": method, "params": params}


def compact(value, limit: int = 2400):
    """Trim large payloads for the wire log while keeping them valid JSON."""
    text = json.dumps(value, default=str)
    if len(text) <= limit:
        return value
    return {"_truncated": True, "preview": text[:limit]}
