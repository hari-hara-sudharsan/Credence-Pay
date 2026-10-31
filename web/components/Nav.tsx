"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/console", label: "Agent Console" },
  { href: "/settlements", label: "Settlements" },
  { href: "/developers", label: "Developers" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-6 place-items-center rounded-md bg-accent text-xs font-bold text-accent-ink">C</span>
          Credence
        </Link>
        <div className="flex gap-1 overflow-x-auto text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-md px-3 py-1.5 whitespace-nowrap transition ${
                path.startsWith(l.href) ? "bg-panel-2 text-ink" : "text-dim hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <span className="ml-auto hidden items-center gap-2 text-xs text-dim sm:flex">
          <span className="size-1.5 rounded-full bg-accent" /> HSK Chain · HSP
        </span>
      </nav>
    </header>
  );
}
