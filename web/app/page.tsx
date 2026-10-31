"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Coins, Fingerprint, Landmark, Lock, Network, ShieldCheck, Sparkles, TrendingUp, Users, Workflow, Zap } from "lucide-react";
import HeroDiagram from "@/components/HeroDiagram";
import { AgentAvatar, SectionHead, TermsBadge, TrustBar } from "@/components/ui";
import { api, short, txUrl, usd, type Business, type LeaderRow, type Run } from "@/lib/api";

const A2A_MESSAGES = [
  { dir: "out", label: "GET /.well-known/agent-card.json", body: "Discover the Risk Agent: skills, AP2 extension, HSP pay-to", icon: Network },
  { dir: "out", label: "IntentMandate + QuoteRequest + IdentityProof", body: "The payment agent proves it owns its wallet with a signature", icon: Fingerprint },
  { dir: "in", label: "Task · input-required · CartMandate + Terms", body: "Priced from on-chain trust. The receiving agent creates the HSP order", icon: ShieldCheck },
  { dir: "out", label: "PaymentMandate", body: "Signed EIP-712, submitted to HSP after two human approvals", icon: Workflow },
  { dir: "in", label: "Task · completed · Receipt + Goods", body: "The receiving agent re-checks the rail itself, anchors on-chain, then delivers", icon: Coins },
] as const;

type Proof = { label: string; tx: string; who: string };

function proofsFrom(runs: Run[]): Proof[] {
  const labels: Record<string, string> = { anchor: "Settlement anchored", tab: "Credit tab opened", settled: "Payment settled" };
  const out: Proof[] = [];
  for (const r of runs) {
    for (const st of r.steps) {
      const tx = st.data?.tx as string | undefined;
      if (tx && tx.length === 66 && labels[st.key] && !out.some((o) => o.tx === tx)) out.push({ label: labels[st.key], tx, who: r.persona_name ?? "agent" });
    }
    if (out.length >= 14) break;
  }
  return out;
}

const STEPS = [
  { icon: Sparkles, title: "Intent", body: "The payment agent is told what to buy and its budget, in plain language." },
  { icon: ShieldCheck, title: "Trust check", body: "The receiving agent reads the payer's on-chain record and sets the terms." },
  { icon: Coins, title: "Cart Mandate over A2A", body: "The receiving agent sends its payment conditions as an AP2 Cart Mandate backed by an HSP order." },
  { icon: Lock, title: "Policy + approval", body: "The owner's on-chain limits are checked, then a human approves twice." },
  { icon: Zap, title: "Settle", body: "EIP-712 authorisation, settled through HSP on HSK Chain." },
  { icon: TrendingUp, title: "Remember", body: "Credence anchors the payment; trust and future terms update." },
];

