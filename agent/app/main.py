from decimal import Decimal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from web3 import Web3

from app.config import settings

app = FastAPI(title="Credence A2A Agent", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class RunRequest(BaseModel):
    instruction: str
    persona: str = "nova"
    rail: str | None = None


def _registry():
    from app.chain.registry import TrustRegistry
    reg = TrustRegistry()
    if not reg.enabled:
        raise HTTPException(503, "A2A contracts not configured")
    return reg


def _store():
    from app.agents.a2a_flow import store
    return store


def _run_or_404(run_id: str) -> dict:
    try:
        return _store().get(run_id)
    except KeyError:
        raise HTTPException(404, "run not found")


def _flow_for(run_id: str):
    from app.agents.a2a_flow import A2AFlow
    _run_or_404(run_id)
    return A2AFlow.for_run(run_id)


@app.get("/health")
def health():
    return {
        "network": settings.network.name,
        "chain_id": settings.network.chain_id,
        "explorer": settings.network.explorer,
        "hsp_mcp_url": settings.hsp_mcp_url,
        "hsp_team_name": settings.hsp_team_name,
        "default_rail": settings.default_rail,
        "coin": settings.hsp_coin,
        "contracts": {"registry": settings.registry_address, "policy": settings.policy_address, "test_usd": settings.test_usd_address},
        "llm": bool(settings.groq_api_key),
    }


@app.get("/hsp/status")
async def hsp_status():
    """Whether this machine can reach the HSP MCP server (requires IP allowlisting)."""
    from app.hsp.mcp_client import HSPAgenticPayment
    try:
        tools = await HSPAgenticPayment(settings.hsp_mcp_url).schemas()
        return {"reachable": True, "tools": sorted(tools)}
    except Exception as exc:
        return {"reachable": False, "reason": str(exc)[:300]}


# --- A2A runs: start -> approve sign -> approve submit -> poll ---

@app.post("/a2a/runs")
async def start_run(req: RunRequest):
    from app.agents.a2a_flow import A2AFlow
    from app.agents.personas import PERSONAS
    if req.persona not in PERSONAS:
        raise HTTPException(400, f"unknown persona {req.persona}")
    if req.rail not in (None, "sandbox", "hsp"):
        raise HTTPException(400, "rail must be sandbox or hsp")
    try:
        flow = A2AFlow(req.persona, req.rail)
    except KeyError as exc:
        raise HTTPException(400, str(exc))
    return await flow.start(req.instruction)


@app.get("/a2a/runs")
def list_runs(limit: int = 50):
    return _store().latest(limit)


@app.get("/a2a/runs/{run_id}")
async def get_run(run_id: str):
    run = _run_or_404(run_id)
    if run["state"] == "settling":
        run = await _flow_for(run_id).refresh(run_id)
    return run


@app.post("/a2a/runs/{run_id}/approve-sign")
async def approve_sign(run_id: str):
    try:
        return await _flow_for(run_id).approve_sign(run_id)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@app.post("/a2a/runs/{run_id}/approve-submit")
async def approve_submit(run_id: str):
    try:
        return await _flow_for(run_id).approve_submit(run_id)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


# --- agents and trust ---

def _trust(reg, address: str) -> dict:
    return {
        "address": Web3.to_checksum_address(address),
        "trust_score": reg.trust_score(address),
        "terms": reg.terms_for(address),
        "stats": reg.stats(address),
        "policy": reg.policy_of(address),
    }


@app.get("/agents")
def agents():
    from eth_account import Account
    from app.agents.personas import all_personas
    return {
        "merchant": Account.from_key(settings.merchant_agent_key).address if settings.merchant_agent_key else None,
        "buyer": Account.from_key(settings.buyer_agent_key).address if settings.buyer_agent_key else None,
        "personas": all_personas(),
    }


@app.get("/agents/leaderboard")
def leaderboard():
    from app.agents.personas import all_personas
    reg = _registry()
    rows = [{**p, **_trust(reg, p["address"])} for p in all_personas()]
    return sorted(rows, key=lambda r: r["trust_score"], reverse=True)


@app.get("/agents/{address}/trust")
def trust(address: str):
    if not Web3.is_address(address):
        raise HTTPException(400, "invalid address")
    return _trust(_registry(), address)


@app.get("/catalog")
def catalog():
    from app.agents.merchant_agent import CATALOG
    return [{"id": k, "label": v["label"], "price_usd": str(v["price"])} for k, v in CATALOG.items()]


# --- business ---

@app.get("/network")
def network():
    return _registry().totals()


@app.get("/business")
def business():
    """Live unit economics of the Credence agent marketplace, from chain state and run records."""
    reg = _registry()
    chain = reg.totals()
    runs = _store().latest(10_000)
    started = len(runs)
    settled = [r for r in runs if r["state"] == "settled"]
    blocked = [r for r in runs if r["state"] == "failed" and any("policy" in s["detail"].lower() for s in r["steps"] if s["key"] == "error")]
    open_tabs = [r for r in runs if r.get("terms") in ("NET", "CREDIT") and r["state"] in ("awaiting_sign_approval", "awaiting_submit_approval")]
    deferred_volume = chain["volume_by_terms"]["NET"] + chain["volume_by_terms"]["CREDIT"]
    by_product: dict[str, Decimal] = {}
    for r in settled:
        by_product[r.get("product", "risk_report")] = by_product.get(r.get("product", "risk_report"), Decimal(0)) + Decimal(r.get("total_usd", "0"))
    return {
        "chain": chain,
        "merchant_revenue_usd": chain["total_volume"],
        "credence_fees_usd": chain["total_fees"],
        "deferred_share": deferred_volume / chain["total_volume"] if chain["total_volume"] else 0,
        "default_rate": chain["total_defaulted"] / (deferred_volume + chain["total_defaulted"]) if deferred_volume + chain["total_defaulted"] else 0,
        "runs_started": started,
        "runs_settled": len(settled),
        "policy_blocks": len(blocked),
        "open_tabs": len(open_tabs),
        "open_tab_usd": float(sum(Decimal(r.get("total_usd", "0")) for r in open_tabs)),
        "revenue_by_product": {k: float(v) for k, v in by_product.items()},
    }
