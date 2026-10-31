"use client";

import { use, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import TrustPanel from "@/components/console/TrustPanel";
import { AgentAvatar, TermsBadge } from "@/components/ui";
import { addrUrl, api, type LeaderRow, type Trust } from "@/lib/api";

export default function AgentPassport({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const [trust, setTrust] = useState<Trust | null>(null);
  const [persona, setPersona] = useState<LeaderRow>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.trust(address).then(setTrust).catch((e) => setError(e.message));
    api.leaderboard().then((rows) => setPersona(rows.find((r) => r.address.toLowerCase() === address.toLowerCase()))).catch(() => {});
  }, [address]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="glass relative overflow-hidden p-6 sm:p-8">
        <div className="absolute -top-20 -right-20 size-60 rounded-full blur-3xl" style={{ background: `${persona?.color ?? "#3ee6b0"}33` }} />
        <div className="relative flex flex-wrap items-center gap-5">
          <AgentAvatar name={persona?.name ?? "Agent"} color={persona?.color ?? "#3ee6b0"} size={64} />
          <div className="min-w-0">
            <div className="eyebrow">Agent trust passport</div>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">{persona?.name ?? "Agent"}</h1>
            <a href={addrUrl(address)} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 font-mono text-xs break-all text-dim hover:text-ink">
              {address} <ExternalLink className="size-3" />
            </a>
          </div>
          {trust && <div className="ml-auto"><TermsBadge terms={trust.terms.terms} className="text-sm" /></div>}
        </div>
        {persona && <p className="relative mt-4 text-sm text-dim">Owner: {persona.owner} · {persona.tagline}</p>}
      </div>
      {error ? <p className="mt-6 text-sm text-bad">{error}</p> : <div className="mx-auto mt-6 max-w-md"><TrustPanel trust={trust} /></div>}
    </main>
  );
}
