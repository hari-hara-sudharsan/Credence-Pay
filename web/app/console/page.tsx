"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bot, ExternalLink, Play, Store } from "lucide-react";
import ApprovalCard from "@/components/console/ApprovalCard";
import Timeline from "@/components/console/Timeline";
import TrustPanel from "@/components/console/TrustPanel";
import StateBadge from "@/components/StateBadge";
import { AgentAvatar, RailBadge, TermsBadge } from "@/components/ui";
import { addrUrl, api, short, usd, type LeaderRow, type Run, type Trust } from "@/lib/api";

const BORROWERS = ["0x2988f0bE02e1a679430aEb4A6B9B10429F1e8e80", "0x928BA9D30669c41695422a68a1C307a6529F0050"];
const PRODUCTS = [
  { id: "risk_report", label: "Wallet risk report", price: 2.5, prompt: (w: string) => `Get a risk report on borrower ${w} before we lend. Budget $10.` },
  { id: "trust_attestation", label: "Trust attestation", price: 1, prompt: (w: string) => `Buy a signed trust attestation for ${w}. Max $5.` },
  { id: "portfolio_scan", label: "Portfolio scan", price: 6, prompt: (w: string) => `Run a portfolio scan on counterparty ${w}, budget $10.` },
];
const POLL_MS = 15_000;

