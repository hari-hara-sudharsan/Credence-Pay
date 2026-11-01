"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { TERMS_COLOR, TERMS_LABEL, tint } from "@/lib/api";
import { CountUp, TrustRing, scoreFrom, termsFrom } from "@/components/motion";

type Inputs = { onTime: number; volume: number; late: number; defaults: number };

// Real on-chain histories (HSK testnet, Nov 1).
const PRESETS: { id: string; label: string; v: Inputs }[] = [
  { id: "new", label: "New agent", v: { onTime: 0, volume: 0, late: 0, defaults: 0 } },
  { id: "nova", label: "Nova", v: { onTime: 4, volume: 10, late: 0, defaults: 0 } },
  { id: "atlas", label: "Atlas", v: { onTime: 17, volume: 52.5, late: 0, defaults: 0 } },
  { id: "rogue", label: "Rogue", v: { onTime: 6, volume: 19, late: 0, defaults: 1 } },
];

const SLIDERS: { key: keyof Inputs; label: string; max: number; step: number; unit?: string; effect: string; color: string }[] = [
  { key: "onTime", label: "On-time settlements", max: 25, step: 1, effect: "+15 each, up to 20", color: "#4fe3a5" },
  { key: "volume", label: "Volume settled", max: 1200, step: 10, unit: "$", effect: "+1 per $10, up to +100", color: "#8b9dff" },
  { key: "late", label: "Late payments", max: 5, step: 1, effect: "−40 each", color: "#ffb65c" },
  { key: "defaults", label: "Defaults", max: 2, step: 1, effect: "−150 each, forces prepay", color: "#ff6b81" },
];

const TIERS = [
  { id: "PREPAY", range: "< 560", desc: "Pay first, goods after" },
  { id: "NET", range: "560 – 699", desc: "Goods first, pay in 7 days" },
  { id: "CREDIT", range: "≥ 700", desc: "Open tab, due in 30 days" },
];

export default function TrustSimulator() {
  const [v, setV] = useState<Inputs>(PRESETS[2].v);
  const [preset, setPreset] = useState("atlas");
  const score = useMemo(() => scoreFrom(v), [v]);
  const t = termsFrom(score, v.defaults);
  const color = TERMS_COLOR[t.terms];

  const set = (k: keyof Inputs, n: number) => {
    setPreset("");
    setV((p) => ({ ...p, [k]: n }));
  };

  return (
    <div className="glass halo grid gap-0 overflow-hidden lg:grid-cols-[1.05fr_1fr]" style={{ borderRadius: 28 }}>
      {/* controls */}
      <div className="border-b border-line p-6 sm:p-8 lg:border-r lg:border-b-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="segmented" role="radiogroup" aria-label="Load an agent history">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={preset === p.id} onClick={() => (setPreset(p.id), setV(p.v))}>
                {p.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => (setPreset("new"), setV(PRESETS[0].v))} className="inline-flex items-center gap-1.5 text-xs text-faint transition-colors hover:text-ink">
            <RotateCcw className="size-3.5" /> Reset
          </button>
        </div>

        <div className="mt-8 space-y-7">
          {SLIDERS.map((s) => {
            const val = v[s.key];
            const pct = (val / s.max) * 100;
            return (
              <label key={s.key} className="block">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{s.label}</span>
                  <span className="font-mono text-ink tabular-nums">
                    {s.unit}
                    {s.key === "volume" ? val.toLocaleString(undefined, { maximumFractionDigits: 1 }) : val}
                  </span>
                </div>
                <input
                  type="range"
                  className="range mt-3"
                  min={0}
                  max={s.max}
                  step={s.step}
                  value={val}
                  onChange={(e) => set(s.key, Number(e.target.value))}
                  style={{ "--pct": `${pct}%`, "--fill": s.color } as React.CSSProperties}
                />
                <div className="mt-1.5 text-xs text-faint">{s.effect}</div>
              </label>
            );
          })}
        </div>
      </div>

      {/* result */}
      <div className="relative flex flex-col p-6 sm:p-8">
        <div className="pointer-events-none absolute top-10 left-1/2 size-64 -translate-x-1/2 rounded-full opacity-25 blur-3xl transition-colors duration-700" style={{ background: color }} />
        <div className="relative flex flex-col items-center">
          <TrustRing score={score} size={176} stroke={12} defaulted={v.defaults > 0} label="trust score" />
          <div
            key={t.terms}
            className="pop mt-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold"
            style={{ color, background: `${tint(color, "18")}`, border: `1px solid ${tint(color, "55")}`, boxShadow: `0 0 30px -8px ${color}` }}
          >
            <span className="size-2 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
            {TERMS_LABEL[t.terms]}
          </div>
        </div>

        <dl className="relative mt-7 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-2xl border border-line bg-white/[0.025] p-4">
            <dt className="text-xs text-faint">Credit limit</dt>
            <dd className="mt-1 font-display text-2xl font-semibold">
              {t.limit ? <CountUp value={t.limit} duration={600} format={(n) => `$${Math.round(n)}`} /> : "—"}
            </dd>
          </div>
          <div className="rounded-2xl border border-line bg-white/[0.025] p-4">
            <dt className="text-xs text-faint">Payment due</dt>
            <dd className="mt-1 font-display text-2xl font-semibold">{t.days ? `${t.days} days` : "Upfront"}</dd>
          </div>
        </dl>

        <ol className="relative mt-5 space-y-2">
          {TIERS.map((tier) => {
            const on = tier.id === t.terms;
            const c = TERMS_COLOR[tier.id];
            return (
              <li
                key={tier.id}
                className="flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-all duration-500"
                style={on ? { borderColor: `${tint(c, "66")}`, background: `${tint(c, "10")}`, boxShadow: `inset 0 0 0 1px ${tint(c, "22")}` } : { borderColor: "transparent", opacity: 0.55 }}
              >
                <span className="size-2 rounded-full" style={{ background: c, boxShadow: on ? `0 0 10px ${c}` : "none" }} />
                <span className="w-24 font-medium" style={on ? { color: c } : undefined}>
                  {TERMS_LABEL[tier.id]}
                </span>
                <span className="font-mono text-xs text-faint">{tier.range}</span>
                <span className="ml-auto hidden text-xs text-dim sm:inline">{tier.desc}</span>
              </li>
            );
          })}
        </ol>
        <p className="relative mt-4 text-center text-[11px] text-faint">
          Same formula as <code className="font-mono">trustScore()</code> and <code className="font-mono">termsFor()</code> in A2ASettlementRegistry.
        </p>
      </div>
    </div>
  );
}
