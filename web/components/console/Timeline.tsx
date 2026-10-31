import {
  Anchor, BadgeCheck, Brain, Fingerprint, Network, Workflow, CircleAlert, Coins, FileSignature, Hourglass, PackageCheck, Radio, Send, Settings2, ShieldCheck, Store, UserCheck,
} from "lucide-react";
import { short, txUrl, type Run, type Step } from "@/lib/api";

const META: Record<string, { icon: typeof Brain; actor: string }> = {
  intent: { icon: Brain, actor: "Payment agent" },
  discover: { icon: Network, actor: "A2A · Agent Card" },
  confirm: { icon: UserCheck, actor: "You" },
  pending: { icon: Hourglass, actor: "Rail" },
  identity: { icon: Fingerprint, actor: "A2A · payment agent" },
  mandate: { icon: Workflow, actor: "A2A · Payment Mandate" },
  verify_wait: { icon: Hourglass, actor: "Receiving agent" },
  a2a_done: { icon: BadgeCheck, actor: "A2A task" },
  config: { icon: Settings2, actor: "Rail" },
  trust: { icon: ShieldCheck, actor: "Receiving agent" },
  order: { icon: Store, actor: "Receiving agent" },
  prepare: { icon: Coins, actor: "Payment agent" },
  tab: { icon: PackageCheck, actor: "Receiving agent · chain" },
  approve_sign: { icon: UserCheck, actor: "You" },
  approve_submit: { icon: UserCheck, actor: "You" },
  requote: { icon: Hourglass, actor: "Rail" },
  sign: { icon: FileSignature, actor: "Payment agent" },
  submit: { icon: Send, actor: "Rail" },
  status: { icon: Radio, actor: "Rail" },
  settled: { icon: Coins, actor: "HSK Chain" },
  anchor: { icon: Anchor, actor: "Credence registry" },
  deliver: { icon: PackageCheck, actor: "Receiving agent" },
  error: { icon: CircleAlert, actor: "" },
  query_error: { icon: CircleAlert, actor: "Rail" },
};

function StepRow({ step, last, index }: { step: Step; last: boolean; index: number }) {
  const d = step.data ?? {};
  const meta = META[step.key] ?? META.status;
  const Icon = meta.icon;
  const tone =
    step.status === "error" ? "text-bad bg-bad/10 border-bad/30"
    : step.status === "waiting" ? "text-warn bg-warn/10 border-warn/30"
    : "text-accent bg-accent/10 border-accent/25";
  return (
    <li className="rise relative flex gap-4 pb-6" style={{ animationDelay: `${index * 40}ms` }}>
      {!last && <span className="absolute top-10 left-[17px] h-[calc(100%-2.5rem)] w-px bg-gradient-to-b from-line-strong to-transparent" />}
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl border ${tone} ${step.status === "waiting" ? "pulse" : ""}`}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className={`text-sm font-medium ${step.status === "error" ? "text-bad" : ""}`}>{step.title}</span>
          {meta.actor && <span className="text-xs text-faint">{meta.actor}</span>}
        </div>
        {step.detail && <p className="mt-0.5 text-sm break-words text-dim">{step.detail}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[11px]">
          {d.flow_id && <Chip label="flow" value={d.flow_id} />}
          {d.token_total_raw && <Chip label="raw" value={d.token_total_raw} />}
          {d.attribution_verified !== undefined && d.attribution_verified !== null && (
            <Chip label="attribution" value={d.attribution_verified ? "verified" : "not verified"} />
          )}
          {d.tx && (
            <a href={txUrl(d.tx)} target="_blank" rel="noreferrer" className="rounded-md border border-accent/40 bg-accent/5 px-2 py-0.5 text-accent hover:bg-accent/15">
              tx {short(d.tx, 8)} ↗
            </a>
          )}
          {d.payment_url && (
            <a href={d.payment_url} target="_blank" rel="noreferrer" className="rounded-md border border-line px-2 py-0.5 text-dim hover:text-ink">
              HSP checkout ↗
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-md border border-line bg-white/[0.02] px-2 py-0.5 text-dim">
      <span className="text-faint">{label}</span> {value}
    </span>
  );
}

export default function Timeline({ run }: { run: Run }) {
  const steps = run.steps.filter((s) => !(s.key.startsWith("approve_") && s.status === "done"));
  return (
    <ol>
      {steps.map((s, i) => (
        <StepRow key={`${s.key}-${i}`} step={s} index={i} last={i === steps.length - 1 && run.state !== "settling"} />
      ))}
      {run.state === "settling" && (
        <li className="flex items-center gap-4 text-sm text-dim">
          <span className="grid size-9 place-items-center rounded-xl border border-info/30 bg-info/10 text-info">
            <Radio className="size-4 pulse" />
          </span>
          Polling settlement status · {run.payment_status ?? "payment-submitted"}
        </li>
      )}
    </ol>
  );
}
