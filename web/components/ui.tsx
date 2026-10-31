import type { ReactNode } from "react";
import { TERMS_COLOR, TERMS_LABEL } from "@/lib/api";

export function AgentAvatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("");
  return (
    <span
      className="relative grid shrink-0 place-items-center rounded-2xl font-display font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `radial-gradient(circle at 30% 25%, ${color}, ${color}55 60%, #0b1022 100%)`,
        boxShadow: `0 0 28px -8px ${color}, inset 0 1px 0 rgb(255 255 255 / 0.25)`,
      }}
    >
      {initials}
    </span>
  );
}

export function TermsBadge({ terms, className = "" }: { terms?: string; className?: string }) {
  if (!terms) return <span className="text-faint">—</span>;
  const c = TERMS_COLOR[terms] ?? "#9aa6c4";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
      style={{ color: c, background: `${c}14`, border: `1px solid ${c}40` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: c }} />
      {TERMS_LABEL[terms] ?? terms}
    </span>
  );
}

export function RailBadge({ rail }: { rail?: string }) {
  const hsp = rail === "hsp";
  return (
    <span
      className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
        hsp ? "border-accent/40 text-accent" : "border-violet/40 text-violet"
      }`}
      title={hsp ? "Settled through HSP Agentic Payment" : "Settled on HSK testnet in Credence Test USD"}
    >
      {hsp ? "HSP" : "Sandbox"}
    </span>
  );
}

export function Kpi({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: ReactNode; accent?: string }) {
  return (
    <div className="glass p-5">
      <div className="eyebrow">{label}</div>
      <div className="mt-2 font-display text-3xl font-semibold tabular-nums" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-dim">{hint}</div>}
    </div>
  );
}

export function SectionHead({ eyebrow, title, body, right }: { eyebrow?: string; title: ReactNode; body?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow && <div className="eyebrow text-accent">{eyebrow}</div>}
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
        {body && <p className="mt-2 text-dim">{body}</p>}
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
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/5">
        <div className="absolute inset-y-0 left-[43.3%] w-px bg-white/15" />
        <div className="absolute inset-y-0 left-[66.6%] w-px bg-white/15" />
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct * 100}%`, background: `linear-gradient(90deg, ${color}66, ${color})` }} />
      </div>
    </div>
  );
}
