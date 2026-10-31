import { SectionHead } from "@/components/ui";
import { DEPLOYMENTS } from "@/lib/contracts";

const HSP_STEPS = [
  ["get_chain_config", "Payment agent", "Network, token contract, decimals and protocol (eip3009 / permit2). Never chosen from memory."],
  ["create_order", "Receiving agent", "Cart mandate with x402 method data, USD line items and expiry. HSP generates the merchant JWT."],
  ["get_order", "Payment agent", "Reads the order back, including gas_fee_advanced."],
  ["prepare_payment", "Payment agent", "HSP locks a 5-minute quote and returns the EIP-712 data and token_total_raw."],
  ["—", "Credence", "Checks pay_to, payer, budget, on-chain spending policy and token balance. Human approves signing."],
  ["finalize_payment", "Payment agent", "Signature over the exact returned eip712; HSP computes payment_hash and the mandate JWT."],
  ["submit_payment", "Payment agent", "After a second human approval, payment_mandate_json goes to the HSP Gateway unchanged."],
  ["query_payment", "Credence", "Polled every 15 s with expected_merchant_name until payment-safe / finalized / failed."],
  ["recordSettlement", "Credence registry", "Anchors cart hash, HSP flow id and tx hash; trust, terms and the fee ledger update on-chain."],
];

const API_ROUTES = [
  ["POST", "/a2a/runs", "Start a purchase from a natural-language instruction"],
  ["POST", "/a2a/runs/{id}/approve-sign", "Human approval: sign and finalize"],
  ["POST", "/a2a/runs/{id}/approve-submit", "Human approval: submit to HSP Gateway"],
  ["GET", "/a2a/runs/{id}", "Run state; polls HSP while settling"],
  ["GET", "/agents/{address}/trust", "Trust score, terms, settlement stats and owner policy"],
  ["GET", "/agents/leaderboard", "All agents ranked by on-chain trust"],
  ["GET", "/business", "Live marketplace economics from chain state"],
  ["GET", "/hsp/status", "Whether this server can reach the HSP MCP server"],
];

const SNIPPET = `// Price any agent counterparty from its on-chain settlement record
const registry = new ethers.Contract(REGISTRY, abi, provider);
const score = await registry.trustScore(agent);          // 300 – 900
const [terms, creditLimit, netDays] = await registry.termsFor(agent);
// terms: 0 = PREPAY, 1 = NET, 2 = CREDIT (creditLimit in 6-decimal units)`;

export default function DevelopersPage() {
  return (
    <main className="mx-auto max-w-7xl space-y-12 px-4 py-8 sm:px-6">
      <SectionHead eyebrow="Developers" title="Built on HSP. Readable by anyone." body="How Credence uses HSP Agentic Payment, and how any agent or protocol can read Credence trust." />

      <section>
        <h2 className="eyebrow">Payment flow over the HSP MCP server</h2>
        <ol className="glass mt-3 divide-y divide-line">
          {HSP_STEPS.map(([tool, who, what], i) => (
            <li key={i} className="grid gap-1 px-5 py-3.5 text-sm sm:grid-cols-[180px_160px_1fr]">
              <code className="font-mono text-sm text-accent">{tool}</code>
              <span className="text-dim">{who}</span>
              <span>{what}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="eyebrow">Contracts</h2>
        {DEPLOYMENTS.map((d) => (
          <div key={d.chainId} className="glass mt-3 overflow-x-auto">
            <div className="border-b border-line px-5 py-3 text-xs text-dim">{d.network} · chain {d.chainId}</div>
            <table className="w-full min-w-[720px] text-sm">
              <tbody>
                {d.contracts.map((c) => (
                  <tr key={c.name} className="border-b border-line/60 last:border-0">
                    <td className="px-5 py-3">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-faint">{c.role}</div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${c.hackathon ? "border-accent/40 text-accent" : "border-line text-dim"}`}>
                        {c.hackathon ? "Hackathon" : "Core"}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">
                      <a href={`${d.explorer}/address/${c.address}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">{c.address}</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="eyebrow">Read trust from any contract or agent</h2>
          <pre className="glass mt-3 overflow-x-auto p-4 font-mono text-xs leading-relaxed text-dim">{SNIPPET}</pre>
        </div>
        <div>
          <h2 className="eyebrow">Agent API</h2>
          <ul className="glass mt-3 divide-y divide-line">
            {API_ROUTES.map(([m, path, desc]) => (
              <li key={path + m} className="px-4 py-2.5 text-sm">
                <span className="mr-2 font-mono text-xs text-accent">{m}</span>
                <code className="font-mono text-xs">{path}</code>
                <p className="text-xs text-dim">{desc}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
