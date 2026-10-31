"""Client for the HSP Agentic Payment MCP server (Streamable HTTP).

Follows the HSP Agentic Payment guide: tool names and argument names come
from the server's live schemas, never from hard-coded guesses. App Key/Secret
live on the HSP server, so the agent holds no merchant credentials.
"""

import json
from contextlib import asynccontextmanager

from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

REQUIRED_TOOLS = {
    "get_chain_config", "create_order", "get_order", "prepare_payment",
    "finalize_payment", "estimate_fee", "submit_payment", "query_payment",
}


class HSPToolError(RuntimeError):
    def __init__(self, tool: str, message: str, payload=None):
        super().__init__(f"{tool}: {message}")
        self.tool = tool
        self.payload = payload


class HSPAgenticPayment:
    def __init__(self, url: str):
        self.url = url
        self._schemas: dict[str, dict] | None = None

    @asynccontextmanager
    async def _session(self):
        async with streamable_http_client(self.url) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                yield session

    async def schemas(self) -> dict[str, dict]:
        """Live tool list. Refuses to continue if any required tool (notably finalize_payment) is missing."""
        if self._schemas is None:
            async with self._session() as s:
                tools = (await s.list_tools()).tools
            self._schemas = {t.name.split("__")[-1].split(".")[-1]: {"name": t.name, "schema": _input_schema(t), "description": t.description} for t in tools}
            missing = REQUIRED_TOOLS - set(self._schemas)
            if missing:
                raise HSPToolError("list_tools", f"HSP MCP server is missing required tools: {sorted(missing)}")
        return self._schemas

    async def call(self, tool: str, candidates: dict) -> dict:
        """Call a tool, passing only the candidate arguments its live schema declares."""
        spec = (await self.schemas())[tool]
        args = fit_arguments(tool, spec["schema"], candidates)
        async with self._session() as s:
            result = await s.call_tool(spec["name"], args)
        payload = parse_result(result)
        if getattr(result, "is_error", False):
            raise HSPToolError(tool, _error_text(payload), payload)
        return payload


def _input_schema(tool) -> dict:
    """MCP SDK 1.x names the field inputSchema; 2.x names it input_schema."""
    return getattr(tool, "input_schema", None) or getattr(tool, "inputSchema", None) or {}


def fit_arguments(tool: str, schema: dict, candidates: dict) -> dict:
    """Map our values onto the schema's property names. Candidate keys may list aliases: {"payer|payer_address": value}."""
    props = schema.get("properties", {})
    args = {}
    for keys, value in candidates.items():
        for key in keys.split("|"):
            if key in props and value is not None:
                args[key] = value
                break
    missing = [r for r in schema.get("required", []) if r not in args]
    if missing:
        raise HSPToolError(tool, f"cannot satisfy required parameters {missing}; live schema: {json.dumps(schema)[:800]}")
    return args


def parse_result(result) -> dict:
    if getattr(result, "structured_content", None):
        return result.structured_content
    texts = [c.text for c in (getattr(result, "content", None) or []) if getattr(c, "type", "") == "text"]
    joined = "\n".join(texts)
    try:
        return json.loads(joined)
    except (ValueError, TypeError):
        return {"text": joined}


def _error_text(payload: dict) -> str:
    for key in ("message", "msg", "error", "text"):
        if payload.get(key):
            return str(payload[key])
    return json.dumps(payload)[:500]


def flatten_error(exc: BaseException) -> str:
    """MCP errors arrive wrapped in ExceptionGroups; surface the innermost messages."""
    subs = getattr(exc, "exceptions", None)
    if subs:
        return "; ".join(flatten_error(e) for e in subs)
    return f"{type(exc).__name__}: {exc}" + (f" <- {flatten_error(exc.__cause__)}" if exc.__cause__ else "")


async def probe(url: str) -> dict:
    """Why can't we use HSP? Checks the documented /health endpoint and this machine's public egress IP."""
    import httpx
    out: dict = {"health": None, "egress_ip": None}
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.get(url.rstrip("/") + "/health")
            out["health"] = r.json() if r.status_code == 200 else {"http_status": r.status_code}
        except Exception as exc:
            out["health"] = {"error": type(exc).__name__, "detail": str(exc)[:200]}
        try:
            out["egress_ip"] = (await client.get("https://api.ipify.org")).text.strip()
        except Exception:
            pass
    h = out["health"] or {}
    ip = out["egress_ip"] or "unknown"
    if h.get("http_status") in (401, 403):
        out.update(cause="not_allowlisted", hint=(f"HSP refused this machine (HTTP {h['http_status']}). Its public IP {ip} is not on the HSP QA "
                                                  "allowlist. Ask HSP Operations to allowlist this IP, or run from the network whose IP they approved."))
    elif "certificate" in str(h).lower() or "ssl" in str(h).lower():
        out.update(cause="tls_interception", hint=("TLS to HSP could not be verified: a firewall or proxy on this network (for example FortiGate SSL "
                                                   "inspection) is replacing HSP's certificate. Use a network without SSL inspection."))
    elif h.get("error"):
        out.update(cause="unreachable", hint=f"HSP did not answer from this network ({h['error']}). Public IP {ip}.")
    else:
        out.update(cause="unknown", hint=None)
    return out
