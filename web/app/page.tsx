"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight, ArrowUpRight, BadgeCheck, Coins, Fingerprint, Landmark, Lock, Network, Play, ShieldCheck, Sparkles, TrendingUp, Users, Workflow, Zap,
} from "lucide-react";
import HeroDiagram from "@/components/HeroDiagram";
import TrustSimulator from "@/components/TrustSimulator";
import { AgentAvatar, SectionHead, TermsBadge } from "@/components/ui";
import { CountUp, TrustRing } from "@/components/motion";
import { api, short, txUrl, type Business, type LeaderRow, type Run } from "@/lib/api";

const WORDS = ["AI agents.", "lending agents.", "trading bots.", "research agents."];

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
  { icon: Coins, title: "Cart Mandate over A2A", body: "Payment conditions travel as an AP2 Cart Mandate backed by an HSP order." },
  { icon: Lock, title: "Policy + approval", body: "The owner's on-chain limits are checked, then a human approves twice." },
  { icon: Zap, title: "Settle", body: "EIP-712 authorisation, settled through HSP on HSK Chain." },
  { icon: TrendingUp, title: "Remember", body: "Credence anchors the payment; trust and future terms update." },
];

function RotatingWord() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % WORDS.length), 2600);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="relative inline-block [perspective:600px]">
      <span key={i} className="word-in serif-accent text-gradient pr-2">
        {WORDS[i]}
      </span>
    </span>
  );
}

