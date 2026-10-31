"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function NetworkStats() {
  const [stats, setStats] = useState<{ total_settled: number; total_volume: number } | null>(null);
  const [health, setHealth] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    api.network().then(setStats).catch(() => {});
    api.health().then(setHealth).catch(() => {});
  }, []);

  const items = [
    ["A2A settlements anchored", stats ? stats.total_settled : "—"],
    ["Volume settled", stats ? `$${stats.total_volume.toFixed(2)}` : "—"],
    ["Network", health ? `${health.network} (${health.chain_id})` : "—"],
  ];
  return (
    <dl className="mt-12 grid max-w-2xl grid-cols-3 gap-4">
      {items.map(([k, v]) => (
        <div key={k as string}>
          <dt className="text-xs text-faint">{k}</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
