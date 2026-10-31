"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StateBadge from "@/components/StateBadge";
import { RailBadge, SectionHead, TermsBadge } from "@/components/ui";
import { api, short, txUrl, usd, type Run } from "@/lib/api";

function txOf(run: Run, key: string): string | undefined {
  return [...run.steps].reverse().find((s) => s.key === key && s.data?.tx)?.data.tx;
}

function TxLink({ tx }: { tx?: string }) {
  return tx ? (
    <a className="text-accent hover:underline" href={txUrl(tx)} target="_blank" rel="noreferrer">{short(tx, 8)} ↗</a>
  ) : (
    <span className="text-faint">—</span>
  );
}

export default function SettlementsPage() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.runs().then(setRuns).catch((e) => setError(e.message));
  }, []);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <SectionHead
        eyebrow="Settlements"
        title="Every purchase, with its proof."
        body="Payment transaction, on-chain anchor and trust change for every agent purchase. Seeded runs built the demo histories through the same flow."
      />
      {error && <p className="mt-4 text-sm text-bad">{error}</p>}

      <div className="glass mt-8 overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="text-left text-xs text-dim">
            <tr className="border-b border-line">
              {["Agent", "State", "Rail", "Terms", "Amount", "Payment tx", "Anchor tx", "Trust", "When"].map((h) => (
                <th key={h} className="px-4 py-3.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs?.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-dim">
                  No settlements yet. <Link href="/console" className="text-accent hover:underline">Run one in the console</Link>.
                </td>
              </tr>
            )}
            {!runs && !error && (
              <tr><td colSpan={9} className="p-4"><div className="shimmer h-24" /></td></tr>
            )}
            {runs?.map((r) => (
              <tr key={r.id} className="border-b border-line/60 transition last:border-0 hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <div className="font-medium">{r.persona_name ?? "—"}</div>
                  {r.seeded && <div className="text-[10px] text-faint">seeded history</div>}
                </td>
                <td className="px-4 py-3"><StateBadge state={r.state} /></td>
                <td className="px-4 py-3"><RailBadge rail={r.rail} /></td>
                <td className="px-4 py-3"><TermsBadge terms={r.terms} /></td>
                <td className="px-4 py-3 font-mono text-xs">{r.total_usd ? usd(r.total_usd) : "—"}</td>
                <td className="px-4 py-3 font-mono text-xs"><TxLink tx={r.steps.find((s) => s.key === "settled")?.data?.tx} /></td>
                <td className="px-4 py-3 font-mono text-xs"><TxLink tx={txOf(r, "anchor")} /></td>
                <td className="px-4 py-3 font-mono text-xs">
                  {r.trust_after ? <>{r.trust_before} → <span className="text-accent">{r.trust_after}</span></> : r.trust_before ?? "—"}
                </td>
                <td className="px-4 py-3 text-xs text-dim">{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
