import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-face" });

export const metadata: Metadata = {
  title: "Credence: credit terms for AI agents",
  description:
    "AI agents pay each other through HSP. Credence turns every settlement into on-chain trust, so reliable agents move from prepay to net terms to credit, inside limits their human owners set.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <Nav />
        {children}
        <footer className="mx-auto mt-24 flex max-w-7xl flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-8 text-xs text-faint sm:px-6">
          <span>Credence · trust and terms for agent payments · HSK Chain Horizon Hackathon, Mumbai 2026</span>
          <span className="flex flex-wrap gap-2">
            <span className="chip">A2A 0.3 · AP2 mandates</span>
            <span className="chip">HSP Agentic Payment</span>
            <span className="chip">HSK Chain</span>
          </span>
        </footer>
      </body>
    </html>
  );
}
