"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Coins, Landmark, Rocket, ShieldCheck, Store, Users } from "lucide-react";
import { Kpi, SectionHead } from "@/components/ui";
import { TERMS_COLOR, TERMS_LABEL, api, pct, usd, type Business } from "@/lib/api";

const PRODUCT_LABEL: Record<string, string> = {
  risk_report: "Risk reports",
  trust_attestation: "Attestations",
  portfolio_scan: "Portfolio scans",
};

const STREAMS = [
  { icon: Coins, title: "Deferred-terms fee", price: "1.5% of Net / Credit volume", body: "Accrued on-chain per merchant by the registry on every deferred settlement Credence underwrites. Prepay volume is free." },
  { icon: Users, title: "Trust API", price: "$0.002 per check above free tier", body: "On-chain reads stay free. Agent platforms pay for hosted scoring, webhooks and risk reports at volume." },
  { icon: Landmark, title: "Pool-backed credit", price: "Spread on capital lent", body: "Credence funds credit tabs from a liquidity pool (LendingPool is already deployed) and earns the spread on the risk it prices." },
  { icon: ShieldCheck, title: "Risk intelligence", price: "$1 – $6 per report", body: "Wallet and counterparty reports sold agent-to-agent over HSP. Credence is its own first customer." },
];

const GTM = [
  { icon: Store, phase: "Now", title: "HSP merchants on HSK Chain", body: "Design partners selling data, compute and APIs to agents. Credence is the risk layer they add to HSP checkout." },
  { icon: Users, phase: "Next", title: "Agent platforms", body: "SDK and MCP tools so agent frameworks can read trust and request terms before they pay." },
  { icon: Rocket, phase: "Then", title: "Credit at scale", body: "Pool-backed tabs, cross-chain trust via CCIP, and institutional underwriting with HashKey ecosystem partners." },
];

function Slider({ label, value, set, min, max, step, fmt }: { label: string; value: number; set: (n: number) => void; min: number; max: number; step: number; fmt: (n: number) => string }) {
  return (
    <label className="block">
      <div className="flex justify-between text-xs">
        <span className="text-dim">{label}</span>
        <span className="font-mono">{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} className="mt-2 w-full accent-[#3ee6b0]" />
    </label>
  );
}

