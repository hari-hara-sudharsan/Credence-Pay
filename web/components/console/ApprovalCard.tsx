import { short, type Run } from "@/lib/api";

export default function ApprovalCard({
  run,
  busy,
  onApprove,
}: {
  run: Run;
  busy: boolean;
  onApprove: () => void;
}) {
  const waiting = [...run.steps].reverse().find((s) => s.status === "waiting");
  if (!waiting) return null;
  const d = waiting.data;
  const isSign = run.state === "awaiting_sign_approval";
  return (
    <div className="rise rounded-xl border border-warn/50 bg-warn/5 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-warn">
        <span className="pulse size-2 rounded-full bg-warn" />
        {isSign ? "Approve signature" : "Approve submission"}
      </div>
      <p className="mt-1 text-xs text-dim">
        {isSign
          ? "The payment agent will sign exactly the EIP-712 authorisation HSP returned. Nothing has been signed yet."
          : "The signed Payment Mandate is ready. Nothing moves until you submit it to the HSP Gateway."}
      </p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 font-mono text-xs">
        <dt className="text-dim">Recipient</dt>
        <dd className="truncate" title={d.recipient}>{short(d.recipient, 10)}</dd>
        <dt className="text-dim">Payer</dt>
        <dd className="truncate" title={d.payer}>{short(d.payer, 10)}</dd>
        <dt className="text-dim">token_total_raw</dt>
        <dd>
          {d.token_total_raw} <span className="text-faint">(≈ {d.token_total} {d.coin}, raw units)</span>
        </dd>
        {d.quote_expires_at && (
          <>
            <dt className="text-dim">Quote expires</dt>
            <dd>{new Date(d.quote_expires_at).toLocaleTimeString()}</dd>
          </>
        )}
      </dl>
      <button
        onClick={onApprove}
        disabled={busy}
        className="mt-4 w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-50"
      >
        {busy ? "Working…" : isSign ? "Approve & sign" : "Approve & submit to HSP"}
      </button>
    </div>
  );
}
