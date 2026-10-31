"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StateBadge from "@/components/StateBadge";
import { api, short, txUrl, type Run } from "@/lib/api";

function txOf(run: Run, key: string): string | undefined {
  return [...run.steps].reverse().find((s) => s.key === key && s.data?.tx)?.data.tx;
}

export default function SettlementsPage() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.runs().then(setRuns).catch((e) => setError(e.message));
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-xl font-semibold tracking-tight">Settlements</h1>
      <p className="text-sm text-dim">Every agent purchase with its HSP identifiers, payment transaction and on-chain trust anchor.</p>
      {error && <p className="mt-4 text-sm text-bad">{error}</p>}

      <div className="panel mt-6 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-dim">
            <tr className="border-b border-line">
              {["State", "Terms", "HSP flow", "HSP status", "Payment tx", "Anchor tx", "Trust", "When"].map((h) => (
                <th key={h} className="px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {runs?.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center font-sans text-dim">
                  No settlements yet. <Link href="/console" className="text-accent hover:underline">Run one in the console</Link>.
                </td>
              </tr>
            )}
            {runs?.map((r) => {
              const pay = r.steps.find((s) => s.key === "settled")?.data?.tx;
              const anchor = txOf(r, "anchor");
              return (
                <tr key={r.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3"><StateBadge state={r.state} /></td>
                  <td className="px-4 py-3">{r.terms ?? "—"}</td>
                  <td className="px-4 py-3 text-dim">{r.order?.flow_id ?? "—"}</td>
                  <td className="px-4 py-3 text-dim">{r.payment_status ?? "—"}</td>
                  <td className="px-4 py-3">{pay ? <a className="text-accent hover:underline" href={txUrl(pay)} target="_blank" rel="noreferrer">{short(pay, 8)}</a> : "—"}</td>
                  <td className="px-4 py-3">{anchor ? <a className="text-accent hover:underline" href={txUrl(anchor)} target="_blank" rel="noreferrer">{short(anchor, 8)}</a> : "—"}</td>
                  <td className="px-4 py-3">{r.trust_after ? `${r.trust_before} → ${r.trust_after}` : r.trust_before ?? "—"}</td>
                  <td className="px-4 py-3 text-dim">{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
