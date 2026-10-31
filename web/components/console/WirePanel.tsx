"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- renders arbitrary JSON-RPC payloads */

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronRight } from "lucide-react";
import type { WireEntry } from "@/lib/api";

// Summarise a JSON-RPC exchange in one line: which AP2 / Credence parts it carried, and the task state.
function describe(w: WireEntry): string {
  const p = w.payload ?? {};
  if (w.kind === "GET agent-card") return p.url ?? "";
  if (w.kind === "AgentCard") return `${p.name ?? "agent"} · A2A ${p.protocolVersion ?? ""} · ${(p.skills ?? []).length} skills`;
  if (w.dir === "out") {
    const parts = p.params?.message?.parts ?? [];
    const keys = parts.flatMap((pt: any) => (pt.kind === "data" ? Object.keys(pt.data ?? {}) : [pt.kind]));
    return keys.map((k: string) => k.replace("ap2.mandates.", "").replace("credence.", "")).join(" + ");
  }
  if (p.error) return `error ${p.error.code}: ${p.error.message}`;
  const r = p.result ?? {};
  const arts = (r.artifacts ?? []).map((a: any) => a.name).join(", ");
  return `${r.status?.state ?? ""}${arts ? ` · ${arts}` : ""}`;
}

function Row({ w, i }: { w: WireEntry; i: number }) {
  const [open, setOpen] = useState(false);
  const out = w.dir === "out";
  const state = w.payload?.result?.status?.state as string | undefined;
  const tone =
    w.kind === "error" || state === "rejected" || state === "failed" ? "text-bad"
    : state === "completed" ? "text-accent"
    : state === "input-required" ? "text-accent-2"
    : "text-dim";
  return (
    <li className="rise" style={{ animationDelay: `${i * 25}ms` }}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.035] ${out ? "" : "pl-8"}`}
      >
        <span className={`grid size-7 shrink-0 place-items-center rounded-lg border ${out ? "border-info/30 bg-info/10 text-info" : "border-accent/30 bg-accent/10 text-accent"}`}>
          {out ? <ArrowUpRight className="size-3.5" /> : <ArrowDownLeft className="size-3.5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="font-mono text-xs text-ink">{w.kind}</span>
            <span className="text-[10px] text-faint">{out ? "payment agent → receiving agent" : "receiving agent → payment agent"}</span>
          </span>
          <span className={`block truncate text-xs ${tone}`}>{describe(w)}</span>
        </span>
        {w.ms != null && <span className="shrink-0 font-mono text-[10px] text-faint">{w.ms} ms</span>}
        <ChevronRight className={`size-3.5 shrink-0 text-faint transition ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <pre className="code-surface mx-3 mb-2 max-h-80 overflow-auto p-3 text-dim">{JSON.stringify(w.payload, null, 2)}</pre>
      )}
    </li>
  );
}

export default function WirePanel({ wire }: { wire?: WireEntry[] }) {
  if (!wire?.length) {
    return <p className="py-10 text-center text-sm text-faint">No A2A traffic recorded for this run. Runs started before the A2A upgrade did not record their messages.</p>;
  }
  const sends = wire.filter((w) => w.dir === "out" && w.kind === "message/send").length;
  return (
    <div>
      <p className="mb-3 text-xs text-dim">
        The actual JSON-RPC messages exchanged between the two agents over A2A: {sends} <span className="font-mono">message/send</span> calls carrying
        AP2 mandates. Click a message to see the full payload.
      </p>
      <ol className="space-y-0.5">{wire.map((w, i) => <Row key={i} w={w} i={i} />)}</ol>
    </div>
  );
}
