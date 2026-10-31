"""HTTP surface of the receiving agent: Agent Card discovery plus the A2A JSON-RPC endpoint."""

import os
from typing import Callable

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.a2a import protocol as p


def make_router(get_service: Callable) -> APIRouter:
    router = APIRouter()

    def _base(request: Request) -> str:
        return os.getenv("PUBLIC_BASE_URL") or str(request.base_url).rstrip("/")

    @router.get("/.well-known/agent-card.json")
    def agent_card(request: Request):
        return get_service().card(_base(request))

    @router.get("/.well-known/agent.json")  # pre-0.3 discovery path, kept for older A2A clients
    def agent_card_legacy(request: Request):
        return get_service().card(_base(request))

    @router.post("/a2a")
    async def a2a_rpc(request: Request):
        try:
            body = await request.json()
        except Exception:
            return JSONResponse({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "parse error"}})
        rid = body.get("id")
        if body.get("jsonrpc") != "2.0" or not isinstance(body.get("method"), str):
            return JSONResponse({"jsonrpc": "2.0", "id": rid, "error": {"code": -32600, "message": "invalid request"}})
        try:
            result = await get_service().dispatch(body["method"], body.get("params") or {})
            return JSONResponse({"jsonrpc": "2.0", "id": rid, "result": result})
        except p.RPCError as exc:
            return JSONResponse({"jsonrpc": "2.0", "id": rid, "error": {"code": exc.code, "message": exc.message, "data": exc.data}})
        except Exception as exc:  # internal failure: report as a JSON-RPC error, never a bare 500
            return JSONResponse({"jsonrpc": "2.0", "id": rid, "error": {"code": -32603, "message": f"{type(exc).__name__}: {exc}"[:400]}})

    return router
