"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ExternalLink, FileText, ListTree, Network, RotateCcw, Workflow } from "lucide-react";
import { ApprovalContent, ConfirmFlow, CountUp, ReportCard, Sheet, Stepper, type Preflight } from "@/components/console/Flow";
import Timeline from "@/components/console/Timeline";
import TrustPanel from "@/components/console/TrustPanel";
import WirePanel from "@/components/console/WirePanel";
import StateBadge from "@/components/StateBadge";
import { AgentAvatar, RailBadge, TermsBadge } from "@/components/ui";
import { API, addrUrl, api, short, usd, type AgentCard, type HspStatus, type LeaderRow, type Run, type Trust } from "@/lib/api";

const BORROWERS = [
  { address: "0x2988f0bE02e1a679430aEb4A6B9B10429F1e8e80", label: "Borrower A" },
  { address: "0x928BA9D30669c41695422a68a1C307a6529F0050", label: "Borrower B" },
];
const PRODUCTS = [
  { id: "risk_report", label: "Risk report", blurb: "Credit score, rating and default probability", price: 2.5, prompt: (w: string) => `Get a risk report on borrower ${w} before we lend. Budget $10.` },
  { id: "trust_attestation", label: "Trust attestation", blurb: "A signed statement of a wallet's standing", price: 1, prompt: (w: string) => `Buy a signed trust attestation for ${w}. Max $5.` },
  { id: "portfolio_scan", label: "Portfolio scan", blurb: "Holdings and counterparty exposure", price: 6, prompt: (w: string) => `Run a portfolio scan on counterparty ${w}, budget $10.` },
];
const POLL_MS = 15_000; // HSP guide: query every 15 s
type Tab = "timeline" | "wire" | "card" | "report";

