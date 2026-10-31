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

export type Run = {
  id: string;
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
  agents: () => req<{ buyer: string; merchant: string }>("/agents"),
  trust: (address: string) => req<Trust>(`/agents/${address}/trust`),
  network: () => req<{ total_settled: number; total_volume: number }>("/network"),
  runs: () => req<Run[]>("/a2a/runs"),
  run: (id: string) => req<Run>(`/a2a/runs/${id}`),
  start: (instruction: string) => req<Run>("/a2a/runs", { method: "POST", body: JSON.stringify({ instruction }) }),
  approveSign: (id: string) => req<Run>(`/a2a/runs/${id}/approve-sign`, { method: "POST" }),
  approveSubmit: (id: string) => req<Run>(`/a2a/runs/${id}/approve-submit`, { method: "POST" }),
};

export const short = (v?: string | null, n = 6) => (v ? `${v.slice(0, n)}…${v.slice(-4)}` : "—");
export const txUrl = (tx: string) => `${EXPLORER}/tx/${tx}`;
export const addrUrl = (a: string) => `${EXPLORER}/address/${a}`;
