import Link from "next/link";
import NetworkStats from "@/components/NetworkStats";

const FLOW = [
  ["Intent", "A lending agent is told to buy a risk report before it lends."],
  ["Trust check", "The receiving agent reads the payer's on-chain record and picks the terms."],
  ["Cart Mandate", "An HSP order is created with the payment conditions."],
  ["Policy + approval", "The payer checks its owner's on-chain limits; a human approves."],
  ["Payment Mandate", "EIP-712 authorisation signed and finalized through HSP."],
  ["Settle + remember", "HSP Gateway settles; Credence anchors it and raises trust."],
];

const TERMS = [
  ["Prepay", "New or unproven agents pay before delivery.", "trust < 560"],
  ["Net 7", "Reliable agents receive goods first and pay within 7 days.", "560 – 699"],
  ["Credit tab", "Proven agents run an open tab of up to 225 USD for 30 days.", "≥ 700"],
];

export default function Home() {
  return (
    <main>
      <section className="relative overflow-hidden">
        <div className="grid-bg absolute inset-0 -z-10 opacity-60" />
        <div className="mx-auto max-w-6xl px-4 pt-20 pb-16">
          <p className="text-sm font-medium text-accent">HSK Chain · HSP Agentic Payment</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            HSP lets agents pay each other. Credence decides on what terms.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-dim">
            When two AI agents trade, neither knows if the other will pay. Credence turns every HSP settlement into on-chain trust, so
            reliable agents move from prepay to net terms to credit, inside limits their human owners set.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/console" className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink hover:brightness-110">
              Open the Agent Console
            </Link>
            <Link href="/developers" className="rounded-lg border border-line px-5 py-2.5 text-sm hover:border-dim">
              How it works
            </Link>
          </div>
          <NetworkStats />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-sm font-medium tracking-wide text-dim uppercase">One purchase, end to end</h2>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FLOW.map(([title, body], i) => (
            <li key={title} className="panel p-5">
              <span className="font-mono text-xs text-accent">0{i + 1}</span>
              <h3 className="mt-2 font-medium">{title}</h3>
              <p className="mt-1 text-sm text-dim">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14">
        <h2 className="text-sm font-medium tracking-wide text-dim uppercase">Trust unlocks terms</h2>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {TERMS.map(([title, body, band]) => (
            <div key={title} className="panel p-5">
              <div className="flex items-baseline justify-between">
                <h3 className="font-medium">{title}</h3>
                <span className="font-mono text-xs text-faint">{band}</span>
              </div>
              <p className="mt-2 text-sm text-dim">{body}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-faint">
          Score is computed on-chain from settlement history: +15 per on-time payment, up to +100 for volume, −40 per late payment,
          −150 per default. Any default forces prepay.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="panel grid gap-6 p-6 md:grid-cols-3">
          {[
            ["Human in control", "Owners set daily and per-payment caps, allowed merchants, expiry and a pause switch on-chain. Every payment is also approved twice."],
            ["Nothing hidden", "Every settlement is anchored with its HSP flow ID and transaction hash. Policy breaches are recorded, never silently dropped."],
            ["Composable trust", "Any agent or protocol can read trustScore() and termsFor() to price counterparties. One record, every market."],
          ].map(([t, b]) => (
            <div key={t}>
              <h3 className="font-medium">{t}</h3>
              <p className="mt-1 text-sm text-dim">{b}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
