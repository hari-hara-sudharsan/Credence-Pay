import { FileSignature, Send } from "lucide-react";
import { short, type Run } from "@/lib/api";

export default function ApprovalCard({ run, busy, onApprove }: { run: Run; busy: boolean; onApprove: () => void }) {
  const waiting = [...run.steps].reverse().find((s) => s.status === "waiting");
  if (!waiting) return null;
  const d = waiting.data;
  const isSign = run.state === "awaiting_sign_approval";
  const Icon = isSign ? FileSignature : Send;
  return (
    <div className="rise glass ring-accent overflow-hidden">
      <div className="border-b border-line bg-gradient-to-r from-warn/10 to-transparent px-5 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-warn">
          <span className="size-2 rounded-full bg-warn pulse" />
          {isSign ? "Your approval: sign" : "Your approval: submit"}
        </div>
        <p className="mt-1 text-xs text-dim">
          {isSign
            ? run.terms && run.terms !== "PREPAY"
              ? "Goods are already delivered on trusted terms. Sign now, or leave the tab open and pay later."
              : "The payment agent will sign exactly the EIP-712 authorisation the rail returned. Nothing is signed yet."
            : "The signed payment mandate is ready. Nothing moves until you submit it."}
        </p>
      </div>
      <div className="px-5 py-4">
        <div className="text-center">
          <div className="eyebrow">Amount</div>
          <div className="mt-1 font-display text-4xl font-semibold tabular-nums">
            {d.token_total} <span className="text-lg text-dim">{d.coin}</span>
          </div>
          <div className="mt-1 font-mono text-[11px] text-faint">{d.token_total_raw} raw units</div>
        </div>
        <dl className="mt-4 space-y-2 font-mono text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-dim">Recipient</dt>
            <dd title={d.recipient}>{short(d.recipient, 10)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-dim">Payer</dt>
            <dd title={d.payer}>{short(d.payer, 10)}</dd>
          </div>
          {d.quote_expires_at && (
            <div className="flex justify-between gap-2">
              <dt className="text-dim">Quote expires</dt>
              <dd>{new Date(d.quote_expires_at).toLocaleTimeString()}</dd>
            </div>
          )}
        </dl>
        <button onClick={onApprove} disabled={busy} className="btn-primary mt-5 w-full">
          <Icon className="size-4" />
          {busy ? "Working…" : isSign ? "Approve & sign" : "Approve & submit"}
        </button>
      </div>
    </div>
  );
}
