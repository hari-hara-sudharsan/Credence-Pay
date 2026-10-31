from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from web3 import Web3

from app.config import settings

app = FastAPI(title="Credence A2A Agent", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class RunRequest(BaseModel):
    instruction: str


def _registry():
    from app.chain.registry import TrustRegistry
    reg = TrustRegistry()
    if not reg.enabled:
        raise HTTPException(503, "A2A contracts not configured")
    return reg


def _flow():
    from app.agents.a2a_flow import A2AFlow
    return A2AFlow()


def _run_or_404(run_id: str) -> dict:
    from app.agents.a2a_flow import store
    try:
        return store.get(run_id)
    except KeyError:
        raise HTTPException(404, "run not found")


@app.get("/health")
def health():
    return {
        "network": settings.network.name,
        "chain_id": settings.network.chain_id,
        "hsp_mcp_url": settings.hsp_mcp_url,
        "hsp_team_name": settings.hsp_team_name,
        "coin": settings.hsp_coin,
        "contracts": {"registry": settings.registry_address, "policy": settings.policy_address},
        "llm": bool(settings.groq_api_key),
    }


@app.get("/hsp/tools")
async def hsp_tools():
    """Live HSP MCP tool list and input schemas (fails if a required tool is missing)."""
    from app.hsp.mcp_client import HSPAgenticPayment
    return await HSPAgenticPayment(settings.hsp_mcp_url).schemas()


# --- A2A runs: start -> approve sign -> approve submit -> poll ---

@app.post("/a2a/runs")
async def start_run(req: RunRequest):
    return await _flow().start(req.instruction)


@app.get("/a2a/runs")
def list_runs(limit: int = 20):
    from app.agents.a2a_flow import store
    return store.latest(limit)


@app.get("/a2a/runs/{run_id}")
async def get_run(run_id: str):
    run = _run_or_404(run_id)
    if run["state"] == "settling":
        run = await _flow().refresh(run_id)
    return run


@app.post("/a2a/runs/{run_id}/approve-sign")
async def approve_sign(run_id: str):
    _run_or_404(run_id)
    try:
        return await _flow().approve_sign(run_id)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@app.post("/a2a/runs/{run_id}/approve-submit")
async def approve_submit(run_id: str):
    _run_or_404(run_id)
    try:
        return await _flow().approve_submit(run_id)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


# --- trust layer reads ---

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