export default function Home() {
  const [stats, setStats] = useState<Business | null>(null);
  const [agents, setAgents] = useState<LeaderRow[]>([]);
  const [proofs, setProofs] = useState<Proof[]>([]);

  useEffect(() => {
    api.business().then(setStats).catch(() => {});
    api.leaderboard().then(setAgents).catch(() => {});
    api.runs().then((runs) => setProofs(proofsFrom(runs))).catch(() => {});
  }, []);

  return (
    <main>
      {/* hero */}
      <section className="relative">
        <div className="grid-bg absolute inset-0 -z-10" />
        <div className="mx-auto max-w-5xl px-4 pt-20 pb-16 text-center sm:px-6 sm:pt-28">
          <div className="rise">
            <span className="chip">
              <span className="size-1.5 rounded-full bg-good" /> A2A · AP2 mandates · HSP Agentic Payment · HSK Chain
            </span>
            <h1 className="mt-7 text-5xl leading-[1.04] font-semibold sm:text-8xl">
              <span className="text-silver">Credit terms</span>
              <br />
              <span className="text-gradient">for AI agents.</span>
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-dim sm:text-xl">
              HSP lets agents pay each other. Credence decides on what terms. Every settlement becomes on-chain trust, so reliable agents move from
              prepay to net terms to credit, inside limits their owners set.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
              <Link href="/console" className="btn-primary px-7 py-3 text-base">
                Run a live purchase
              </Link>
              <Link href="/business" className="link text-base">
                See the business <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
          <dl className="rise mx-auto mt-16 grid max-w-3xl grid-cols-3 divide-x divide-line" style={{ animationDelay: "120ms" }}>
            {[
              ["Settlements on-chain", stats ? stats.chain.total_settled : "—"],
              ["Volume settled", stats ? usd(stats.chain.total_volume) : "—"],
              ["Fees earned on-chain", stats ? usd(stats.credence_fees_usd, 3) : "—"],
            ].map(([k, v]) => (
              <div key={k as string} className="px-2">
                <dd className="text-3xl font-semibold tabular-nums sm:text-5xl">{v}</dd>
                <dt className="mt-2 text-xs text-faint sm:text-sm">{k}</dt>
              </div>
            ))}
          </dl>
          <div className="rise mx-auto mt-16 max-w-3xl" style={{ animationDelay: "220ms" }}>
            <HeroDiagram />
          </div>
        </div>
      </section>

      {/* live proof strip */}
      {proofs.length > 0 && (
        <section aria-label="Recent on-chain transactions" className="border-y border-line bg-white/[0.015]">
          <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 sm:px-6">
            <span className="flex shrink-0 items-center gap-2 py-3 text-[11px] font-medium tracking-wide text-accent uppercase">
              <span className="size-1.5 rounded-full bg-accent pulse" /> Verified on-chain
            </span>
            <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_6%,black_94%,transparent)]">
              <div className="marquee flex w-max gap-8 py-3">
                {[...proofs, ...proofs].map((p, i) => (
                  <a key={i} href={txUrl(p.tx)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs whitespace-nowrap text-dim hover:text-ink">
                    <span className="text-ink">{p.label}</span>
                    <span className="text-faint">{p.who}</span>
                    <span className="font-mono text-accent-2">{short(p.tx, 8)}</span>
                    <ArrowUpRight className="size-3 text-faint" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* A2A protocol */}
      <section className="mx-auto max-w-7xl px-4 pt-20 pb-4 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:items-center">
          <div>
            <div className="eyebrow text-accent">Real agent-to-agent, not a function call</div>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Two agents. One protocol. <span className="text-gradient">Zero blind trust.</span>
            </h2>
            <p className="mt-4 text-dim">
              The Credence Risk Agent is a standalone A2A server. Any A2A-compliant agent can discover it from its Agent Card and buy from it with AP2
              mandates. Payment conditions travel as a Cart Mandate, and the payment agent answers with a signed Payment Mandate settled through HSP.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-dim">
              <li className="flex gap-2"><Fingerprint className="mt-0.5 size-4 shrink-0 text-accent" /> No impersonation: credit terms need a signature from the payer&apos;s own wallet.</li>
              <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" /> No taking the payer&apos;s word: the receiving agent checks HSP itself before goods ship.</li>
              <li className="flex gap-2"><Lock className="mt-0.5 size-4 shrink-0 text-accent" /> Humans stay in control: an on-chain spending policy and two approvals for every payment.</li>
            </ul>
            <Link href="/console" className="btn-ghost mt-7">Watch the wire in the console <ArrowRight className="size-4" /></Link>
          </div>
          <ol className="glass hairline relative space-y-2 p-5 sm:p-6">
            <li className="mb-3 flex items-center justify-between text-[11px] text-faint">
              <span className="font-medium text-info">Payment agent</span>
              <span className="font-mono">JSON-RPC 2.0 · A2A 0.3</span>
              <span className="font-medium text-accent">Receiving agent</span>
            </li>
            {A2A_MESSAGES.map(({ dir, label, body, icon: Icon }, i) => (
              <li key={label} className={`rise flex ${dir === "in" ? "justify-end" : ""}`} style={{ animationDelay: `${i * 90}ms` }}>
                <div className={`max-w-[88%] rounded-2xl border px-4 py-3 ${dir === "out" ? "rounded-tl-sm border-info/25 bg-info/[0.06]" : "rounded-tr-sm border-accent/25 bg-accent/[0.06]"}`}>
                  <div className="flex items-center gap-2 font-mono text-[11.5px] break-all text-ink">
                    <Icon className={`size-3.5 shrink-0 ${dir === "out" ? "text-info" : "text-accent"}`} /> {label}
                  </div>
                  <div className="mt-1 text-xs text-dim">{body}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* problem */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <SectionHead eyebrow="The problem" title="Every agent is a stranger." body="When two AI agents trade, the seller has no way to know whether the buyer will pay." />
          </div>
          {[
            ["Prepay everything", "Safe, but every purchase waits on payment first and good customers never earn better treatment.", "#ffbf5c"],
            ["Trust blindly", "Fast, until one bad agent walks away with the goods. There is no record to check.", "#ff6b81"],
          ].map(([t, b, c]) => (
            <div key={t} className="glass p-6">
              <div className="h-1 w-10 rounded-full" style={{ background: c }} />
              <h3 className="mt-4 font-display text-lg font-semibold">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-dim">{b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* same order, different terms */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <SectionHead
          eyebrow="Live on HSK testnet"
          title="Same order. Different terms."
          body="Four agents with real on-chain payment histories ask the Credence Risk Agent for the same report. Their trust decides what they are offered."
          right={
            <Link href="/agents" className="btn-ghost">
              <Users className="size-4" /> All agents
            </Link>
          }
        />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(agents.length ? agents : Array.from<LeaderRow | undefined>({ length: 4 })).map((a, i) =>
            a ? (
              <Link key={a.id} href={`/agents/${a.address}`} className="glass glass-hover block p-5">
                <div className="flex items-center gap-3">
                  <AgentAvatar name={a.name} color={a.color} />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{a.name}</div>
                    <div className="truncate text-xs text-faint">{a.tagline}</div>
                  </div>
                </div>
                <div className="mt-5"><TrustBar score={a.trust_score} /></div>
                <div className="mt-4 flex items-center justify-between text-xs text-dim">
                  <TermsBadge terms={a.terms.terms} />
                  <span>{a.stats.settled_count} settled</span>
                </div>
              </Link>
            ) : (
              <div key={i} className="glass h-40 p-5"><div className="shimmer h-full" /></div>
            ),
          )}
        </div>
      </section>

      {/* how */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <SectionHead eyebrow="How it works" title="One purchase, end to end." />
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="glass p-6">
              <div className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent">
                  <Icon className="size-5" />
                </span>
                <span className="font-mono text-xs text-faint">0{i + 1}</span>
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-dim">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* business */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="glass relative overflow-hidden p-8 sm:p-12">
          <div className="absolute -top-24 -right-24 size-72 rounded-full bg-violet/20 blur-3xl" />
          <div className="relative grid gap-10 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <div className="eyebrow text-accent">The business</div>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">Credence earns when trust earns.</h2>
              <p className="mt-3 text-dim">
                Merchants grant net and credit terms because Credence prices the risk. Credence takes a fee, enforced on-chain, on every
                deferred-terms settlement it underwrites. Reads of the trust score stay free, so the standard spreads.
              </p>
              <Link href="/business" className="btn-primary mt-6">
                Open the business dashboard <ArrowRight className="size-4" />
              </Link>
            </div>
            <ul className="space-y-3">
              {[
                [Coins, "1.5% fee on deferred-terms volume", "accrued on-chain per merchant"],
                [Landmark, "Pool-backed credit tabs", "the spread on capital Credence lends"],
                [ShieldCheck, "Risk intelligence over HSP", "reports sold agent-to-agent"],
                [Users, "Trust API for agent platforms", "per-check pricing at scale"],
              ].map(([Icon, t, b]) => {
                const I = Icon as typeof Coins;
                return (
                  <li key={t as string} className="flex gap-3 rounded-xl border border-line bg-white/[0.02] p-4">
                    <I className="mt-0.5 size-5 shrink-0 text-accent" />
                    <div>
                      <div className="text-sm font-medium">{t as string}</div>
                      <div className="text-xs text-dim">{b as string}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