/** Replays the A2A conversation message by message whenever it scrolls into view. */
function WireReplay() {
  const ref = useRef<HTMLOListElement>(null);
  const [count, setCount] = useState(0);
  const [run, setRun] = useState(0);
  const replay = useCallback(() => {
    setCount(0);
    setRun((r) => r + 1);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return setCount(A2A_MESSAGES.length);
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (replay(), io.disconnect()), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [replay]);

  useEffect(() => {
    if (!run || count >= A2A_MESSAGES.length) return;
    const t = setTimeout(() => setCount((c) => c + 1), count === 0 ? 250 : 900);
    return () => clearTimeout(t);
  }, [count, run]);

  const typing = run > 0 && count < A2A_MESSAGES.length;
  const nextDir = A2A_MESSAGES[Math.min(count, A2A_MESSAGES.length - 1)].dir;

  return (
    <ol ref={ref} className="glass halo relative min-h-[470px] space-y-2.5 p-5 sm:p-6" style={{ borderRadius: 28 }} aria-live="polite">
      <li className="mb-4 flex items-center justify-between text-[11px] text-faint">
        <span className="flex items-center gap-1.5 font-medium text-info">
          <span className="size-1.5 rounded-full bg-info" /> Payment agent
        </span>
        <button type="button" onClick={replay} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono transition-colors hover:border-accent/50 hover:text-ink">
          <Play className="size-3" /> replay · JSON-RPC 2.0
        </button>
        <span className="flex items-center gap-1.5 font-medium text-accent">
          Receiving agent <span className="size-1.5 rounded-full bg-accent" />
        </span>
      </li>
      {A2A_MESSAGES.slice(0, count).map(({ dir, label, body, icon: Icon }) => (
        <li key={`${run}-${label}`} className={`bubble-in flex ${dir === "in" ? "justify-end" : ""}`}>
          <div
            className={`max-w-[88%] rounded-2xl border px-4 py-3 shadow-[0_10px_30px_-18px_rgb(0_0_0/0.9)] ${
              dir === "out" ? "rounded-tl-md border-info/25 bg-info/[0.07]" : "rounded-tr-md border-accent/30 bg-accent/[0.08]"
            }`}
          >
            <div className="flex items-center gap-2 font-mono text-[11.5px] break-all text-ink">
              <Icon className={`size-3.5 shrink-0 ${dir === "out" ? "text-info" : "text-accent"}`} /> {label}
            </div>
            <div className="mt-1 text-xs text-dim">{body}</div>
          </div>
        </li>
      ))}
      {typing && count > 0 && (
        <li className={`flex ${nextDir === "in" ? "justify-end" : ""}`} aria-hidden>
          <span className="inline-flex gap-1 rounded-full border border-line bg-white/[0.03] px-3 py-2">
            {[0, 1, 2].map((d) => (
              <span key={d} className="pulse size-1.5 rounded-full bg-dim" style={{ animationDelay: `${d * 160}ms` }} />
            ))}
          </span>
        </li>
      )}
      {count >= A2A_MESSAGES.length && (
        <li className="bubble-in flex justify-center pt-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-good/40 bg-good/10 px-3 py-1 text-xs font-medium text-good">
            <BadgeCheck className="size-3.5" /> Settled, anchored, trust updated
          </span>
        </li>
      )}
    </ol>
  );
}

export default function Home() {
  const [stats, setStats] = useState<Business | null>(null);
  const [agents, setAgents] = useState<LeaderRow[]>([]);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [offline, setOffline] = useState(false);

  // Load once the agent service answers; while it is down, say so and retry every 5 s.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const load = () =>
      api
        .leaderboard()
        .then((rows) => {
          if (cancelled) return;
          setOffline(false);
          setAgents(rows);
          api.business().then(setStats).catch(() => {});
          api.runs().then((runs) => setProofs(proofsFrom(runs))).catch(() => {});
        })
        .catch(() => {
          if (cancelled) return;
          setOffline(true);
          timer = setTimeout(load, 5_000);
        });
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const STATS: [string, number | undefined, (n: number) => string][] = [
    ["Settlements on-chain", stats?.chain.total_settled, (n) => Math.round(n).toString()],
    ["Volume settled", stats?.chain.total_volume, (n) => `$${n.toFixed(2)}`],
    ["Fees earned on-chain", stats?.credence_fees_usd, (n) => `$${n.toFixed(3)}`],
  ];

  return (
    <main>
      {/* hero */}
      <section className="relative">
        <div className="mx-auto max-w-6xl px-4 pt-16 pb-16 text-center sm:px-6 sm:pt-24">
          <div className="sd-hero-copy">
          <div className="rise">
            <span className="chip">
              <span className="ping size-1.5 rounded-full bg-good" /> Live on HSK Chain · A2A · AP2 mandates · HSP Agentic Payment
            </span>
            <h1 className="mt-8 font-display text-[2.9rem] leading-[1.02] font-semibold sm:text-[6.2rem]">
              <span className="text-silver">Credit terms for</span>
              <br />
              <RotatingWord />
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-dim sm:text-xl">
              HSP lets agents pay each other. Credence decides on what terms. Every settlement becomes on-chain trust, so reliable agents move from{" "}
              <span style={{ color: "var(--tier-prepay)" }}>prepay</span> to <span style={{ color: "var(--tier-net)" }}>net terms</span> to{" "}
              <span className="gold-gradient font-medium">credit</span>, inside limits their owners set.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link href="/console" className="btn-primary px-7 py-3.5 text-base">
                Run a live purchase <ArrowRight className="size-4" />
              </Link>
              <a href="#simulator" className="btn-ghost px-6 py-3.5 text-base">
                Try the trust simulator
              </a>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs text-dim">
              <span className="inline-flex items-center gap-1.5 font-medium text-gold">
                <BadgeCheck className="size-3.5" /> Deployed on HSK Mainnet
              </span>
              {[
                ["A2ASettlementRegistry", "0xFA2CE501f004F53341665911A4E57FbAFA263966"],
                ["AgentSpendingPolicy", "0xD10e77AF03cfA0a4241DdD298a9A4d4734Cb573b"],
              ].map(([name, addr]) => (
                <a
                  key={addr}
                  href={`https://hsk.blockscout.com/address/${addr}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/[0.03] px-3 py-1 transition-colors hover:border-gold/40 hover:text-ink"
                >
                  {name} <span className="font-mono text-faint">{short(addr, 6)}</span>
                  <ArrowUpRight className="size-3 text-faint" />
                </a>
              ))}
            </div>
          </div>
          </div>

          <dl className="rise mx-auto mt-16 grid max-w-3xl grid-cols-3 gap-3" style={{ animationDelay: "140ms" }}>
            {STATS.map(([k, v, f]) => (
              <div key={k} className="glass px-3 py-5 sm:px-5">
                <dd className="font-display text-2xl font-semibold tracking-tight sm:text-4xl">{v === undefined ? <span className="text-faint">—</span> : <CountUp value={v} format={f} />}</dd>
                <dt className="mt-1.5 text-[11px] text-faint sm:text-xs">{k}</dt>
              </div>
            ))}
          </dl>

          <div className="rise relative mx-auto mt-16 max-w-3xl" style={{ animationDelay: "260ms" }}>
            <div className="pointer-events-none absolute -inset-10 -z-10 rounded-[48px] bg-[radial-gradient(closest-side,rgb(111_125_255/0.28),transparent)] blur-2xl" />
            <div className="sd-par-slow">
              <HeroDiagram />
            </div>
            {/* chips sit on their own depth layer and drift faster than the diagram while scrolling */}
            <div className="sd-par-fast pointer-events-none absolute inset-0">
            <div className="float glass absolute top-8 -left-6 hidden items-center gap-2 rounded-2xl px-3.5 py-2.5 text-xs md:flex" style={{ animationDelay: "-2s" }}>
              <span className="grid size-6 place-items-center rounded-full bg-good/15 text-good">
                <TrendingUp className="size-3.5" />
              </span>
              <span>
                <span className="font-semibold text-good">+15</span> trust per on-time payment
              </span>
            </div>
            <div className="float glass absolute -right-8 bottom-24 hidden items-center gap-2 rounded-2xl px-3.5 py-2.5 text-xs md:flex">
              <span className="grid size-6 place-items-center rounded-full bg-gold/15 text-gold">
                <Landmark className="size-3.5" />
              </span>
              <span>
                Credit tab <span className="font-semibold text-gold">$85</span> unlocked
              </span>
            </div>
            <div className="float glass absolute -bottom-5 left-10 hidden items-center gap-2 rounded-2xl px-3.5 py-2.5 text-xs md:flex" style={{ animationDelay: "-4s" }}>
              <span className="ping size-1.5 rounded-full bg-accent-2" />
              <span className="font-mono text-dim">payment-finalized</span>
            </div>
            </div>
          </div>
        </div>
      </section>

      {/* live proof strip */}
      {proofs.length > 0 && (
        <section aria-label="Recent on-chain transactions" className="relative border-y border-line bg-white/[0.012] backdrop-blur-sm">
          <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 sm:px-6">
            <span className="flex shrink-0 items-center gap-2 py-3.5 text-[11px] font-semibold tracking-[0.14em] text-accent uppercase">
              <span className="ping size-1.5 rounded-full bg-accent" /> Verified on-chain
            </span>
            <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_6%,black_94%,transparent)]">
              <div className="marquee flex w-max gap-3 py-3">
                {[...proofs, ...proofs].map((p, i) => (
                  <a
                    key={i}
                    href={txUrl(p.tx)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-full border border-line bg-white/[0.02] px-3 py-1.5 text-xs whitespace-nowrap text-dim transition-colors hover:border-accent/40 hover:text-ink"
                  >
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

      {/* simulator */}
      <section id="simulator" className="mx-auto max-w-7xl scroll-mt-24 px-4 pt-24 pb-8 sm:px-6">
        <SectionHead
          eyebrow="Interactive"
          title={
            <>
              Trust is earned. <span className="serif-accent text-gradient">Play with it.</span>
            </>
          }
          body="Drag a payment history and watch the terms change. The math is the same trustScore() and termsFor() the registry runs on-chain, so Atlas, Nova and Rogue land exactly where they are live."
        />
        <div data-reveal="scale" className="mt-10" style={{ "--d": "120ms" } as React.CSSProperties}>
          <TrustSimulator />
        </div>
      </section>

      {/* A2A protocol */}
      <section className="mx-auto max-w-7xl px-4 pt-24 pb-4 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.15fr] lg:items-center">
          <div data-reveal="left">
            <div className="inline-flex items-center gap-2">
              <span className="h-px w-6 bg-gradient-to-r from-transparent to-accent" />
              <span className="eyebrow text-accent">Real agent-to-agent</span>
            </div>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-5xl">
              Two agents. One protocol. <span className="serif-accent text-gradient">Zero blind trust.</span>
            </h2>
            <p className="mt-5 leading-relaxed text-dim">
              The Credence Risk Agent is a standalone A2A server. Any A2A-compliant agent can discover it from its Agent Card and buy from it with AP2
              mandates. Payment conditions travel as a Cart Mandate, and the payment agent answers with a signed Payment Mandate settled through HSP.
            </p>
            <ul className="mt-7 space-y-3 text-sm text-dim">
              {[
                [Fingerprint, "No impersonation: credit terms need a signature from the payer's own wallet."],
                [ShieldCheck, "No taking the payer's word: the receiving agent checks HSP itself before goods ship."],
                [Lock, "Humans stay in control: an on-chain spending policy and two approvals for every payment."],
              ].map(([Icon, text]) => {
                const I = Icon as typeof Lock;
                return (
                  <li key={text as string} className="flex gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-accent/25 bg-accent/10 text-accent">
                      <I className="size-3.5" />
                    </span>
                    <span className="pt-1">{text as string}</span>
                  </li>
                );
              })}
            </ul>
            <Link href="/console" className="btn-ghost mt-8">
              Watch the wire in the console <ArrowRight className="size-4" />
            </Link>
          </div>
          <div data-reveal="right" style={{ "--d": "120ms" } as React.CSSProperties}>
            <WireReplay />
          </div>
        </div>
      </section>

      {/* problem */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <SectionHead eyebrow="The problem" title="Every agent is a stranger." body="When two AI agents trade, the seller has no way to know whether the buyer will pay. Today there are only two bad answers." />
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {[
            ["Prepay everything", "Safe, but every purchase waits on payment first and good customers never earn better treatment.", "#ffb65c", false],
            ["Trust blindly", "Fast, until one bad agent walks away with the goods. There is no record to check.", "#ff6b81", false],
            ["Credence", "Price every payer from its on-chain settlement history. Good agents earn net terms and credit; bad ones fall back to prepay.", "#f2cd85", true],
          ].map(([t, b, c, hero], i) => (
            <div
              key={t as string}
              data-reveal
              className={`glass glass-hover p-7 ${hero ? "halo" : ""}`}
              style={{ "--d": `${i * 110}ms`, borderRadius: 24 } as React.CSSProperties}
            >
              <div className="h-1 w-12 rounded-full" style={{ background: c as string, boxShadow: `0 0 16px ${c}` }} />
              <h3 className={`mt-5 font-display text-xl font-semibold ${hero ? "gold-gradient" : ""}`}>{t as string}</h3>
              <p className="mt-2 text-sm leading-relaxed text-dim">{b as string}</p>
            </div>
          ))}
        </div>
      </section>

      {/* same order, different terms */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <SectionHead
          eyebrow="Live on HSK testnet"
          title={
            <>
              Same order. <span className="serif-accent text-gradient">Different terms.</span>
            </>
          }
          body="Four agents with real on-chain payment histories ask the Credence Risk Agent for the same report. Their trust decides what they are offered."
          right={
            <Link href="/agents" className="btn-ghost">
              <Users className="size-4" /> All agents
            </Link>
          }
        />
        {offline && !agents.length && (
          <p role="status" className="mt-8 rounded-2xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
            The agent service is not reachable, so these agents can&rsquo;t load. Start it with{" "}
            <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">powershell -ExecutionPolicy Bypass -File scripts\dev.ps1</code>. This section fills in
            on its own once it is up.
          </p>
        )}
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(agents.length ? agents : Array.from<LeaderRow | undefined>({ length: 4 })).map((a, i) =>
            a ? (
              <Link
                key={a.id}
                href={`/agents/${a.address}`}
                data-reveal
                className="glass glass-hover tilt group block p-5"
                style={{ "--d": `${i * 90}ms`, borderRadius: 24 } as React.CSSProperties}
              >
                <div className="flex items-center gap-3">
                  <AgentAvatar name={a.name} color={a.color} />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{a.name}</div>
                    <div className="truncate text-xs text-faint">{a.tagline}</div>
                  </div>
                </div>
                <div className="mt-5 flex justify-center">
                  <TrustRing score={a.trust_score} size={128} defaulted={a.stats.default_count > 0} />
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-dim">
                  <TermsBadge terms={a.terms.terms} />
                  <span className="flex items-center gap-1">
                    {a.stats.settled_count} settled <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                </div>
              </Link>
            ) : (
              <div key={i} className="glass h-72 p-5" style={{ borderRadius: 24 }}>
                <div className="shimmer h-full" />
              </div>
            ),
          )}
        </div>
      </section>

      {/* how */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <SectionHead
          eyebrow="How it works"
          title={
            <>
              One purchase, <span className="serif-accent text-gradient">end to end.</span>
            </>
          }
        />
        <ol className="relative mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <span aria-hidden data-reveal="draw" className="pointer-events-none absolute top-[2.2rem] right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-accent/0 via-accent/40 to-accent/0 lg:block" />
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} data-reveal className="glass glass-hover group p-6" style={{ "--d": `${(i % 3) * 100}ms`, borderRadius: 24 } as React.CSSProperties}>
              <div className="flex items-center justify-between">
                <span className="relative grid size-11 place-items-center rounded-2xl border border-accent/25 bg-gradient-to-b from-accent/20 to-accent/5 text-accent shadow-[0_0_30px_-10px_rgb(139_157_255/0.8)] transition-transform duration-500 group-hover:scale-110 group-hover:rotate-[-6deg]">
                  <Icon className="size-5" />
                </span>
                <span className="font-mono text-xs text-faint">0{i + 1}</span>
              </div>
              <h3 className="mt-5 font-display text-lg font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-dim">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* business */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div data-reveal="scale" className="glass halo relative overflow-hidden p-8 sm:p-14" style={{ borderRadius: 32 }}>
          <div className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full bg-violet/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-40 -left-20 size-96 rounded-full bg-accent/20 blur-3xl" />
          <div className="relative grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>
              <div className="eyebrow text-gold">The business</div>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-5xl">
                Credence earns <span className="serif-accent gold-gradient">when trust earns.</span>
              </h2>
              <p className="mt-4 leading-relaxed text-dim">
                Merchants grant net and credit terms because Credence prices the risk. Credence takes a fee, enforced on-chain, on every deferred-terms
                settlement it underwrites. Reads of the trust score stay free, so the standard spreads.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/business" className="btn-primary">
                  Open the business dashboard <ArrowRight className="size-4" />
                </Link>
                <Link href="/developers" className="btn-ghost">
                  Read trust on-chain
                </Link>
              </div>
            </div>
            <ul className="space-y-3">
              {[
                [Coins, "1.5% fee on deferred-terms volume", "accrued on-chain per merchant"],
                [Landmark, "Pool-backed credit tabs", "the spread on capital Credence lends"],
                [ShieldCheck, "Risk intelligence over HSP", "reports sold agent-to-agent"],
                [Users, "Trust API for agent platforms", "per-check pricing at scale"],
              ].map(([Icon, t, b], i) => {
                const I = Icon as typeof Coins;
                return (
                  <li
                    key={t as string}
                    data-reveal
                    className="flex gap-3 rounded-2xl border border-line bg-white/[0.025] p-4 transition-colors duration-300 hover:border-gold/40 hover:bg-gold/[0.04]"
                    style={{ "--d": `${i * 80}ms` } as React.CSSProperties}
                  >
                    <I className="mt-0.5 size-5 shrink-0 text-gold" />
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
