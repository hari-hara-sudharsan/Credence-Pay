import type { Run } from "@/lib/api";

const STATE_STYLE: Record<Run["state"], string> = {
  running: "text-info border-info/40",
  awaiting_sign_approval: "text-warn border-warn/40",
  awaiting_submit_approval: "text-warn border-warn/40",
  settling: "text-info border-info/40",
  settled: "text-accent border-accent/40",
  failed: "text-bad border-bad/40",
};

export default function StateBadge({ state }: { state: Run["state"] }) {
  return (
    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase ${STATE_STYLE[state]}`}>
      {state.replaceAll("_", " ")}
    </span>
  );
}
