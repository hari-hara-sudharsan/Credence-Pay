"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const LINKS = [
  { href: "/console", label: "Console" },
  { href: "/agents", label: "Agents" },
  { href: "/business", label: "Business" },
  { href: "/settlements", label: "Settlements" },
  { href: "/developers", label: "Developers" },
];

export function Logo() {
  return (
    <span className="relative grid size-8 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 shadow-[0_0_24px_-6px_var(--color-accent)]">
      <svg viewBox="0 0 24 24" className="size-4.5 text-accent-ink" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
        <path d="M17 7.5a6.5 6.5 0 1 0 0 9" />
        <circle cx="17.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

export default function Nav() {
  const path = usePathname();
  const [online, setOnline] = useState<boolean | null>(null);
  const [network, setNetwork] = useState<string>("");

  useEffect(() => {
    api
      .health()
      .then((h) => {
        setOnline(true);
        setNetwork(h.network === "hashkey-testnet" ? "HSK Testnet" : "HSK Mainnet");
      })
      .catch(() => setOnline(false));
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/70 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="font-display text-lg font-semibold tracking-tight">Credence</span>
        </Link>
        <div className="flex gap-1 overflow-x-auto text-sm">
          {LINKS.map((l) => {
            const active = path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative rounded-lg px-3 py-2 whitespace-nowrap transition ${active ? "text-ink" : "text-dim hover:text-ink"}`}
              >
                {l.label}
                {active && <span className="absolute inset-x-3 -bottom-[13px] h-px bg-gradient-to-r from-accent to-accent-2" />}
              </Link>
            );
          })}
        </div>
        <span className="ml-auto hidden items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs text-dim md:flex">
          <span className={`size-1.5 rounded-full ${online === false ? "bg-bad" : online ? "bg-accent pulse" : "bg-faint"}`} />
          {online === false ? "Agent service offline" : network || "Connecting…"}
        </span>
      </nav>
    </header>
  );
}