export default function ConsolePage() {
  const [personas, setPersonas] = useState<LeaderRow[]>([]);
  const [persona, setPersona] = useState("nova");
  const [merchant, setMerchant] = useState<string>();
  const [rail, setRail] = useState<"sandbox" | "hsp">("sandbox");
  const [hsp, setHsp] = useState<{ reachable: boolean; reason?: string } | null>(null);
  const [trust, setTrust] = useState<Trust | null>(null);
  const [prevScore, setPrevScore] = useState<number>();
  const [runs, setRuns] = useState<Run[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [product, setProduct] = useState(PRODUCTS[0]);
  const [input, setInput] = useState(PRODUCTS[0].prompt(BORROWERS[0]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = personas.find((p) => p.id === persona);

  const refreshAgents = useCallback(async () => {
    const rows = await api.leaderboard().catch(() => null);
    if (rows) setPersonas(rows);
    api.runs().then(setRuns).catch(() => {});
  }, []);

  useEffect(() => {
    api.agents().then((a) => setMerchant(a.merchant)).catch(() => setError("Agent service unreachable. Start it with scripts\\dev.ps1"));
    api.hspStatus().then(setHsp).catch(() => setHsp({ reachable: false }));
    refreshAgents();
  }, [refreshAgents]);

  useEffect(() => {
    if (current) api.trust(current.address).then(setTrust).catch(() => {});
  }, [current?.address]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll settlement status while a payment is in flight (HSP guide: every 15 s).
  useEffect(() => {
    if (poll.current) clearTimeout(poll.current);
    if (run?.state !== "settling") return;
    poll.current = setTimeout(async () => {
      const next = await api.run(run.id).catch(() => run);
      setRun(next);
      if (next.state === "settled") {
        setPrevScore(next.trust_before);
        if (current) api.trust(current.address).then(setTrust).catch(() => {});
        refreshAgents();
      }
    }, run.rail === "sandbox" ? 3_000 : POLL_MS);
    return () => {
      if (poll.current) clearTimeout(poll.current);
    };
  }, [run, current, refreshAgents]);

  async function act(fn: () => Promise<Run>) {
    setBusy(true);
    setError(null);
    try {
      const next = await fn();
      setRun(next);
      if (current) api.trust(current.address).then(setTrust).catch(() => {});
      refreshAgents();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const start = () => {
    setPrevScore(undefined);
    act(() => api.start(input.trim(), persona, rail));
  };
  const approve = () =>
    run && act(() => (run.state === "awaiting_sign_approval" ? api.approveSign(run.id) : api.approveSubmit(run.id)));

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow text-accent">Agent Console</div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Run an agent-to-agent purchase</h1>
          <p className="mt-1 text-sm text-dim">Pick a payment agent, choose what it buys, approve, and watch trust and terms change on-chain.</p>
        </div>
        <a href={merchant ? addrUrl(merchant) : undefined} target="_blank" rel="noreferrer" className="glass glass-hover flex items-center gap-3 px-4 py-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-accent-2/15 text-accent-2"><Store className="size-4" /></span>
          <span className="text-xs">
            <span className="block text-faint">Receiving agent</span>
            <span className="font-medium">Credence Risk Agent</span> <span className="font-mono text-dim">{short(merchant)}</span>
          </span>
        </a>
      </header>

      {error && <div className="mt-4 rounded-xl border border-bad/40 bg-bad/10 px-4 py-2.5 text-sm text-bad">{error}</div>}

      {/* agent picker */}
      <section className="mt-8">
        <div className="eyebrow">1 · Payment agent</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(personas.length ? personas : Array.from<LeaderRow | undefined>({ length: 4 })).map((p, i) =>
            p ? (
              <button
                key={p.id}
                onClick={() => setPersona(p.id)}
                className={`glass glass-hover p-4 text-left ${persona === p.id ? "ring-accent" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <AgentAvatar name={p.name} color={p.color} size={36} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="truncate text-[11px] text-faint">{p.tagline}</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-display text-xl font-semibold tabular-nums">{p.trust_score}</span>
                  <TermsBadge terms={p.terms.terms} />
                </div>
              </button>
            ) : (
              <div key={i} className="glass h-[108px] p-4"><div className="shimmer h-full" /></div>
            ),
          )}
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* order */}
          <section className="glass p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="eyebrow">2 · What to buy</div>
              <div className="flex rounded-xl border border-line p-1 text-xs" role="radiogroup" aria-label="Payment rail">
                {(["sandbox", "hsp"] as const).map((r) => (
                  <button
                    key={r}
                    role="radio"
                    aria-checked={rail === r}
                    onClick={() => setRail(r)}
                    className={`rounded-lg px-3 py-1.5 transition ${rail === r ? "bg-white/10 text-ink" : "text-dim hover:text-ink"}`}
                  >
                    {r === "sandbox" ? "Sandbox rail · testnet" : "HSP Agentic Payment"}
                  </button>
                ))}
              </div>
            </div>
            {rail === "hsp" && hsp && !hsp.reachable && (
              <p className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-warn">
                HSP is not reachable from this server yet. It needs IP allowlisting by HSP Operations; until then, use the sandbox rail.
              </p>
            )}
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {PRODUCTS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setProduct(p);
                    setInput(p.prompt(BORROWERS[0]));
                  }}
                  className={`rounded-xl border p-3 text-left transition ${product.id === p.id ? "border-accent/60 bg-accent/5" : "border-line hover:border-line-strong"}`}
                >
                  <div className="text-sm font-medium">{p.label}</div>
                  <div className="mt-0.5 font-display text-lg font-semibold">{usd(p.price)}</div>
                </button>
              ))}
            </div>
            <label htmlFor="instruction" className="mt-4 flex items-center gap-2 text-xs text-dim">
              <Bot className="size-3.5" /> Instruction to {current?.name ?? "the payment agent"}
            </label>
            <textarea
              id="instruction"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={2}
              className="mt-2 w-full resize-none rounded-xl border border-line bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-accent/60"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-faint">The agent only uses wallet addresses that appear in the instruction.</span>
              <button onClick={start} disabled={busy || !personas.length || !input.trim()} className="btn-primary">
                <Play className="size-4" /> {busy && !run ? "Negotiating…" : "Run purchase"}
              </button>
            </div>
          </section>

          {/* timeline */}
          <section className="glass min-h-80 p-6">
            {!run && !busy && (
              <div className="grid h-64 place-items-center text-center">
                <div>
                  <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent/10 text-accent"><Play className="size-5" /></div>
                  <p className="mt-4 text-sm text-dim">Each verified step appears here with its identifiers and transaction links.</p>
                  <p className="mt-1 text-xs text-faint">You approve twice: before signing and before submission.</p>
                </div>
              </div>
            )}
            {busy && !run && (
              <div className="space-y-4">
                {[0, 1, 2, 3].map((i) => <div key={i} className="shimmer h-12" />)}
              </div>
            )}
            {run && (
              <div className="grid gap-6 md:grid-cols-[1fr_280px]">
                <div>
                  <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-dim">
                    <StateBadge state={run.state} />
                    <RailBadge rail={run.rail} />
                    {run.persona_name && <span className="text-ink">{run.persona_name}</span>}
                    {run.total_usd && <span className="font-mono">{usd(run.total_usd)}</span>}
                  </div>
                  <Timeline run={run} />
                </div>
                <div className="space-y-4">
                  <ApprovalCard run={run} busy={busy} onApprove={approve} />
                  {run.state === "settled" && run.next_terms && (
                    <div className="rise glass ring-accent p-5 text-center">
                      <div className="eyebrow">Trust updated on-chain</div>
                      <div className="mt-2 font-display text-3xl font-semibold">
                        {run.trust_before} <ArrowRight className="inline size-5 text-accent" /> <span className="text-accent">{run.trust_after}</span>
                      </div>
                      <div className="mt-3 text-xs text-dim">Next order terms</div>
                      <div className="mt-1"><TermsBadge terms={run.next_terms.terms} /></div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {run?.reports && run.reports.length > 0 && (
            <section className="glass p-6">
              <div className="eyebrow">Delivered goods · live wallet risk reports</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {run.reports.map((r) => (
                  <div key={r.wallet} className="rounded-xl border border-line bg-white/[0.02] p-4">
                    <a href={addrUrl(r.wallet)} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-mono text-xs text-dim hover:text-ink">
                      {short(r.wallet, 10)} <ExternalLink className="size-3" />
                    </a>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="font-display text-3xl font-semibold tabular-nums">{r.credit_score}</span>
                      <span className="text-xs text-dim">{r.rating?.replaceAll("_", " ")}</span>
                    </div>
                    <div className="mt-1 text-xs text-faint">Default probability {r.probability_of_default}% · {r.segment}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <TrustPanel trust={trust} previous={prevScore} />
          <section className="glass p-5">
            <div className="flex items-center justify-between">
              <div className="eyebrow">Recent runs</div>
              <Link href="/settlements" className="text-xs text-accent hover:underline">All →</Link>
            </div>
            <ul className="mt-3 space-y-1">
              {runs.length === 0 && <li className="text-xs text-faint">No runs yet</li>}
              {runs.slice(0, 7).map((r) => (
                <li key={r.id}>
                  <button onClick={() => setRun(r)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-white/5">
                    <StateBadge state={r.state} />
                    <span className="truncate text-dim">{r.persona_name ?? "—"}</span>
                    <span className="ml-auto shrink-0 font-mono text-faint">{r.total_usd ? usd(r.total_usd) : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
