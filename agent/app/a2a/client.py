"""The payment agent's A2A client. Every JSON-RPC exchange is recorded on the run's wire log."""

import time

import httpx

from app.a2a import protocol as p


class A2AError(RuntimeError):
    pass


class A2AClient:
    def __init__(self, base_url: str, transport: httpx.AsyncBaseTransport | None = None):
        self.base_url = base_url.rstrip("/")
        self.transport = transport
        self.wire: list[dict] = []
        self._card: dict | None = None

    @classmethod
    def in_process(cls, service) -> "A2AClient":
        """Same JSON-RPC messages, delivered to an in-process receiving agent (no network hop)."""
        from fastapi import FastAPI
        from app.a2a.server import make_router
        app = FastAPI()
        app.include_router(make_router(lambda: service))
        return cls("http://merchant.local", httpx.ASGITransport(app=app))

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=self.transport, timeout=60) if self.transport else httpx.AsyncClient(timeout=60)

    def _log(self, direction: str, kind: str, payload, ms: float | None = None):
        self.wire.append({"dir": direction, "kind": kind, "at": p.now_iso(), "ms": ms, "payload": p.compact(payload)})

    async def card(self) -> dict:
        if self._card is None:
            url = f"{self.base_url}/.well-known/agent-card.json"
            self._log("out", "GET agent-card", {"url": url})
            t0 = time.perf_counter()
            async with self._client() as c:
                r = await c.get(url)
                r.raise_for_status()
                self._card = r.json()
            self._log("in", "AgentCard", self._card, round((time.perf_counter() - t0) * 1000, 1))
        return self._card

    async def rpc(self, method: str, params: dict) -> dict:
        card = await self.card()
        url = card["url"] if not self.transport else f"{self.base_url}/a2a"
        body = p.rpc_request(method, params)
        self._log("out", method, body)
        t0 = time.perf_counter()
        async with self._client() as c:
            r = await c.post(url, json=body)
            r.raise_for_status()
            resp = r.json()
        self._log("in", "error" if "error" in resp else "Task", resp, round((time.perf_counter() - t0) * 1000, 1))
        if "error" in resp:
            raise A2AError(f"A2A {method} failed ({resp['error'].get('code')}): {resp['error'].get('message')}")
        return resp["result"]

    async def send(self, parts: list[dict], task_id: str | None = None, context_id: str | None = None) -> dict:
        return await self.rpc("message/send", {"message": p.message("user", parts, task_id, context_id)})

    async def get_task(self, task_id: str) -> dict:
        return await self.rpc("tasks/get", {"id": task_id})
