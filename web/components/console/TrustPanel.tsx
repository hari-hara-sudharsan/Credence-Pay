import { TERMS_COLOR, usd, type Trust } from "@/lib/api";

const LADDER = [
  { terms: "PREPAY", label: "Prepay", hint: "Pays before delivery", from: 300 },
  { terms: "NET", label: "Net 7", hint: "Goods first, pay within 7 days", from: 560 },
  { terms: "CREDIT", label: "Credit tab", hint: "Open tab up to $225 for 30 days", from: 700 },
];

export function TrustGauge({ score, previous }: { score: number; previous?: number }) {
  const pct = Math.max(0, Math.min(1, (score - 300) / 600));
  const r = 70, c = Math.PI * r;
  const color = score >= 700 ? TERMS_COLOR.CREDIT : score >= 560 ? TERMS_COLOR.NET : TERMS_COLOR.PREPAY;
  const delta = previous !== undefined ? score - previous : 0;
  return (
    <div className="relative mx-auto w-52">
      <svg viewBox="0 0 160 92" className="w-full" role="img" aria-label={`Trust score ${score}`}>
        <defs>
          <linearGradient id="gauge" x1="0" x2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.35" />
            <stop offset="1" stopColor={color} />
          </linearGradient>
        </defs>
        <path d="M10 84 A70 70 0 0 1 150 84" fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth="11" strokeLinecap="round" />
        <path
          d="M10 84 A70 70 0 0 1 150 84"
          fill="none"
          stroke="url(#gauge)"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          style={{ transition: "stroke-dasharray 1s cubic-bezier(.2,.8,.2,1)", filter: `drop-shadow(0 0 8px ${color}88)` }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className="font-display text-4xl font-semibold tabular-nums">{score}</div>
        <div className="text-[11px] text-faint">of 900</div>
        {delta !== 0 && (
          <div className={`mt-1 text-xs font-medium ${delta > 0 ? "text-accent" : "text-bad"}`}>
            {delta > 0 ? "▲ +" : "▼ "}
            {delta} from last settlement
          </div>
        )}
      </div>
    </div>
  );
}

export default function TrustPanel({ trust, previous }: { trust: Trust | null; previous?: number }) {
  if (!trust) {
    return (
      <div className="glass space-y-3 p-5">
        <div className="shimmer h-32" />
        <div className="shimmer h-24" />
      </div>
    );
  }
  const { stats, policy, terms } = trust;
  const used = policy.daily_cap ? Math.min(1, policy.spent_today / policy.daily_cap) : 0;
  return (
    <div className="space-y-4">
      <section className="glass p-5">
        <div className="eyebrow">On-chain trust</div>
        <div className="mt-4"><TrustGauge score={trust.trust_score} previous={previous} /></div>
        <ol className="mt-6 space-y-2">
          {LADDER.map((s) => {
            const active = s.terms === terms.terms;
            const c = TERMS_COLOR[s.terms];
            return (
              <li
                key={s.terms}
                className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition"
                style={active ? { borderColor: `${c}80`, background: `${c}12` } : { borderColor: "var(--color-line)" }}
              >
                <span className="size-2 rounded-full" style={{ background: active ? c : "rgb(255 255 255 / 0.15)" }} />
                <div className="min-w-0">
                  <div className={active ? "font-medium" : "text-dim"}>{s.label}</div>
                  {active && <div className="text-[11px] text-dim">{s.hint}</div>}
                </div>
                <span className="ml-auto text-[11px] text-faint">{active ? "current" : `≥ ${s.from}`}</span>
              </li>
            );
          })}
        </ol>
        {terms.credit_limit > 0 && <p className="mt-3 text-xs text-dim">Available credit: {usd(terms.credit_limit)}</p>}
      </section>

      <section className="glass p-5">
        <div className="flex items-center justify-between">
          <div className="eyebrow">Owner spending policy</div>
          <span className={`text-xs ${policy.paused ? "text-bad" : "text-accent"}`}>{policy.paused ? "Paused" : "Active"}</span>
        </div>
        <div className="mt-3 flex items-baseline justify-between text-sm">
          <span className="text-dim">Spent today</span>
          <span className="font-mono tabular-nums">{usd(policy.spent_today)} / {usd(policy.daily_cap, 0)}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5">
          <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-all" style={{ width: `${used * 100}%` }} />
        </div>
        <div className="mt-3 flex justify-between text-xs">
          <span className="text-dim">Per payment cap</span>
          <span className="font-mono">{usd(policy.per_tx_cap, 0)}</span>
        </div>
      </section>

      <section className="glass grid grid-cols-3 divide-x divide-line text-center">
        {[
          ["Settled", stats.settled_count],
          ["On time", stats.on_time_count],
          ["Volume", usd(stats.settled_volume, 0)],
        ].map(([k, v]) => (
          <div key={k} className="px-2 py-4">
            <div className="font-display text-xl font-semibold tabular-nums">{v}</div>
            <div className="text-[11px] text-dim">{k}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
