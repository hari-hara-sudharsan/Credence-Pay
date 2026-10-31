export const API = process.env.NEXT_PUBLIC_AGENT_API ?? "http://localhost:8000";
export const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER ?? "https://testnet-explorer.hsk.xyz";

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

async function req<T>(path: string, init?: RequestInit): Promise<T> {
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
  health: () => req<Record<string, any>>("/health"),
  agents: () => req<{ buyer: string; merchant: string; personas: Persona[] }>("/agents"),
  leaderboard: () => req<LeaderRow[]>("/agents/leaderboard"),
  business: () => req<Business>("/business"),
  catalog: () => req<{ id: string; label: string; price_usd: string }[]>("/catalog"),
  hspStatus: () => req<{ reachable: boolean; reason?: string; tools?: string[] }>("/hsp/status"),
  trust: (address: string) => req<Trust>(`/agents/${address}/trust`),
  network: () => req<Business["chain"]>("/network"),
  runs: () => req<Run[]>("/a2a/runs"),
  run: (id: string) => req<Run>(`/a2a/runs/${id}`),
  start: (instruction: string, persona: string, rail: string) =>
    req<Run>("/a2a/runs", { method: "POST", body: JSON.stringify({ instruction, persona, rail }) }),
  approveSign: (id: string) => req<Run>(`/a2a/runs/${id}/approve-sign`, { method: "POST" }),
  approveSubmit: (id: string) => req<Run>(`/a2a/runs/${id}/approve-submit`, { method: "POST" }),
};

export const usd = (n: number | string | undefined, digits = 2) =>
  `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
export const TERMS_COLOR: Record<string, string> = { PREPAY: "#ffbf5c", NET: "#7aa7ff", CREDIT: "#3ee6b0" };
export const TERMS_LABEL: Record<string, string> = { PREPAY: "Prepay", NET: "Net 7", CREDIT: "Credit tab" };

export const short = (v?: string | null, n = 6) => (v ? `${v.slice(0, n)}…${v.slice(-4)}` : "—");
export const txUrl = (tx: string) => `${EXPLORER}/tx/${tx}`;
export const addrUrl = (a: string) => `${EXPLORER}/address/${a}`;