export default function BusinessPage() {
  const [b, setB] = useState<Business | null>(null);
  const [error, setError] = useState<string | null>(null);

  // projection inputs (assumptions, not results)
  const [gmv, setGmv] = useState(2_000_000);
  const [deferred, setDeferred] = useState(0.4);
  const [feeBps, setFeeBps] = useState(150);
  const [checks, setChecks] = useState(20_000_000);
  const [lossRate, setLossRate] = useState(0.01);
  const [poolShare, setPoolShare] = useState(0.25);

  useEffect(() => {
    api.business().then(setB).catch((e) => setError(e.message));
  }, []);

  const termData = useMemo(
    () => (b ? (["PREPAY", "NET", "CREDIT"] as const).map((t) => ({ name: TERMS_LABEL[t], key: t, value: b.chain.volume_by_terms[t] })) : []),
    [b],
  );
  const productData = useMemo(
    () => (b ? Object.entries(b.revenue_by_product).map(([k, v]) => ({ name: PRODUCT_LABEL[k] ?? k, value: v })) : []),
    [b],
  );

  const model = useMemo(() => {
    const deferredVol = gmv * deferred;
    const feeRev = (deferredVol * feeBps) / 10_000;
    const apiRev = checks * 0.002;
    const pooled = deferredVol * poolShare;
    const spread = pooled * 0.02;
    const losses = pooled * lossRate;
    return { deferredVol, feeRev, apiRev, spread, losses, net: feeRev + apiRev + spread - losses };
  }, [gmv, deferred, feeBps, checks, lossRate, poolShare]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <SectionHead
        eyebrow="Business"
        title="A risk layer that earns on every trusted payment."
        body="Live numbers below are read from the Credence contracts on HSK testnet and from the agent service. Nothing on this half of the page is estimated."
      />
      {error && <p className="mt-4 text-sm text-bad">{error}</p>}

      {/* live KPIs */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Merchant revenue settled" value={b ? usd(b.merchant_revenue_usd) : "—"} hint={b ? `${b.chain.total_settled} on-chain settlements` : undefined} />
        <Kpi label="Credence fees accrued" value={b ? usd(b.credence_fees_usd, 3) : "—"} hint={b ? `${b.chain.fee_bps / 100}% on deferred volume, on-chain` : undefined} accent="#3ee6b0" />
        <Kpi label="Volume on trusted terms" value={b ? pct(b.deferred_share) : "—"} hint="Net + Credit share of settled volume" />
        <Kpi label="Defaulted volume" value={b ? usd(b.chain.total_defaulted) : "—"} hint={b ? `${pct(b.default_rate)} of deferred exposure` : undefined} accent={b && b.chain.total_defaulted > 0 ? "#ff6b81" : undefined} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Kpi label="Purchases settled" value={b ? `${b.runs_settled} / ${b.runs_started}` : "—"} hint="settled / started" />
        <Kpi label="Blocked by owner policy" value={b ? b.policy_blocks : "—"} hint="stopped before any signature" />
        <Kpi label="Open tabs" value={b ? b.open_tabs : "—"} hint={b ? `${usd(b.open_tab_usd)} delivered, awaiting payment` : undefined} />
      </div>

      {/* charts */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="glass p-6">
          <div className="eyebrow">Settled volume by terms</div>
          <div className="mt-4 flex items-center gap-6">
            <div className="h-52 w-52 shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={termData} dataKey="value" innerRadius={58} outerRadius={88} paddingAngle={3} stroke="none">
                    {termData.map((d) => <Cell key={d.key} fill={TERMS_COLOR[d.key]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => usd(Number(v))} contentStyle={{ background: "#0f1528", border: "1px solid rgb(122 142 196 / 0.3)", borderRadius: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-3 text-sm">
              {termData.map((d) => (
                <li key={d.key} className="flex items-center gap-3">
                  <span className="size-2.5 rounded-full" style={{ background: TERMS_COLOR[d.key] }} />
                  <span className="w-20 text-dim">{d.name}</span>
                  <span className="font-mono">{usd(d.value)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className="glass p-6">
          <div className="eyebrow">Merchant revenue by product</div>
          <div className="mt-4 h-52">
            <ResponsiveContainer>
              <BarChart data={productData} margin={{ left: -10 }}>
                <XAxis dataKey="name" tick={{ fill: "#9aa6c4", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64708f", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip cursor={{ fill: "rgb(255 255 255 / 0.04)" }} formatter={(v) => usd(Number(v))} contentStyle={{ background: "#0f1528", border: "1px solid rgb(122 142 196 / 0.3)", borderRadius: 12 }} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="url(#barGrad)" />
                <defs>
                  <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#3ee6b0" />
                    <stop offset="1" stopColor="#22c3e6" stopOpacity="0.4" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* revenue model */}
      <section className="mt-16">
        <SectionHead eyebrow="Revenue model" title="Four ways Credence earns." />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STREAMS.map(({ icon: Icon, title, price, body }) => (
            <div key={title} className="glass p-6">
              <span className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent"><Icon className="size-5" /></span>
              <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
              <div className="mt-1 text-sm text-accent">{price}</div>
              <p className="mt-2 text-sm leading-relaxed text-dim">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* projection */}
      <section className="mt-16">
        <SectionHead
          eyebrow="Unit economics model"
          title="What one year of agent commerce could look like."
          body="A projection, not a result. Move the assumptions; the model applies the same fee and terms rules the contracts enforce."
        />
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div className="glass space-y-5 p-6">
            <Slider label="Monthly agent GMV through HSP merchants" value={gmv} set={setGmv} min={100_000} max={20_000_000} step={100_000} fmt={(n) => usd(n, 0)} />
            <Slider label="Share settled on Net / Credit terms" value={deferred} set={setDeferred} min={0.05} max={0.9} step={0.05} fmt={pct} />
            <Slider label="Credence fee on deferred volume" value={feeBps} set={setFeeBps} min={25} max={400} step={25} fmt={(n) => `${n / 100}%`} />
            <Slider label="Trust API checks per month" value={checks} set={setChecks} min={0} max={200_000_000} step={1_000_000} fmt={(n) => n.toLocaleString()} />
            <Slider label="Share of deferred volume funded by Credence pool" value={poolShare} set={setPoolShare} min={0} max={1} step={0.05} fmt={pct} />
            <Slider label="Loss rate on pool-funded tabs" value={lossRate} set={setLossRate} min={0} max={0.08} step={0.005} fmt={pct} />
          </div>
          <div className="glass p-6">
            <div className="eyebrow">Monthly projection</div>
            <dl className="mt-4 divide-y divide-line text-sm">
              {[
                ["Deferred-terms volume", model.deferredVol, ""],
                ["Fee revenue", model.feeRev, "text-accent"],
                ["Trust API revenue", model.apiRev, "text-accent"],
                ["Pool spread (2% on funded tabs)", model.spread, "text-accent"],
                ["Expected credit losses", -model.losses, "text-bad"],
              ].map(([k, v, c]) => (
                <div key={k as string} className="flex justify-between py-2.5">
                  <dt className="text-dim">{k}</dt>
                  <dd className={`font-mono ${c}`}>{usd(v as number, 0)}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-dim">Net monthly revenue</span>
                <span className="font-display text-3xl font-semibold text-accent">{usd(model.net, 0)}</span>
              </div>
              <div className="mt-1 text-right text-xs text-faint">{usd(model.net * 12, 0)} annualised</div>
            </div>
            <p className="mt-4 text-xs text-faint">
              Defaults lower an agent&apos;s score by 150 and force prepay on-chain, so a defaulting agent cannot keep drawing credit.
            </p>
          </div>
        </div>
      </section>

      {/* GTM */}
      <section className="mt-16">
        <SectionHead eyebrow="Go to market" title="Start where agent payments already settle." body="HSP is the payment rail on HSK Chain. Credence plugs into it as the risk layer, so every Credence-rated purchase is HSP volume." />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {GTM.map(({ icon: Icon, phase, title, body }) => (
            <div key={title} className="glass p-6">
              <div className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-xl bg-violet/15 text-violet"><Icon className="size-5" /></span>
                <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-dim">{phase}</span>
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-dim">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
