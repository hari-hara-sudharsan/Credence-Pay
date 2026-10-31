"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AgentAvatar, SectionHead, TermsBadge, TrustBar } from "@/components/ui";
import { api, short, usd, type LeaderRow } from "@/lib/api";

const RULES = [
  ["Base", "500", "every agent starts here"],
  ["On-time settlement", "+15", "up to 20 payments (+300)"],
  ["Volume", "+1 / $10", "up to +100"],
  ["Late payment", "−40", "settled after the due date"],
  ["Default", "−150", "and terms drop to prepay"],
];

export default function AgentsPage() {
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.leaderboard().then(setRows).catch((e) => setError(e.message));
  }, []);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <SectionHead
        eyebrow="Agent trust bureau"
        title="Every agent's payment record, on-chain."
        body="Scores are computed by the A2ASettlementRegistry contract from settlement history. Any merchant agent can read trustScore() and termsFor() for free."
      />
      {error && <p className="mt-4 text-sm text-bad">{error}</p>}

      <div className="mt-8 grid gap-4">
        {(rows ?? Array.from<LeaderRow | undefined>({ length: 4 })).map((r, i) =>
          r ? (
            <Link key={r.id} href={`/agents/${r.address}`} className="glass glass-hover grid items-center gap-5 p-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_auto_auto]">
              <div className="flex items-center gap-4">
                <span className="w-5 font-mono text-sm text-faint">#{i + 1}</span>
                <AgentAvatar name={r.name} color={r.color} size={44} />
                <div className="min-w-0">
                  <div className="font-medium">{r.name}</div>
                  <div className="truncate text-xs text-faint">{r.owner} · <span className="font-mono">{short(r.address)}</span></div>
                </div>
              </div>
              <TrustBar score={r.trust_score} />
              <div className="flex gap-6 text-center text-xs">
                {[
                  ["Settled", r.stats.settled_count],
                  ["Late", r.stats.late_count],
                  ["Defaults", r.stats.default_count],
                  ["Volume", usd(r.stats.settled_volume, 0)],
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <div className={`font-display text-base font-semibold tabular-nums ${k === "Defaults" && Number(v) > 0 ? "text-bad" : ""}`}>{v}</div>
                    <div className="text-faint">{k}</div>
                  </div>
                ))}
              </div>
              <div className="md:text-right"><TermsBadge terms={r.terms.terms} /></div>
            </Link>
          ) : (
            <div key={i} className="glass h-24 p-5"><div className="shimmer h-full" /></div>
          ),
        )}
      </div>

      <section className="mt-12 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="glass p-6">
          <div className="eyebrow">How the score works</div>
          <ul className="mt-4 divide-y divide-line">
            {RULES.map(([k, v, h]) => (
              <li key={k} className="flex items-center justify-between py-2.5 text-sm">
                <span>{k} <span className="text-xs text-faint">· {h}</span></span>
                <span className={`font-mono ${v.startsWith("−") ? "text-bad" : "text-accent"}`}>{v}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="glass p-6">
          <div className="eyebrow">Score → terms</div>
          <div className="mt-6 space-y-4">
            {[
              ["PREPAY", "300 – 559, or any default", "Pays before goods are delivered."],
              ["NET", "560 – 699", "Goods first, $25 open limit, due in 7 days."],
              ["CREDIT", "700 – 900", "Open tab from $25 to $225, due in 30 days."],
            ].map(([t, band, body]) => (
              <div key={t} className="flex items-start gap-4">
                <TermsBadge terms={t} className="mt-0.5 w-28 justify-center" />
                <div>
                  <div className="font-mono text-xs text-dim">{band}</div>
                  <div className="text-sm">{body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
