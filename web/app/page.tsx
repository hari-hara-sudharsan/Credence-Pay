"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Coins, Landmark, Lock, ShieldCheck, Sparkles, TrendingUp, Users, Zap } from "lucide-react";
import HeroDiagram from "@/components/HeroDiagram";
import { AgentAvatar, SectionHead, TermsBadge, TrustBar } from "@/components/ui";
import { api, usd, type Business, type LeaderRow } from "@/lib/api";

const STEPS = [
  { icon: Sparkles, title: "Intent", body: "The payment agent is told what to buy and its budget, in plain language." },
  { icon: ShieldCheck, title: "Trust check", body: "The receiving agent reads the payer's on-chain record and sets the terms." },
  { icon: Coins, title: "Order", body: "An HSP cart mandate carries the payment conditions." },
  { icon: Lock, title: "Policy + approval", body: "The owner's on-chain limits are checked, then a human approves twice." },
  { icon: Zap, title: "Settle", body: "EIP-712 authorisation, settled through HSP on HSK Chain." },
  { icon: TrendingUp, title: "Remember", body: "Credence anchors the payment; trust and future terms update." },
];

export default function Home() {
  const [stats, setStats] = useState<Business | null>(null);
  const [agents, setAgents] = useState<LeaderRow[]>([]);

  useEffect(() => {
    api.business().then(setStats).catch(() => {});
    api.leaderboard().then(setAgents).catch(() => {});
  }, []);

  return (
    <main>
      {/* hero */}
      <section className="relative">
        <div className="grid-bg absolute inset-0 -z-10" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pt-16 pb-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
          <div className="rise">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.03] px-3 py-1 text-xs text-dim">
              <span className="size-1.5 rounded-full bg-accent pulse" /> Built on HSK Chain · HSP Agentic Payment
            </span>
            <h1 className="mt-6 font-display text-5xl leading-[1.05] font-semibold tracking-tight sm:text-6xl">
              Credit terms <br />
              <span className="text-gradient">for AI agents.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-dim">
              HSP lets agents pay each other. Credence decides on what terms. Every settlement becomes on-chain trust, so reliable
              agents move from prepay to net terms to credit, inside limits their human owners set.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/console" className="btn-primary">
                Run a live agent purchase <ArrowRight className="size-4" />
              </Link>
              <Link href="/business" className="btn-ghost">
                See the business
              </Link>
            </div>
            <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6">
              {[
                ["Settlements on-chain", stats ? stats.chain.total_settled : "—"],
                ["Volume settled", stats ? usd(stats.chain.total_volume) : "—"],
                ["Credence fees earned", stats ? usd(stats.credence_fees_usd, 3) : "—"],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <dt className="text-xs text-faint">{k}</dt>
                  <dd className="mt-1 font-display text-2xl font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="rise" style={{ animationDelay: "120ms" }}>
            <HeroDiagram />
          </div>
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
