export const API = process.env.NEXT_PUBLIC_AGENT_API ?? "http://localhost:8000";
export const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER ?? "https://testnet-explorer.hskchain.net";

export type Step = {
  key: string;
  title: string;
  detail: string;
  status: "done" | "waiting" | "error";
  data: Record<string, any>;
  at: string;
};

export type Persona = {
  id: string;
  name: string;
  tagline: string;
  owner: string;
  color: string;
  address: string;
};

export type LeaderRow = Persona & Trust;

export type Business = {
  chain: {
    total_settled: number;
    total_volume: number;
    volume_by_terms: { PREPAY: number; NET: number; CREDIT: number };
    total_fees: number;
    total_defaulted: number;
    fee_bps: number;
  };
  merchant_revenue_usd: number;
  credence_fees_usd: number;
  deferred_share: number;
  default_rate: number;
  runs_started: number;
  runs_settled: number;
  policy_blocks: number;
  open_tabs: number;
  open_tab_usd: number;
  revenue_by_product: Record<string, number>;
};

export type HspStatus = { reachable: boolean; reason?: string; tools?: string[]; cause?: string | null; hint?: string | null; egress_ip?: string | null };

export type WireEntry = { dir: "out" | "in"; kind: string; at: string; ms?: number | null; payload: any };

export type AgentCard = {
  protocolVersion: string;
  name: string;
  description: string;
  url: string;
  preferredTransport: string;
  version: string;
  capabilities: { extensions: { uri: string; description: string; required: boolean; params?: Record<string, any> }[] };
  skills: { id: string; name: string; description: string; tags: string[] }[];
  payment: { payTo: string; merchantName: string; rails: string[]; network: string; chainId: number };
};

export type Run = {
  id: string;
  persona?: string;
  persona_name?: string;
  rail?: "sandbox" | "hsp";
  total_usd?: string;
  product?: string;
  seeded?: boolean;
  instruction: string;
  state: "running" | "awaiting_sign_approval" | "awaiting_submit_approval" | "settling" | "settled" | "failed";
  steps: Step[];
  payer: string;
  payee: string;
  merchant_name: string;
  terms?: string;
  trust_before?: number;
  trust_after?: number;
  next_terms?: { terms: string; credit_limit: number; net_days: number };
  payment_status?: string;
  order?: { flow_id: string; payment_request_id?: string; payment_url?: string };
  wire?: WireEntry[];
  a2a?: { agent: string; endpoint: string; protocol: string; task_id?: string; context_id?: string };
  anchor_tx?: string;
  report?: Record<string, string | boolean>;
  reports?: { wallet: string; credit_score: number; rating?: string; probability_of_default?: number; segment?: string }[];
  created_at: string;
};

export type Trust = {
  address: string;
  trust_score: number;
  terms: { terms: string; credit_limit: number; net_days: number };
  stats: {
    settled_count: number;
    on_time_count: number;
    late_count: number;
    default_count: number;
    settled_volume: number;
    outstanding: number;
  };
  policy: { owner: string; daily_cap: number; per_tx_cap: number; spent_today: number; paused: boolean; expires_at: number };
};

/**
 * Public showcase builds (NEXT_PUBLIC_SNAPSHOT=1) have no agent service behind them. Reads come from
 * /snapshot/*.json, captured from the real agent API against HSK testnet; anything that would sign or
 * pay is refused, because a snapshot cannot move money.
 */
export const SNAPSHOT = process.env.NEXT_PUBLIC_SNAPSHOT === "1";
export const SNAPSHOT_READ_ONLY =
  "This public demo is a read-only snapshot of the live testnet agents. Clone the repo and run scripts\\dev.ps1 to make a real agent-to-agent payment.";

// ---- Replay: on the public build the console walks through a real recorded run, step by step.
// Nothing is signed or paid; every value shown comes from that run's record.
const replays = new Map<string, { rec: Run; stage: number }>();

const TERMS_NAME: Record<string, string> = { PREPAY: "Prepay", NET: "Net 7", CREDIT: "Credit tab" };
const standing = new Map<string, string>();   // replay id -> the agent's current on-chain standing

// The agent's current terms and score, from the snapshot of the live registry.
async function currentStanding(persona: string): Promise<{ terms?: string; score?: number }> {
  const agents = await snapshot<{ personas: Persona[] }>("/agents").catch(() => null);
  const who = agents?.personas.find((a) => a.id === persona);
  if (!who) return {};
  const t = await snapshot<any>(`/agents/${who.address}/trust`).catch(() => null);
  return { terms: t?.terms?.terms, score: t?.trust_score };
}

