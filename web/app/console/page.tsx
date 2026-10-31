"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ApprovalCard from "@/components/console/ApprovalCard";
import Timeline from "@/components/console/Timeline";
import TrustPanel from "@/components/console/TrustPanel";
import StateBadge from "@/components/StateBadge";
import { addrUrl, api, short, type Run, type Trust } from "@/lib/api";

const SAMPLE_WALLET = "0x2988f0bE02e1a679430aEb4A6B9B10429F1e8e80";
const PROMPTS = [
  `Get a risk report on borrower ${SAMPLE_WALLET} before we lend. Budget $1.`,
  `Buy risk reports for ${SAMPLE_WALLET} and 0x928BA9D30669c41695422a68a1C307a6529F0050, max $0.50`,
];
const POLL_MS = 15_000;

export default function ConsolePage() {
  const [agents, setAgents] = useState<{ buyer: string; merchant: string } | null>(null);
  const [trust, setTrust] = useState<Trust | null>(null);
  const [prevScore, setPrevScore] = useState<number>();
  const [runs, setRuns] = useState<Run[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [input, setInput] = useState(PROMPTS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadTrust = useCallback(async (buyer: string) => {
    try {
      setTrust(await api.trust(buyer));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    api
      .agents()
      .then((a) => {
        setAgents(a);
        if (a.buyer) loadTrust(a.buyer);
      })
      .catch(() => setError("Agent service unreachable. Start it with: uvicorn app.main:app --port 8000"));
    api.runs().then(setRuns).catch(() => {});
  }, [loadTrust]);

  // Poll HSP status for a submitted payment, per the HSP guide's 15 s cadence.
  useEffect(() => {
    if (poll.current) clearTimeout(poll.current);
    if (run?.state !== "settling") return;
    poll.current = setTimeout(async () => {
      const next = await api.run(run.id).catch(() => run);
      setRun(next);
      if (next.state === "settled" && agents?.buyer) {
        setPrevScore(next.trust_before);
        loadTrust(agents.buyer);
        api.runs().then(setRuns).catch(() => {});
      }
    }, POLL_MS);
    return () => {
      if (poll.current) clearTimeout(poll.current);
    };
  }, [run, agents, loadTrust]);

  async function act(fn: () => Promise<Run>) {
    setBusy(true);
    setError(null);
    try {
      const next = await fn();
      setRun(next);
      if (agents?.buyer) loadTrust(agents.buyer);
      api.runs().then(setRuns).catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const start = () => input.trim() && act(() => api.start(input.trim()));
  const approve = () =>
    run && act(() => (run.state === "awaiting_sign_approval" ? api.approveSign(run.id) : api.approveSubmit(run.id)));

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Agent Console</h1>
          <p className="text-sm text-dim">A lending agent buys risk intelligence from the Credence Risk Agent, settled through HSP.</p>
        </div>
        <div className="flex gap-2 text-xs">
          <AgentPill role="Payment agent" name="Lending Agent" address={agents?.buyer} />
          <AgentPill role="Receiving agent" name="Credence Risk Agent" address={agents?.merchant} />
        </div>
      </header>

      {error && (
        <div className="mt-4 rounded-lg border border-bad/40 bg-bad/10 px-4 py-2 text-sm text-bad">{error}</div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <section className="panel p-4">
            <label htmlFor="instruction" className="text-xs font-medium tracking-wide text-dim uppercase">
              Instruct the payment agent
            </label>
            <textarea
              id="instruction"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={2}
              className="mt-2 w-full resize-none rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent/60"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {PROMPTS.map((p, i) => (
                <button key={i} onClick={() => setInput(p)} className="rounded-md border border-line px-2 py-1 text-xs text-dim hover:text-ink">
                  Example {i + 1}
                </button>
              ))}
              <button
                onClick={start}
                disabled={busy || !agents}
                className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-50"
              >
                {busy && !run ? "Starting…" : "Run purchase"}
              </button>
            </div>
          </section>

          <section className="panel min-h-72 p-5">
            {!run && !busy && (
              <div className="grid h-60 place-items-center text-center text-sm text-dim">
                <div>
                  <p>Each step of the agent-to-agent payment appears here with its HSP identifiers and transaction links.</p>
                  <p className="mt-1 text-faint">You approve twice: before signing and before submission.</p>
                </div>
              </div>
            )}
            {busy && !run && <p className="pulse text-sm text-dim">Agents negotiating with HSP…</p>}
            {run && (
              <div className="grid gap-5 md:grid-cols-[1fr_260px]">
                <div>
                  <div className="mb-4 flex items-center gap-2 text-xs text-dim">
                    <StateBadge state={run.state} />
                    <span className="truncate">“{run.instruction}”</span>
                  </div>
                  <Timeline run={run} />
                </div>
                <div className="space-y-4">
                  <ApprovalCard run={run} busy={busy} onApprove={approve} />
                  {run.state === "settled" && run.next_terms && (
                    <div className="rise rounded-xl border border-accent/40 bg-accent/5 p-4 text-sm">
                      <div className="font-medium text-accent">Trust {run.trust_before} → {run.trust_after}</div>
                      <p className="mt-1 text-dim">Next order terms: <span className="text-ink">{run.next_terms.terms}</span></p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {run?.reports && run.reports.length > 0 && (
            <section className="panel p-5">
              <h2 className="text-xs font-medium tracking-wide text-dim uppercase">Delivered goods: wallet risk reports</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {run.reports.map((r) => (
                  <div key={r.wallet} className="rounded-lg border border-line p-3">
                    <div className="font-mono text-xs text-dim">{short(r.wallet, 10)}</div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-semibold tabular-nums">{r.credit_score}</span>
                      <span className="text-xs text-dim">{r.rating}</span>
                    </div>
                    <div className="mt-1 text-xs text-faint">
                      PD {r.probability_of_default}% · {r.segment}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <TrustPanel trust={trust} previous={prevScore} />
          <section className="panel p-4">
            <h3 className="text-xs font-medium tracking-wide text-dim uppercase">Recent runs</h3>
            <ul className="mt-2 space-y-1">
              {runs.length === 0 && <li className="text-xs text-faint">No runs yet</li>}
              {runs.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setRun(r)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-panel-2"
                  >
                    <StateBadge state={r.state} />
                    <span className="truncate text-dim">{r.terms ?? "—"}</span>
                    <span className="ml-auto text-faint">{new Date(r.created_at).toLocaleTimeString()}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Link href="/settlements" className="mt-2 block text-xs text-accent hover:underline">
              All settlements →
            </Link>
          </section>
        </aside>
      </div>
    </main>
  );
}

function AgentPill({ role, name, address }: { role: string; name: string; address?: string }) {
  return (
    <a
      href={address ? addrUrl(address) : undefined}
      target="_blank"
      rel="noreferrer"
      className="panel flex flex-col px-3 py-1.5 hover:border-accent/40"
    >
      <span className="text-faint">{role}</span>
      <span>
        {name} <span className="font-mono text-dim">{short(address)}</span>
      </span>
    </a>
  );
}
