import type { Trust } from "@/lib/api";

const LADDER = [
  { terms: "PREPAY", label: "Prepay", hint: "Pay before delivery", from: 300 },
  { terms: "NET", label: "Net 7", hint: "Deliver now, pay in 7 days", from: 560 },
  { terms: "CREDIT", label: "Credit tab", hint: "Up to 225 USD open, 30 days", from: 700 },
];

export function TrustGauge({ score, previous }: { score: number; previous?: number }) {
  const min = 300, max = 900;
  const pct = Math.max(0, Math.min(1, (score - min) / (max - min)));
  const r = 54, c = Math.PI * r;
  const color = score >= 700 ? "var(--color-accent)" : score >= 560 ? "var(--color-info)" : "var(--color-warn)";
  const delta = previous !== undefined ? score - previous : 0;
  return (
    <div className="relative mx-auto w-44">
      <svg viewBox="0 0 128 72" className="w-full" role="img" aria-label={`Trust score ${score}`}>
        <path d="M10 66 A54 54 0 0 1 118 66" fill="none" stroke="var(--color-line)" strokeWidth="9" strokeLinecap="round" />
        <path
          d="M10 66 A54 54 0 0 1 118 66"
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className="text-3xl font-semibold tabular-nums">{score}</div>
        {delta !== 0 && (
          <div className={`text-xs font-medium ${delta > 0 ? "text-accent" : "text-bad"}`}>
            {delta > 0 ? "+" : ""}
            {delta} after last settlement
          </div>
        )}
      </div>
    </div>
  );
}

export default function TrustPanel({ trust, previous }: { trust: Trust | null; previous?: number }) {
  if (!trust) {
    return <div className="panel p-5 text-sm text-dim">Loading on-chain trust…</div>;
  }
  const { stats, policy, terms } = trust;
  const used = policy.daily_cap ? Math.min(1, policy.spent_today / policy.daily_cap) : 0;
  return (
    <div className="space-y-4">
      <section className="panel p-5">
        <h3 className="text-xs font-medium tracking-wide text-dim uppercase">Payment agent trust</h3>
        <div className="mt-4">
          <TrustGauge score={trust.trust_score} previous={previous} />
        </div>
        <ol className="mt-5 space-y-2">
          {LADDER.map((s) => {
            const active = s.terms === terms.terms;
            const unlocked = trust.trust_score >= s.from && stats.default_count === 0;
            return (
              <li
                key={s.terms}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                  active ? "border-accent/60 bg-accent/10" : "border-line"
                }`}
              >
                <span className={`size-2 rounded-full ${active ? "bg-accent" : unlocked ? "bg-dim" : "bg-line"}`} />
                <span className={active ? "font-medium" : unlocked ? "" : "text-faint"}>{s.label}</span>
                <span className="ml-auto text-xs text-faint">{active ? "current" : `≥ ${s.from}`}</span>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-xs text-dim">{LADDER.find((l) => l.terms === terms.terms)?.hint}</p>
      </section>

      <section className="panel p-5">
        <h3 className="text-xs font-medium tracking-wide text-dim uppercase">Owner spending policy</h3>
        <div className="mt-3 flex items-baseline justify-between text-sm">
          <span>Spent today</span>
          <span className="font-mono tabular-nums">
            {policy.spent_today.toFixed(2)} / {policy.daily_cap.toFixed(2)} USD
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${used * 100}%` }} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-y-2 text-xs">
          <dt className="text-dim">Per payment cap</dt>
          <dd className="text-right font-mono">{policy.per_tx_cap.toFixed(2)} USD</dd>
          <dt className="text-dim">Status</dt>
          <dd className={`text-right ${policy.paused ? "text-bad" : "text-accent"}`}>{policy.paused ? "Paused" : "Active"}</dd>
        </dl>
      </section>

      <section className="panel grid grid-cols-3 divide-x divide-line text-center">
        {[
          ["Settled", stats.settled_count],
          ["On time", stats.on_time_count],
          ["Volume", `$${stats.settled_volume.toFixed(2)}`],
        ].map(([k, v]) => (
          <div key={k} className="px-2 py-4">
            <div className="text-lg font-semibold tabular-nums">{v}</div>
            <div className="text-xs text-dim">{k}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
