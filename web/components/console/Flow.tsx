"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, CircleAlert, FileSignature, Network, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { short, type Run } from "@/lib/api";

/* ---------- Sheet: Apple-style modal, closes on Escape and backdrop click ---------- */

export function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className="sheet outline-none">
        <div className="flex justify-end px-4 pt-4">
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full bg-white/10 text-dim hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
        <div className="px-6 pb-7 sm:px-8">{children}</div>
      </div>
    </div>
  );
}

/* ---------- Stepper: where the purchase is, at a glance ---------- */

const STAGES = [
  { id: "discover", label: "Discover", icon: Network },
  { id: "quote", label: "Terms", icon: ShieldCheck },
  { id: "sign", label: "Sign", icon: FileSignature },
  { id: "submit", label: "Submit", icon: Send },
  { id: "settled", label: "Settled", icon: Sparkles },
] as const;

function stageIndex(run: Run | null, busy: boolean): number {
  if (!run) return busy ? 0 : -1;
  switch (run.state) {
    case "running": return 1;
    case "awaiting_sign_approval": return 2;
    case "awaiting_submit_approval": return 3;
    case "settling": return 4;
    case "settled": return 5;
    case "failed": return Math.min(4, Math.max(0, run.steps.filter((s) => s.status === "done").length >= 7 ? 3 : 1));
  }
}

