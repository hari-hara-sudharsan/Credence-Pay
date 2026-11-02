import { SNAPSHOT } from "@/lib/api";

/** Shown only on public showcase builds, so nobody mistakes the snapshot for a live agent service. */
export default function SnapshotBanner() {
  if (!SNAPSHOT) return null;
  return (
    <div className="relative z-40 border-b border-line bg-accent/10 px-4 py-2 text-center text-xs text-dim">
      Showcase build: agent data is a snapshot of the live HSK testnet agents, and contract links are real.{" "}
      <a href="https://github.com/hari-hara-sudharsan/Credence-Pay#run-it-locally" className="underline hover:text-ink" target="_blank" rel="noreferrer">
        Run it locally
      </a>{" "}
      to make a payment.
    </div>
  );
}