function Section({ n, title, children, right }: { n: number; title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="mt-12">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-xl font-semibold sm:text-2xl">
          <span className="mr-2 text-faint">{n}</span>{title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function ConsolePage() {
  const [personas, setPersonas] = useState<LeaderRow[]>([]);
  const [persona, setPersona] = useState("nova");
  const [rail, setRail] = useState<"sandbox" | "hsp">("sandbox");
  const [hsp, setHsp] = useState<HspStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [card, setCard] = useState<AgentCard | null>(null);
  const [trust, setTrust] = useState<Trust | null>(null);
  const [prevScore, setPrevScore] = useState<number>();
  const [runs, setRuns] = useState<Run[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [product, setProduct] = useState(PRODUCTS[0]);
  const [target, setTarget] = useState(BORROWERS[0].address);
  const [custom, setCustom] = useState<string | null>(null); // set only when the user edits the instruction
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [pre, setPre] = useState<Preflight | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("timeline");
  const poll = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef<HTMLDivElement>(null);

  const current = personas.find((p) => p.id === persona);

  const refreshAgents = useCallback(async () => {
    const rows = await api.leaderboard().catch(() => null);
    if (rows) setPersonas(rows);
    api.runs().then(setRuns).catch(() => {});
  }, []);

  // Load once the agent service answers; while it is down, show why and retry every 5 s.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const connect = () =>
      api
        .agents()
        .then(() => {
          if (cancelled) return;
          setOffline(false);
          api.hspStatus().then(setHsp).catch(() => setHsp({ reachable: false }));
          api.agentCard().then(setCard).catch(() => {});
          refreshAgents();
        })
        .catch(() => {
          if (cancelled) return;
          setOffline(true);
          timer = setTimeout(connect, 5_000);
        });
    connect();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refreshAgents]);

  useEffect(() => {
    if (current) api.trust(current.address).then(setTrust).catch(() => {});
  }, [current?.address]); // eslint-disable-line react-hooks/exhaustive-deps

  // The instruction follows the chosen product and wallet unless the user has edited it.
  const editing = custom !== null;
  const input = custom ?? product.prompt(target);

  // Poll while a payment is in flight.
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
      setApprovalOpen(next.state === "awaiting_sign_approval" || next.state === "awaiting_submit_approval");
      if (current) api.trust(current.address).then(setTrust).catch(() => {});
      refreshAgents();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function recheckHsp() {
    setChecking(true);
    setHsp(await api.hspStatus().catch(() => ({ reachable: false })));
    setChecking(false);
  }

  const hspBlocked = rail === "hsp" && hsp !== null && !hsp.reachable;

  async function openConfirm() {
    setError(null);
    try {
      setPre(await api.preflight(persona, rail));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function start(confirmed: Record<string, string>) {
    setPre(null);
    setPrevScore(undefined);
    setRun(null);
    setTab("timeline");
    live.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    act(() => api.start(input.trim(), persona, rail, confirmed));
  }

  const approve = () => run && act(() => (run.state === "awaiting_sign_approval" ? api.approveSign(run.id) : api.approveSubmit(run.id)));
  const awaiting = run?.state === "awaiting_sign_approval" || run?.state === "awaiting_submit_approval";

  return (
    <main className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
      {/* header */}
      <header className="pt-14 text-center sm:pt-20">
        <p className="eyebrow text-accent">Agent Console</p>
        <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-semibold sm:text-6xl">One agent buys from another.</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-dim">
          Over A2A, priced by on-chain trust, paid through HSP. You stay in control of every signature.
        </p>
        {card && (
          <a href={addrUrl(card.payment.payTo)} target="_blank" rel="noreferrer" className="chip mt-6 hover:text-ink">
            <span className="size-1.5 rounded-full bg-good" /> Selling: {card.name} · A2A {card.protocolVersion} · {short(card.payment.payTo)}
          </a>
        )}
      </header>

      {offline && (
        <div role="alert" className="mx-auto mt-8 max-w-2xl rounded-2xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
          <div className="font-medium">The agent service is not reachable at {API}.</div>
          <p className="mt-1 text-bad/90">
            Start it from the repository root with{" "}
            <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">powershell -ExecutionPolicy Bypass -File scripts\dev.ps1</code>.
            This page reconnects on its own once it is up.
          </p>
        </div>
      )}
      {error && (
        <div role="alert" className="mx-auto mt-8 max-w-2xl rounded-2xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">{error}</div>
      )}

      {/* 1. buyer */}
      <Section n={1} title="Who is buying?">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Payment agent">
          {(personas.length ? personas : Array.from<LeaderRow | undefined>({ length: 4 })).map((p, i) =>
            p ? (
              <button
                key={p.id}
                role="radio"
                aria-checked={persona === p.id}
                onClick={() => setPersona(p.id)}
                className={`glass glass-hover p-5 text-left ${persona === p.id ? "ring-accent" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <AgentAvatar name={p.name} color={p.color} size={40} />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="truncate text-xs text-faint">{p.tagline}</div>
                  </div>
                </div>
                <div className="mt-5 flex items-end justify-between">
                  <div>
                    <div className="text-[11px] text-faint">Trust</div>
                    <div className="text-3xl font-semibold tabular-nums">{p.trust_score}</div>
                  </div>
                  <TermsBadge terms={p.terms.terms} />
                </div>
              </button>
            ) : (
              <div key={i} className="glass h-[132px] p-5"><div className="shimmer h-full" /></div>
            ),
          )}
        </div>
      </Section>

      {/* 2. product */}
      <Section
        n={2}
        title="What does it need?"
        right={
          <div className="segmented" role="radiogroup" aria-label="Payment rail">
            {(["sandbox", "hsp"] as const).map((r) => (
              <button key={r} role="radio" aria-checked={rail === r} onClick={() => setRail(r)}>
                {r === "sandbox" ? "Sandbox · testnet" : "HSP Agentic Payment"}
              </button>
            ))}
          </div>
        }
      >
        {rail === "hsp" && hsp && (
          hsp.reachable ? (
            <p className="mb-4 flex items-center gap-2 rounded-2xl bg-good/10 px-4 py-3 text-sm text-good">
              <span className="size-2 rounded-full bg-good" /> Connected to HSP Agentic Payment · {hsp.tools?.length ?? 0} tools verified
              {hsp.egress_ip && <span className="ml-auto font-mono text-xs opacity-70">IP {hsp.egress_ip}</span>}
            </p>
          ) : (
            <div role="alert" className="mb-4 rounded-2xl bg-warn/10 px-4 py-3 text-sm text-warn">
              <div className="font-medium">HSP is not accepting this machine right now</div>
              <p className="mt-1 text-warn/90">{hsp.hint ?? "HSP is not reachable from this network."}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {hsp.egress_ip && <span className="rounded-full bg-black/30 px-3 py-1 font-mono text-xs">Your public IP: {hsp.egress_ip}</span>}
                <button onClick={recheckHsp} disabled={checking} className="text-xs font-medium underline">{checking ? "Checking…" : "Check again"}</button>
              </div>
            </div>
          )
        )}
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Product">
          {PRODUCTS.map((p) => (
            <button
              key={p.id}
              role="radio"
              aria-checked={product.id === p.id}
              onClick={() => setProduct(p)}
              className={`glass glass-hover p-5 text-left ${product.id === p.id ? "ring-accent" : ""}`}
            >
              <div className="font-medium">{p.label}</div>
              <div className="mt-1 text-xs text-dim">{p.blurb}</div>
              <div className="mt-4 text-2xl font-semibold">{usd(p.price)}<span className="text-sm font-normal text-faint"> / wallet</span></div>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-dim">About</span>
          {BORROWERS.map((b) => (
            <button
              key={b.address}
              onClick={() => setTarget(b.address)}
              aria-pressed={target === b.address}
              className={`rounded-full px-3 py-1.5 text-xs transition ${target === b.address ? "bg-white text-black" : "bg-white/[0.07] text-dim hover:text-ink"}`}
            >
              {b.label} · <span className="font-mono">{short(b.address)}</span>
            </button>
          ))}
          <button onClick={() => setCustom(editing ? null : input)} aria-expanded={editing} className="ml-auto flex items-center gap-1 text-xs text-accent">
            {editing ? "Use the suggested instruction" : "Edit the instruction"} <ChevronDown className={`size-3.5 transition ${editing ? "rotate-180" : ""}`} />
          </button>
        </div>
        {editing ? (
          <textarea
            aria-label="Instruction to the payment agent"
            value={input}
            onChange={(e) => setCustom(e.target.value)}
            rows={2}
            className="mt-3 w-full resize-none rounded-2xl border border-line bg-white/[0.04] px-4 py-3 text-sm outline-none focus:border-accent"
          />
        ) : (
          <p className="mt-3 rounded-2xl bg-white/[0.03] px-4 py-3 text-sm text-dim">&ldquo;{input}&rdquo;</p>
        )}

        <div className="mt-8 flex flex-col items-center gap-3">
          <button onClick={openConfirm} disabled={busy || !personas.length || !input.trim() || hspBlocked} className="btn-primary px-8 py-3 text-base">
            Continue <ArrowRight className="size-4" />
          </button>
          <span className="text-xs text-faint">
            {hspBlocked ? "Switch to the sandbox rail, or wait until HSP accepts this machine." : "Next: confirm team, recipient and payer. Nothing is signed yet."}
          </span>
        </div>
      </Section>

      {/* 3. live */}
      <div ref={live} className="scroll-mt-16" />
      {(run || busy) && (
        <Section
          n={3}
          title="Live"
          right={run && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StateBadge state={run.state} />
              <RailBadge rail={run.rail} />
              {run.total_usd && <span className="font-mono text-dim">{usd(run.total_usd)}</span>}
            </div>
          )}
        >
          <div className="glass p-6 sm:p-8">
            <Stepper run={run} busy={busy} />

            {awaiting && run && !approvalOpen && (
              <div className="rise mt-8 flex flex-col items-center justify-between gap-3 rounded-2xl bg-accent/10 px-5 py-4 sm:flex-row">
                <span className="text-sm">
                  <span className="mr-2 inline-block size-2 rounded-full bg-accent pulse" />
                  Waiting for your approval to {run.state === "awaiting_sign_approval" ? "sign" : "submit"}.
                </span>
                <button onClick={() => setApprovalOpen(true)} className="btn-primary py-2">Review</button>
              </div>
            )}

            {run?.state === "settled" && run.trust_after !== undefined && (
              <div className="rise mt-8 grid items-center gap-6 rounded-3xl bg-gradient-to-br from-good/15 via-white/[0.02] to-accent/10 p-6 text-center sm:grid-cols-3 sm:text-left">
                <div>
                  <div className="text-sm text-dim">Settled and verified</div>
                  <div className="mt-1 text-lg font-semibold">The receiving agent checked the rail itself, then recorded it on-chain.</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-dim">Trust</div>
                  <div className="text-6xl font-semibold tracking-tight tabular-nums">
                    <CountUp from={run.trust_before ?? 0} to={run.trust_after} />
                  </div>
                  <div className="pop mt-1 text-sm font-medium text-good">+{run.trust_after - (run.trust_before ?? 0)}</div>
                </div>
                <div className="text-center sm:text-right">
                  <div className="text-xs text-dim">Next order</div>
                  <div className="mt-2"><TermsBadge terms={run.next_terms?.terms} /></div>
                  <button onClick={() => { setRun(null); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="link mt-4 text-sm">
                    <RotateCcw className="size-3.5" /> Buy again
                  </button>
                </div>
              </div>
            )}

            <div className="mt-8 flex justify-center">
              <div className="segmented" role="tablist">
                {([
                  ["timeline", "Timeline", ListTree],
                  ["wire", `A2A wire${run?.wire?.length ? ` (${run.wire.length})` : ""}`, Workflow],
                  ["card", "Agent Card", Network],
                  ["report", "Report", FileText],
                ] as const).map(([id, label, Icon]) => (
                  <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="flex items-center gap-1.5">
                    <Icon className="size-3.5" /> <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6">
              {tab === "timeline" && (run ? <Timeline run={run} /> : <div className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="shimmer h-12" />)}</div>)}
              {tab === "wire" && <WirePanel wire={run?.wire} />}
              {tab === "card" && (card ? <pre className="code-surface max-h-[520px] overflow-auto p-4 text-dim">{JSON.stringify(card, null, 2)}</pre> : <p className="py-8 text-center text-sm text-faint">Agent Card unavailable.</p>)}
              {tab === "report" && (run?.report ? <ReportCard report={run.report} /> : <p className="py-8 text-center text-sm text-faint">The result report appears once the payment is submitted and queried.</p>)}
            </div>
          </div>

          {run?.reports && run.reports.length > 0 && (
            <div className="glass rise mt-4 p-6">
              <div className="text-sm font-semibold">Delivered over A2A</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {run.reports.map((r) => (
                  <div key={r.wallet} className="rounded-2xl bg-white/[0.04] p-4">
                    <a href={addrUrl(r.wallet)} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-mono text-xs text-dim hover:text-ink">
                      {short(r.wallet, 10)} <ExternalLink className="size-3" />
                    </a>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-4xl font-semibold tabular-nums">{r.credit_score}</span>
                      <span className="text-xs text-dim">{r.rating?.replaceAll("_", " ")}</span>
                    </div>
                    <div className="mt-1 text-xs text-faint">Default probability {r.probability_of_default}% · {r.segment}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* trust + history */}
      <Section n={run || busy ? 4 : 3} title={current ? `${current.name}'s standing` : "Standing"}>
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <TrustPanel trust={trust} previous={prevScore} />
          <div className="glass p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Recent runs</div>
              <Link href="/settlements" className="link text-xs">All</Link>
            </div>
            <ul className="mt-3 space-y-0.5">
              {runs.length === 0 && <li className="text-xs text-faint">No runs yet</li>}
              {runs.slice(0, 8).map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => { setRun(r); setTab("timeline"); live.current?.scrollIntoView({ behavior: "smooth" }); }}
                    className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs hover:bg-white/5"
                  >
                    <StateBadge state={r.state} />
                    <span className="truncate text-dim">{r.persona_name ?? "—"}</span>
                    <span className="ml-auto shrink-0 font-mono text-faint">{r.total_usd ? usd(r.total_usd) : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Sheet open={!!pre} onClose={() => setPre(null)} label="Confirm payment details">
        {pre && <ConfirmFlow pre={pre} onDone={start} />}
      </Sheet>
      <Sheet open={approvalOpen && !!run && awaiting} onClose={() => setApprovalOpen(false)} label="Approve payment">
        {run && <ApprovalContent run={run} busy={busy} onApprove={approve} onLater={() => setApprovalOpen(false)} />}
      </Sheet>
    </main>
  );
}
