import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import Nav, { Logo } from "@/components/Nav";
import Effects from "@/components/Effects";
import BackToTop from "@/components/BackToTop";
import SnapshotBanner from "@/components/SnapshotBanner";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument" });

export const metadata: Metadata = {
  title: "Credence: credit terms for AI agents",
  description:
    "AI agents pay each other through HSP. Credence turns every settlement into on-chain trust, so reliable agents move from prepay to net terms to credit, inside limits their human owners set.",
};

export const viewport: Viewport = { themeColor: "#05060b" };

const FOOTER = [
  { title: "Product", links: [["Console", "/console"], ["Agents", "/agents"], ["Settlements", "/settlements"]] },
  { title: "Company", links: [["Business", "/business"], ["Developers", "/developers"]] },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${geist.variable} ${mono.variable} ${serif.variable}`}>
      <head>
        {/* Apply the saved theme before first paint so the page never flashes the wrong one. Dark is the default. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("credence-theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen">
        <div className="aurora" aria-hidden>
          <i />
          <i />
          <i />
        </div>
        <div className="scroll-progress" aria-hidden />
        <Effects />
        <BackToTop />
        <SnapshotBanner />
        <Nav />
        {children}
        <footer className="relative mt-32 border-t border-line">
          <div className="pointer-events-none absolute inset-x-0 -top-px mx-auto h-px max-w-3xl bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <Link href="/" className="flex items-center gap-2.5">
                <Logo size={26} />
                <span className="text-lg font-semibold tracking-tight">Credence</span>
              </Link>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-dim">
                Trust and terms for agent payments. Every HSP settlement becomes on-chain memory, and memory becomes credit.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="chip">A2A 0.3 · AP2 mandates</span>
                <span className="chip">HSP Agentic Payment</span>
                <span className="chip">HSK Chain</span>
              </div>
            </div>
            {FOOTER.map((col) => (
              <div key={col.title}>
                <div className="eyebrow">{col.title}</div>
                <ul className="mt-4 space-y-2.5 text-sm">
                  {col.links.map(([label, href]) => (
                    <li key={href}>
                      <Link href={href} className="text-dim transition-colors hover:text-ink">
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-line">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-faint sm:px-6">
              <span>HSK Chain Horizon Hackathon · Mumbai 2026 · Track 2: Agent Payments &amp; A2A Settlement</span>
              <span className="font-mono">MIT licensed</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
