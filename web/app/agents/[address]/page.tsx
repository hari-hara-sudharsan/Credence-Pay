"use client";

import { use, useEffect, useState } from "react";
import TrustPanel from "@/components/console/TrustPanel";
import { addrUrl, api, type Trust } from "@/lib/api";

export default function AgentPassport({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const [trust, setTrust] = useState<Trust | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.trust(address).then(setTrust).catch((e) => setError(e.message));
  }, [address]);

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <h1 className="text-xl font-semibold tracking-tight">Agent trust passport</h1>
      <a href={addrUrl(address)} target="_blank" rel="noreferrer" className="mt-1 block font-mono text-xs break-all text-accent hover:underline">
        {address}
      </a>
      {error ? <p className="mt-6 text-sm text-bad">{error}</p> : <div className="mt-6"><TrustPanel trust={trust} /></div>}
    </main>
  );
}
