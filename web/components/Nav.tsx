"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import ConnectWallet, { HSK_CHAINS } from "@/components/ConnectWallet";

const LINKS = [
  { href: "/console", label: "Console" },
  { href: "/agents", label: "Agents" },
  { href: "/business", label: "Business" },
  { href: "/settlements", label: "Settlements" },
  { href: "/developers", label: "Developers" },
];

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden>
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2997ff" />
          <stop offset="0.6" stopColor="#a970ff" />
          <stop offset="1" stopColor="#ff6482" />
        </linearGradient>
      </defs>
      <path d="M17.5 6.5a7.5 7.5 0 1 0 0 11" stroke="url(#logo-g)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="18" cy="12" r="1.7" fill="url(#logo-g)" />
    </svg>
  );
}

export default function Nav() {
  const path = usePathname();
  const [online, setOnline] = useState<boolean | null>(null);
  const [network, setNetwork] = useState("");
  const [chainKey, setChainKey] = useState("hashkey-testnet");

  useEffect(() => {
    api
      .health()
      .then((h) => {
        setOnline(true);
        setNetwork(h.network === "hashkey-testnet" ? "HSK Testnet" : "HSK Mainnet");
        if (h.network in HSK_CHAINS) setChainKey(h.network);
      })
      .catch(() => setOnline(false));
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[rgb(22_22_23/0.78)] backdrop-blur-xl backdrop-saturate-150">
      <nav className="mx-auto flex h-12 max-w-6xl items-center gap-2 px-4 sm:gap-6 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Credence home">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">Credence</span>
        </Link>
        <div className="flex min-w-0 flex-1 justify-center gap-0.5 overflow-x-auto text-[12.5px] sm:gap-2">
          {LINKS.map((l) => {
            const active = path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 whitespace-nowrap transition-colors ${active ? "bg-white/10 text-ink" : "text-dim hover:text-ink"}`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
        <span className="hidden shrink-0 items-center gap-1.5 text-[12px] text-dim md:flex" title={online === false ? "Start the agent service" : "Agent service connected"}>
          <span className={`size-1.5 rounded-full ${online === false ? "bg-bad" : online ? "bg-good" : "bg-faint"}`} />
          {online === false ? "Offline" : network || "Connecting"}
        </span>
        <ConnectWallet chain={HSK_CHAINS[chainKey]} />
      </nav>
    </header>
  );
}
