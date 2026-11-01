"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import ConnectWallet, { HSK_CHAINS } from "@/components/ConnectWallet";
import ThemeToggle from "@/components/ThemeToggle";

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
        <linearGradient id={`logo-g-${size}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9aa8ff" />
          <stop offset="0.55" stopColor="#5ee7ff" />
          <stop offset="1" stopColor="#c08cff" />
        </linearGradient>
      </defs>
      <path d="M17.5 6.5a7.5 7.5 0 1 0 0 11" stroke={`url(#logo-g-${size})`} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="18" cy="12" r="1.8" fill="#f2cd85" />
    </svg>
  );
}

export default function Nav() {
  const path = usePathname();
  const [online, setOnline] = useState<boolean | null>(null);
  const [network, setNetwork] = useState("");
  const [chainKey, setChainKey] = useState("hashkey-testnet");
  const [scrolled, setScrolled] = useState(false);
  const [tucked, setTucked] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const linksRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  // Health check, retried every 10 s so the status dot recovers when the service starts.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const check = () =>
      api
        .health()
        .then((h) => {
          setOnline(true);
          setNetwork(h.network === "hashkey-testnet" ? "HSK Testnet" : "HSK Mainnet");
          if (h.network in HSK_CHAINS) setChainKey(h.network);
        })
        .catch(() => {
          setOnline(false);
          timer = setTimeout(check, 10_000);
        });
    check();
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Tuck the nav away while reading down the page; bring it back on any upward scroll.
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 12);
      const using = headerRef.current?.matches(":hover, :focus-within") ?? false;
      if (y < 240 || using) setTucked(false);
      else if (y - lastY > 6) setTucked(true);
      else if (lastY - y > 6) setTucked(false);
      lastY = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Slide the highlight under the active link.
  useLayoutEffect(() => {
    const measure = () => {
      const el = linksRef.current?.querySelector<HTMLElement>("[aria-current='page']");
      setPill(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [path]);

  return (
    <header
      ref={headerRef}
      className={`sticky z-40 px-3 transition-all duration-700 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] sm:px-4 ${scrolled ? "top-2" : "top-3 sm:top-4"} ${
        tucked ? "pointer-events-none -translate-y-[140%] opacity-0" : ""
      }`}
    >
      <nav
        className={`mx-auto flex max-w-6xl items-center gap-2 rounded-full border px-2.5 transition-all duration-500 sm:gap-4 sm:px-3 ${
          scrolled
            ? "h-12 border-line-strong bg-[var(--nav-bg-solid)] shadow-[var(--nav-shadow-solid)]"
            : "h-14 border-line bg-[var(--nav-bg)] shadow-[var(--nav-shadow)]"
        } backdrop-blur-2xl backdrop-saturate-150`}
      >
        <Link href="/" className="group flex shrink-0 items-center gap-2 rounded-full py-1 pr-2 pl-1.5" aria-label="Credence home">
          <span className="transition-transform duration-700 group-hover:rotate-[-25deg]">
            <Logo />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Credence</span>
        </Link>

        <div ref={linksRef} className="relative flex min-w-0 flex-1 justify-start gap-0.5 overflow-x-auto text-[13px] [mask-image:linear-gradient(90deg,black_85%,transparent)] [scrollbar-width:none] sm:gap-1 md:justify-center md:[mask-image:none]">
          {pill && (
            <span
              aria-hidden
              className="absolute inset-y-1 rounded-full bg-gradient-to-b from-white/[0.13] to-white/[0.05] shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] transition-all duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]"
              style={{ left: pill.left, width: pill.width }}
            />
          )}
          {LINKS.map((l) => {
            const active = path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`relative rounded-full px-3.5 py-2 whitespace-nowrap transition-colors duration-300 ${active ? "text-ink" : "text-dim hover:text-ink"}`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>

        {/* Credence contracts are live on HSK Mainnet; the interactive demo runs on the network the agent service uses. */}
        <Link
          href="/developers"
          className="hidden shrink-0 items-center gap-2 rounded-full border border-line bg-white/[0.03] px-3 py-1.5 text-[12px] text-dim transition-colors hover:border-gold/40 hover:text-ink md:flex"
          title={
            online === false
              ? "Contracts live on HSK Mainnet. Agent service offline: start it to run the demo."
              : `Contracts live on HSK Mainnet. Live demo purchases run on ${network || "the agent's network"}.`
          }
        >
          <span className={`ping size-1.5 rounded-full ${online === false ? "bg-bad" : "bg-good"}`} />
          <span className="font-medium text-ink">HSK Mainnet</span>
          <span className="hidden text-faint lg:inline">· {online === false ? "agent offline" : `demo on ${(network || "testnet").replace("HSK ", "").toLowerCase()}`}</span>
        </Link>
        <ThemeToggle />
        <ConnectWallet chain={HSK_CHAINS[chainKey]} />
      </nav>
    </header>
  );
}
