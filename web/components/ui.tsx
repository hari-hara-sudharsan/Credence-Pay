import type { ReactNode } from "react";
import { TERMS_COLOR, TERMS_LABEL, tint } from "@/lib/api";

export function AgentAvatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("");
  return (
    <span
      className="relative grid shrink-0 place-items-center rounded-2xl font-display font-semibold text-[#fff]"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `radial-gradient(circle at 30% 22%, ${color}, ${tint(color, "66")} 55%, #0a0c1a 100%)`,
        boxShadow: `0 0 34px -10px ${color}, inset 0 1px 0 rgb(255 255 255 / 0.3), inset 0 -8px 16px -8px rgb(0 0 0 / 0.5)`,
      }}
    >
      <span className="absolute inset-0 rounded-2xl ring-1 ring-white/15 ring-inset" />
      {initials}
    </span>
  );
}

export function TermsBadge({ terms, className = "" }: { terms?: string; className?: string }) {
  if (!terms) return <span className="text-faint">—</span>;
  const c = TERMS_COLOR[terms] ?? "#a4a9c4";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
      style={{ color: c, background: `${tint(c, "14")}`, border: `1px solid ${tint(c, "45")}`, boxShadow: `0 0 18px -8px ${c}` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
      {TERMS_LABEL[terms] ?? terms}
    </span>
  );
}

export function RailBadge({ rail }: { rail?: string }) {
  const hsp = rail === "hsp";
  return (
    <span
      className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
        hsp ? "border-accent/40 bg-accent/10 text-accent" : "border-violet/40 bg-violet/10 text-violet"
      }`}
      title={hsp ? "Settled through HSP Agentic Payment" : "Settled on HSK testnet in Credence Test USD"}
    >
      {hsp ? "HSP" : "Sandbox"}
    </span>
  );
}

export function Kpi({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: ReactNode; accent?: string }) {
  const c = accent ?? "#8b9dff";
  return (
    <div className="glass overflow-hidden p-5">
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${tint(c, "aa")}, transparent)` }} />
      <div className="pointer-events-none absolute -top-12 -right-10 size-32 rounded-full opacity-30 blur-2xl" style={{ background: c }} />
      <div className="eyebrow">{label}</div>
      <div className="mt-3 font-display text-3xl font-semibold tracking-tight tabular-nums" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {hint && <div className="mt-1.5 text-xs text-dim">{hint}</div>}
    </div>
  );
}

export function SectionHead({ eyebrow, title, body, right }: { eyebrow?: string; title: ReactNode; body?: ReactNode; right?: ReactNode }) {
  return (
    <div data-reveal className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow && (
          <div className="inline-flex items-center gap-2 text-accent">
            <span className="h-px w-6 bg-gradient-to-r from-transparent to-accent" />
            <span className="eyebrow text-accent">{eyebrow}</span>
          </div>
        )}
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
        {body && <p className="mt-3 leading-relaxed text-dim">{body}</p>}
      </div>
      {right}
    </div>
  );
}

export function TrustBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(1, (score - 300) / 600));
  const color = score >= 700 ? TERMS_COLOR.CREDIT : score >= 560 ? TERMS_COLOR.NET : TERMS_COLOR.PREPAY;
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 font-display text-lg font-semibold tabular-nums">{score}</span>
      <div className="relative h-2 flex-1 rounded-full bg-white/[0.06]">
        <div className="absolute inset-y-0 left-[43.3%] z-10 w-px bg-white/20" title="560: Net 7" />
        <div className="absolute inset-y-0 left-[66.6%] z-10 w-px bg-white/20" title="700: Credit" />
        <div
          className="relative h-full rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${pct * 100}%`, background: `linear-gradient(90deg, ${tint(color, "40")}, ${color})`, boxShadow: `0 0 14px -2px ${tint(color, "aa")}` }}
        >
          <span className="absolute top-1/2 right-0 size-2.5 translate-x-1/2 -translate-y-1/2 rounded-full bg-white" style={{ boxShadow: `0 0 10px ${color}` }} />
        </div>
      </div>
    </div>
  );
}