export function Stepper({ run, busy }: { run: Run | null; busy: boolean }) {
  const at = stageIndex(run, busy);
  const failed = run?.state === "failed";
  return (
    <ol className="flex items-center" aria-label="Purchase progress">
      {STAGES.map(({ id, label, icon: Icon }, i) => {
        const done = i < at;
        const current = i === at;
        const bad = failed && current;
        return (
          <li key={id} className="flex flex-1 items-center last:flex-none" aria-current={current ? "step" : undefined}>
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={`grid size-9 place-items-center rounded-full transition-all duration-500 ${
                  bad ? "bg-bad text-[#fff]"
                  : done ? "bg-good text-[#05060b]"
                  : current ? "bg-accent text-[#fff] shadow-[0_0_0_6px_rgb(41_151_255/0.18)]"
                  : "bg-white/[0.07] text-faint"
                }`}
              >
                {bad ? <CircleAlert className="size-4" /> : done ? <Check className="size-4" strokeWidth={3} /> : <Icon className={`size-4 ${current && !failed ? "pulse" : ""}`} />}
              </span>
              <span className={`text-[11px] ${current || done ? "text-ink" : "text-faint"}`}>{label}</span>
            </div>
            {i < STAGES.length - 1 && (
              <span className="mx-1.5 mb-5 h-0.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                <span className="block h-full rounded-full bg-good transition-all duration-700" style={{ width: done ? "100%" : "0%" }} />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- ConfirmSheet: HSP guide step 6, one item at a time ---------- */

export type Preflight = { merchant_name: string; pay_to: string; payer: string; rail: string; network: string; agent: string; confirmation_required: boolean };

export function ConfirmFlow({ pre, onDone }: { pre: Preflight; onDone: (confirmed: Record<string, string>) => void }) {
  const items = [
    { key: "merchant_name", title: "Team name", value: pre.merchant_name, hint: "Reported to HSP as merchant_name on the order and on every query." },
    { key: "pay_to", title: "Recipient (pay_to)", value: pre.pay_to, hint: `${pre.agent}'s wallet, read from its A2A Agent Card.` },
    { key: "payer", title: "Payer", value: pre.payer, hint: "The payment agent's wallet. It signs the authorisation; it is never defaulted to the recipient." },
  ];
  const [n, setN] = useState(0);
  return (
    <div>
      <h2 className="text-2xl font-semibold">Confirm the payment details</h2>
      <p className="mt-1.5 text-sm text-dim">
        Confirm each one before the receiving agent creates the {pre.rail === "hsp" ? "HSP" : "sandbox"} order.
      </p>
      <ol className="mt-6 space-y-3">
        {items.map((it, i) => {
          const done = i < n, current = i === n;
          return (
            <li key={it.key} className={`rounded-2xl border p-4 transition-all duration-300 ${current ? "border-accent bg-accent/[0.06]" : done ? "border-line bg-white/[0.03]" : "border-line opacity-40"}`}>
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${done ? "bg-good text-[#05060b]" : current ? "bg-accent text-white" : "bg-white/10 text-dim"}`}>
                  {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-dim">{it.title}</div>
                  <div className={`mt-0.5 break-all ${it.key === "merchant_name" ? "text-base font-semibold" : "font-mono text-[13px]"}`}>{it.value}</div>
                  {current && <p className="mt-1.5 text-xs text-faint">{it.hint}</p>}
                </div>
              </div>
              {current && (
                <button autoFocus onClick={() => setN(n + 1)} className="btn-primary mt-4 w-full py-2.5">Confirm</button>
              )}
            </li>
          );
        })}
      </ol>
      <button
        disabled={n < items.length}
        onClick={() => onDone({ merchant_name: pre.merchant_name, pay_to: pre.pay_to, payer: pre.payer })}
        className="btn-primary mt-6 w-full"
      >
        Start purchase
      </button>
      <p className="mt-3 text-center text-[11px] text-faint">You will still approve twice: before signing and before submitting.</p>
    </div>
  );
}

/* ---------- Approval content (sign / submit) ---------- */

export function ApprovalContent({ run, busy, onApprove, onLater }: { run: Run; busy: boolean; onApprove: () => void; onLater?: () => void }) {
  const waiting = [...run.steps].reverse().find((s) => s.status === "waiting");
  if (!waiting) return null;
  const d = waiting.data;
  const isSign = run.state === "awaiting_sign_approval";
  const deferred = run.terms && run.terms !== "PREPAY";
  return (
    <div className="text-center">
      <span className="pop mx-auto grid size-14 place-items-center rounded-full bg-accent/15 text-accent">
        {isSign ? <FileSignature className="size-6" /> : <Send className="size-6" />}
      </span>
      <h2 className="mt-4 text-2xl font-semibold">{isSign ? "Approve signature" : "Approve submission"}</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-dim">
        {isSign
          ? deferred
            ? "The goods are already delivered on trusted terms. Signing pays the tab."
            : "The agent signs exactly the EIP-712 authorisation the rail returned. Nothing is signed until you approve."
          : "The signed Payment Mandate is ready. Nothing moves until you submit it."}
      </p>
      <div className="mt-6 text-5xl font-semibold tracking-tight tabular-nums">
        {d.token_total}<span className="ml-1.5 text-xl text-dim">{d.coin}</span>
      </div>
      <div className="mt-1 font-mono text-[11px] text-faint">{d.token_total_raw} raw units</div>
      <dl className="mt-6 divide-y divide-line rounded-2xl bg-white/[0.04] text-left text-sm">
        {[
          ["Recipient", short(d.recipient, 10), d.recipient],
          ["Payer", short(d.payer, 10), d.payer],
          ...(d.quote_expires_at ? [["Quote expires", new Date(d.quote_expires_at).toLocaleTimeString(), ""]] : []),
        ].map(([k, v, title]) => (
          <div key={k} className="flex justify-between gap-3 px-4 py-3">
            <dt className="text-dim">{k}</dt>
            <dd className="font-mono text-[13px]" title={title}>{v}</dd>
          </div>
        ))}
      </dl>
      <button onClick={onApprove} disabled={busy} className="btn-primary mt-6 w-full">
        {busy ? "Working…" : isSign ? "Approve & sign" : "Approve & submit"}
      </button>
      {onLater && <button onClick={onLater} className="mt-3 text-sm text-accent hover:underline">Not now</button>}
    </div>
  );
}

/* ---------- CountUp for the trust moment ---------- */

export function CountUp({ from, to, ms = 1200 }: { from: number; to: number; ms?: number }) {
  const [v, setV] = useState(from);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, ms]);
  return <>{v}</>;
}

/* ---------- Result report (HSP guide template) ---------- */

export function ReportCard({ report }: { report: Record<string, string | boolean> }) {
  const { title, ...rows } = report;
  return (
    <div>
      <div className="text-sm font-semibold">{String(title)}</div>
      <dl className="mt-3 divide-y divide-line rounded-2xl bg-white/[0.04] text-sm">
        {Object.entries(rows).map(([k, v]) => (
          <div key={k} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 px-4 py-2.5">
            <dt className="text-dim">{k}</dt>
            <dd className="font-mono text-[12.5px] break-all">{String(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