// A settled recorded run for this agent: same rail, and terms that match the agent's terms today,
// so a replay never shows a seller offering better terms than the agent now has.
async function recordedRun(persona: string, rail: string): Promise<Run> {
  const runs = await snapshot<Run[]>("/a2a/runs");
  const settled = runs.filter((r) => r.persona === persona && r.state === "settled");
  const now = await currentStanding(persona);
  // terms offered on that purchase and the terms it led to both match today's
  const sameTerms = settled.filter((r: any) => !now.terms || (r.terms === now.terms && (r.next_terms?.terms ?? r.terms) === now.terms));
  const hit = sameTerms.find((r) => r.rail === rail) ?? sameTerms[0] ?? settled.find((r) => r.rail === rail) ?? settled[0];
  if (!hit) throw new Error(SNAPSHOT_READ_ONLY);
  return hit;
}

// stage 0: up to the first approval · 1: up to the second · 2: everything (settled)
function replayView(id: string): Run {
  const r = replays.get(id)!;
  const { rec, stage } = r;
  const steps = rec.steps;
  const stop = stage === 0 ? steps.findIndex((s) => s.key === "approve_sign") : stage === 1 ? steps.findIndex((s) => s.key === "approve_submit") : steps.length - 1;
  const shown = steps.slice(0, stop + 1).map((s, i) => (i === stop && stage < 2 ? { ...s, status: "waiting" as const } : s));
  const when = new Date(rec.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const note: Step = {
    key: "replay",
    title: `Replay of a recorded ${rec.rail === "hsp" ? "HSP" : "sandbox"} run`,
    detail: `Read-only showcase: ${rec.persona_name}'s real run from ${when}. Nothing is signed or paid here; every value is from the on-chain record.${standing.get(id) ?? ""}`,
    status: "done",
    data: { run: rec.id },
    at: rec.created_at,
  };
  const state = stage === 0 ? "awaiting_sign_approval" : stage === 1 ? "awaiting_submit_approval" : rec.state;
  return { ...rec, id, state, steps: [note, ...shown] } as Run;
}

async function replay<T>(path: string, init?: RequestInit): Promise<T | undefined> {
  const pre = path.match(/^\/a2a\/preflight\?persona=([^&]+)&rail=([^&]+)/);
  if (pre) {
    const rec = await recordedRun(pre[1], pre[2]);
    return { merchant_name: rec.merchant_name, pay_to: rec.payee, payer: rec.payer, rail: rec.rail, network: "hashkey-testnet", chain_id: 133, agent: "Credence Risk Agent", confirmation_required: true } as T;
  }
  if (path === "/a2a/runs" && init?.method === "POST") {
    const body = JSON.parse(String(init.body ?? "{}"));
    const rec = await recordedRun(body.persona, body.rail);
    const id = `replay-${rec.id}-${replays.size + 1}`;
    replays.set(id, { rec, stage: 0 });
    const now = await currentStanding(body.persona);
    if (now.score != null && now.terms) standing.set(id, ` Today on-chain: trust ${now.score} · ${TERMS_NAME[now.terms] ?? now.terms}.`);
    return replayView(id) as T;
  }
  const act = path.match(/^\/a2a\/runs\/(replay-[^/]+)(?:\/(approve-sign|approve-submit))?$/);
  if (act && replays.has(act[1])) {
    const r = replays.get(act[1])!;
    if (act[2] === "approve-sign") r.stage = Math.max(r.stage, 1);
    if (act[2] === "approve-submit") r.stage = 2;
    return replayView(act[1]) as T;
  }
  return undefined;
}

// Any wallet that isn't one of the four demo agents (a connected wallet, an owner, a merchant):
// read its standing straight from the testnet contracts, so every passport link works on the
// public build. Same shape as the agent service's GET /agents/{address}/trust.
const TESTNET = { rpc: "https://testnet.hsk.xyz", registry: "0x0da11d916c5730E19a48bEc142387bEFDb59A819", policy: "0x7a9559Db3c9846825102c3513AbA2973A1A47BCA" };
async function chainTrust(address: string): Promise<Trust> {
  const { JsonRpcProvider, Contract, getAddress } = await import("ethers");
  const p = new JsonRpcProvider(TESTNET.rpc, 133, { staticNetwork: true });
  const reg = new Contract(TESTNET.registry, [
    "function trustScore(address) view returns (uint256)",
    "function termsFor(address) view returns (uint8, uint256, uint256)",
    "function getStats(address) view returns (uint32, uint32, uint32, uint32, uint128, uint128, uint64, uint64)",
  ], p);
  const pol = new Contract(TESTNET.policy, [
    "function policies(address) view returns (address, uint256, uint256, uint64, bool, bool)",
    "function spentToday(address) view returns (uint256)",
  ], p);
  const a = getAddress(address);
  const [score, [t, limit, netDays], s, [owner, daily, perTx, expires, anyMerchant, paused], spent] = await Promise.all([
    reg.trustScore(a), reg.termsFor(a), reg.getStats(a), pol.policies(a), pol.spentToday(a),
  ]);
  const usd = (v: bigint) => Number(v) / 1e6;
  return {
    address: a,
    trust_score: Number(score),
    terms: { terms: (["PREPAY", "NET", "CREDIT"] as const)[Number(t)], credit_limit: usd(limit), net_days: Number(netDays) },
    stats: {
      settled_count: Number(s[0]), on_time_count: Number(s[1]), late_count: Number(s[2]), default_count: Number(s[3]),
      settled_volume: usd(s[4]), outstanding: usd(s[5]), first_seen_at: Number(s[6]), last_settled_at: Number(s[7]),
    },
    policy: { owner, daily_cap: usd(daily), per_tx_cap: usd(perTx), spent_today: usd(spent), paused, expires_at: Number(expires), any_merchant: anyMerchant },
  } as unknown as Trust;
}

async function snapshot<T>(path: string, init?: RequestInit): Promise<T> {
  const rp = await replay<T>(path, init);
  if (rp !== undefined) return rp;
  const trust = path.match(/^\/agents\/(0x[0-9a-fA-F]{40})\/trust$/);
  if (trust) {
    // the four demo agents come from the snapshot (checksummed file names; links may be lowercase)
    const agents = await fetch("/snapshot/agents.json").then((r) => r.json()).catch(() => null);
    const known = agents?.personas?.find((x: Persona) => x.address.toLowerCase() === trust[1].toLowerCase());
    if (known) { const k = await fetch(`/snapshot/agents__${known.address}__trust.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null); if (k) return k as T; }
    return (await chainTrust(trust[1])) as T;
  }
  if ((init?.method ?? "GET") !== "GET") throw new Error(SNAPSHOT_READ_ONLY);
  const run = path.match(/^\/a2a\/runs\/([^/]+)$/);
  if (run) {
    const runs = await snapshot<Run[]>("/a2a/runs");
    const hit = runs.find((r) => r.id === run[1]);
    if (!hit) throw new Error("Run not in snapshot");
    return hit as T;
  }
  const file = path.replace(/^\//, "").replace(/\//g, "__").replace(/[?=&]/g, "_");
  const res = await fetch(`/snapshot/${file}.json`);
  if (!res.ok) throw new Error(`Not in snapshot: ${path}`);
  return res.json();
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  if (SNAPSHOT) return snapshot<T>(path, init);
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  agentCard: () => req<AgentCard>("/a2a/merchant-card"),
  health: () => req<Record<string, any>>("/health"),
  agents: () => req<{ buyer: string; merchant: string; personas: Persona[] }>("/agents"),
  leaderboard: () => req<LeaderRow[]>("/agents/leaderboard"),
  business: () => req<Business>("/business"),
  catalog: () => req<{ id: string; label: string; price_usd: string }[]>("/catalog"),
  hspStatus: () => req<HspStatus>("/hsp/status"),
  trust: (address: string) => req<Trust>(`/agents/${address}/trust`),
  network: () => req<Business["chain"]>("/network"),
  runs: () => req<Run[]>("/a2a/runs"),
  run: (id: string) => req<Run>(`/a2a/runs/${id}`),
  start: (instruction: string, persona: string, rail: string, confirmed?: Record<string, string>) =>
    req<Run>("/a2a/runs", { method: "POST", body: JSON.stringify({ instruction, persona, rail, confirmed }) }),
  approveSign: (id: string) => req<Run>(`/a2a/runs/${id}/approve-sign`, { method: "POST" }),
  preflight: (persona: string, rail: string) =>
    req<{ merchant_name: string; pay_to: string; payer: string; rail: string; network: string; chain_id: number; agent: string; confirmation_required: boolean }>(
      `/a2a/preflight?persona=${persona}&rail=${rail}`,
    ),
  approveSubmit: (id: string) => req<Run>(`/a2a/runs/${id}/approve-submit`, { method: "POST" }),
};

export const usd = (n: number | string | undefined, digits = 2) =>
  `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
// Tier colours follow the theme (globals.css sets --tier-* for dark and light).
export const TERMS_COLOR: Record<string, string> = { PREPAY: "var(--tier-prepay)", NET: "var(--tier-net)", CREDIT: "var(--tier-credit)" };
// Fixed hex values for places that cannot read CSS variables (chart fills).
export const TERMS_HEX: Record<string, string> = { PREPAY: "#ffb65c", NET: "#5ee7ff", CREDIT: "#f2cd85" };
/** A colour at a given opacity; `a` is a two-digit hex alpha ("14" ≈ 8%). Works for hex and var() colours. */
export const tint = (c: string, a: string) =>
  c.startsWith("#") ? `${c}${a}` : `color-mix(in srgb, ${c} ${((parseInt(a, 16) / 255) * 100).toFixed(1)}%, transparent)`;
export const TERMS_LABEL: Record<string, string> = { PREPAY: "Prepay", NET: "Net 7", CREDIT: "Credit tab" };

export const short = (v?: string | null, n = 6) => (v ? `${v.slice(0, n)}…${v.slice(-4)}` : "—");
export const txUrl = (tx: string) => `${EXPLORER}/tx/${tx}`;
export const addrUrl = (a: string) => `${EXPLORER}/address/${a}`;
