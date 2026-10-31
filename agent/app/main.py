import json

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from web3 import Web3

from app.config import settings
from app.hsp.signing import verify_webhook_signature

app = FastAPI(title="Credence A2A Agent", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

FINAL_STATUSES = {"payment-included", "payment-safe", "payment-finalized", "payment-failed"}


class RunRequest(BaseModel):
    instruction: str


def _registry():
    from app.chain.registry import TrustRegistry
    reg = TrustRegistry()
    if not reg.enabled:
        raise HTTPException(503, "A2A contracts not configured")
    return reg


@app.get("/health")
def health():
    return {
        "network": settings.network.name,
        "chain_id": settings.network.chain_id,
        "hsp_enabled": settings.hsp_enabled,
        "settlement_mode": settings.settlement_mode,
        "contracts": {"registry": settings.registry_address, "policy": settings.policy_address},
        "llm": bool(settings.groq_api_key),
    }


@app.post("/a2a/run")
def run(req: RunRequest):
    """Server-sent events: one event per verifiable step of the A2A purchase."""
    from app.agents.orchestrator import A2ARun

    def stream():
        for step in A2ARun().run(req.instruction):
            yield f"data: {json.dumps(step, default=str)}\n\n"
        yield "data: {\"key\": \"end\"}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.get("/agents")
def agents():
    from eth_account import Account
    return {
        "buyer": Account.from_key(settings.buyer_agent_key).address if settings.buyer_agent_key else None,
        "merchant": Account.from_key(settings.merchant_agent_key).address if settings.merchant_agent_key else None,
    }


@app.get("/agents/{address}/trust")
def trust(address: str):
    if not Web3.is_address(address):
        raise HTTPException(400, "invalid address")
    reg = _registry()
    return {
        "address": Web3.to_checksum_address(address),
        "trust_score": reg.trust_score(address),
        "terms": reg.terms_for(address),
        "stats": reg.stats(address),
        "policy": reg.policy_of(address),
    }


@app.get("/network")
def network():
    return _registry().totals()


@app.get("/runs")
def runs(limit: int = 20):
    path = settings.data_dir / "runs.jsonl"
    if not path.exists():
        return []
    lines = path.read_text(encoding="utf-8").strip().splitlines()
    return [json.loads(l) for l in reversed(lines[-limit:])]


@app.post("/hsp/webhook")
async def hsp_webhook(request: Request):
    """HSP payment notifications, HMAC-verified with the app secret."""
    raw = await request.body()
    if not settings.hsp_app_secret or not verify_webhook_signature(raw, request.headers.get("X-Signature", ""), settings.hsp_app_secret):
        raise HTTPException(401, "invalid signature")
    event = json.loads(raw)
    if event.get("status") in FINAL_STATUSES:
        with (settings.data_dir / "hsp_webhooks.jsonl").open("a", encoding="utf-8") as f:
            f.write(json.dumps(event) + "\n")
    return {"ok": True}
