"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, Copy, ExternalLink, LogOut, ShieldCheck, Wallet } from "lucide-react";
import { short } from "@/lib/api";

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, fn: (arg: never) => void) => void;
  removeListener?: (event: string, fn: (arg: never) => void) => void;
};

declare global {
  interface Window {
    ethereum?: Eip1193;
  }
}

export type HskChain = { id: number; name: string; rpc: string; explorer: string };

export const HSK_CHAINS: Record<string, HskChain> = {
  "hashkey-testnet": { id: 133, name: "HashKey Chain Testnet", rpc: "https://testnet.hsk.xyz", explorer: "https://testnet-explorer.hskchain.net" },
  hashkey: { id: 177, name: "HashKey Chain", rpc: "https://mainnet.hsk.xyz", explorer: "https://hsk.blockscout.com" },
};

const FORGOT_KEY = "credence.wallet.disconnected";
const hex = (n: number) => `0x${n.toString(16)}`;
const noSubscribe = () => () => {};

function remember(disconnected: boolean) {
  try {
    if (disconnected) localStorage.setItem(FORGOT_KEY, "1");
    else localStorage.removeItem(FORGOT_KEY);
  } catch {}
}

function forgotten() {
  try {
    return localStorage.getItem(FORGOT_KEY) === "1";
  } catch {
    return false;
  }
}

export default function ConnectWallet({ chain }: { chain: HskChain }) {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  // True on the server and first paint; reads window.ethereum once hydrated.
  const hasWallet = useSyncExternalStore(noSubscribe, () => !!window.ethereum, () => true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Restore a connection the wallet already granted, and follow account / network changes.
  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) return;
    const onAccounts = (accs: string[]) => {
      setAccount(accs[0] ?? null);
      if (!accs[0]) setOpen(false);
    };
    const onChain = (id: string) => setChainId(parseInt(id, 16));
    if (!forgotten()) eth.request({ method: "eth_accounts" }).then((a) => onAccounts(a as string[])).catch(() => {});
    eth.request({ method: "eth_chainId" }).then((id) => onChain(id as string)).catch(() => {});
    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, []);

  // Close the menu on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const switchChain = useCallback(async () => {
    const eth = window.ethereum;
    if (!eth) return;
    setError(null);
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex(chain.id) }] });
    } catch (e) {
      const err = e as { code?: number; message?: string };
      if (err.code === 4902 || err.code === -32603) {
        // The wallet does not know this chain yet: add it (this also switches to it).
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: hex(chain.id),
            chainName: chain.name,
            nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
            rpcUrls: [chain.rpc],
            blockExplorerUrls: [chain.explorer],
          }],
        });
      } else if (err.code !== 4001) {
        throw e;
      }
    }
  }, [chain]);

  async function connect() {
    const eth = window.ethereum;
    if (!eth) return;
    setBusy(true);
    setError(null);
    try {
      const accs = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      setAccount(accs[0] ?? null);
      remember(false);
      const current = parseInt((await eth.request({ method: "eth_chainId" })) as string, 16);
      setChainId(current);
      if (current !== chain.id) await switchChain();
    } catch (e) {
      const err = e as { code?: number; message?: string };
      setError(err.code === 4001 ? "Request rejected in the wallet." : err.message ?? "Could not connect.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    remember(true);
    setAccount(null);
    setOpen(false);
    // Supported by MetaMask and some others; harmless where it is not.
    await window.ethereum?.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }).catch(() => {});
  }

  async function copy() {
    if (!account) return;
    await navigator.clipboard.writeText(account).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!hasWallet) {
    return (
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noreferrer"
        title="No browser wallet found. Install one, such as MetaMask, to connect."
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.07] px-3 py-1.5 text-[12.5px] text-dim hover:text-ink"
      >
        <Wallet className="size-3.5" /> <span className="hidden sm:inline">Get a wallet</span>
      </a>
    );
  }

  if (!account) {
    return (
      <div className="relative shrink-0">
        <button
          onClick={connect}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-medium text-black transition hover:bg-white/90 disabled:opacity-60"
        >
          <Wallet className="size-3.5" /> <span className="hidden sm:inline">{busy ? "Connecting…" : "Connect wallet"}</span>
        </button>
        {error && (
          <p role="alert" className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-bad/30 bg-[rgb(22_22_23)] px-3 py-2 text-xs text-bad shadow-xl">
            {error}
          </p>
        )}
      </div>
    );
  }

  const wrongChain = chainId !== null && chainId !== chain.id;

  return (
    <div ref={box} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] transition ${wrongChain ? "bg-warn/15 text-warn" : "bg-white/10 text-ink hover:bg-white/15"}`}
      >
        <span className={`size-1.5 rounded-full ${wrongChain ? "bg-warn" : "bg-good"}`} />
        <span className="font-mono">{short(account, 6)}</span>
        <ChevronDown className={`size-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 w-64 overflow-hidden rounded-2xl border border-line bg-[rgb(22_22_23)] p-1.5 text-sm shadow-2xl">
          <div className="px-3 py-2">
            <div className="text-[11px] text-faint">Connected wallet</div>
            <div className="mt-0.5 font-mono text-xs break-all text-ink">{account}</div>
            <div className={`mt-2 flex items-center gap-1.5 text-xs ${wrongChain ? "text-warn" : "text-dim"}`}>
              <span className={`size-1.5 rounded-full ${wrongChain ? "bg-warn" : "bg-good"}`} />
              {wrongChain ? `Wrong network (chain ${chainId})` : chain.name}
            </div>
          </div>
          {wrongChain && (
            <button
              role="menuitem"
              onClick={() => switchChain().catch((e) => setError((e as Error).message))}
              className="mx-1.5 mb-1.5 w-[calc(100%-12px)] rounded-xl bg-warn/15 px-3 py-2 text-left text-xs font-medium text-warn hover:bg-warn/25"
            >
              Switch to {chain.name}
            </button>
          )}
          {error && <p className="px-3 pb-2 text-xs text-bad">{error}</p>}
          <div className="border-t border-line pt-1">
            <Link role="menuitem" href={`/agents/${account}`} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-dim hover:bg-white/5 hover:text-ink">
              <ShieldCheck className="size-4" /> View trust passport
            </Link>
            <button role="menuitem" onClick={copy} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-dim hover:bg-white/5 hover:text-ink">
              {copied ? <Check className="size-4 text-good" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy address"}
            </button>
            <a role="menuitem" href={`${chain.explorer}/address/${account}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl px-3 py-2 text-dim hover:bg-white/5 hover:text-ink">
              <ExternalLink className="size-4" /> View on explorer
            </a>
            <button role="menuitem" onClick={disconnect} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-bad hover:bg-bad/10">
              <LogOut className="size-4" /> Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
