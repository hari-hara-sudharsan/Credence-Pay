import { short, txUrl, type Run, type Step } from "@/lib/api";

const ACTOR: Record<string, string> = {
  intent: "Payment agent",
  config: "HSP",
  trust: "Receiving agent",
  order: "Receiving agent · HSP",
  prepare: "Payment agent · HSP",
  tab: "Receiving agent · chain",
  approve_sign: "You",
  approve_submit: "You",
  requote: "HSP",
  sign: "Payment agent · HSP",
  submit: "HSP Gateway",
  status: "HSP Gateway",
  settled: "HSK Chain",
  anchor: "Credence registry",
  deliver: "Receiving agent",
  error: "",
  query_error: "HSP",
};

function Dot({ status }: { status: Step["status"] }) {
  if (status === "waiting") return <span className="pulse size-2.5 rounded-full bg-warn" />;
  if (status === "error") return <span className="size-2.5 rounded-full bg-bad" />;
  return <span className="size-2.5 rounded-full bg-accent" />;
}

function StepRow({ step, last }: { step: Step; last: boolean }) {
  const d = step.data ?? {};
  const tx: string | undefined = d.tx || undefined;
  return (
    <li className="rise relative flex gap-4 pb-5">
      {!last && <span className="absolute top-4 left-[4.5px] h-full w-px bg-line" />}
      <span className="mt-1.5">
        <Dot status={step.status} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className={`text-sm font-medium ${step.status === "error" ? "text-bad" : ""}`}>{step.title}</span>
          {ACTOR[step.key] && <span className="text-xs text-faint">{ACTOR[step.key]}</span>}
        </div>
        {step.detail && <p className="mt-0.5 text-sm break-words text-dim">{step.detail}</p>}
        <div className="mt-1.5 flex flex-wrap gap-2 font-mono text-xs">
          {d.flow_id && <Chip label="flow" value={d.flow_id} />}
          {d.cart_hash && <Chip label="cart" value={short(d.cart_hash, 8)} />}
          {d.token_total_raw && <Chip label="raw" value={d.token_total_raw} />}
          {d.attribution_verified !== undefined && d.attribution_verified !== null && (
            <Chip label="attribution" value={d.attribution_verified ? "verified" : "not verified"} />
          )}
          {tx && (
            <a href={txUrl(tx)} target="_blank" rel="noreferrer" className="rounded border border-accent/40 px-1.5 py-0.5 text-accent hover:bg-accent/10">
              tx {short(tx, 8)} ↗
            </a>
          )}
          {d.payment_url && (
            <a href={d.payment_url} target="_blank" rel="noreferrer" className="rounded border border-line px-1.5 py-0.5 text-dim hover:text-ink">
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
    <span className="rounded border border-line px-1.5 py-0.5 text-dim">
      <span className="text-faint">{label}</span> {value}
    </span>
  );
}

export default function Timeline({ run }: { run: Run }) {
  const steps = run.steps.filter((s) => !(s.key.startsWith("approve_") && s.status === "done"));
  return (
    <ol>
      {steps.map((s, i) => (
        <StepRow key={`${s.key}-${i}`} step={s} last={i === steps.length - 1 && run.state !== "settling"} />
      ))}
      {run.state === "settling" && (
        <li className="flex gap-4 text-sm text-dim">
          <span className="pulse mt-1.5 size-2.5 rounded-full bg-info" />
          Polling HSP every 15 s · {run.payment_status ?? "payment-submitted"}
        </li>
      )}
    </ol>
  );
}
