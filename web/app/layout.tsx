import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import Nav from "@/components/Nav";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display-face" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-face" });

export const metadata: Metadata = {
  title: "Credence: credit terms for AI agents",
  description:
    "AI agents pay each other through HSP. Credence turns every settlement into on-chain trust, so reliable agents move from prepay to net terms to credit, inside limits their human owners set.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <Nav />
        {children}
        <footer className="mx-auto mt-24 max-w-7xl border-t border-line px-4 py-8 text-xs text-faint sm:px-6">
          Credence · built on HSK Chain with HSP Agentic Payment · HSK Chain Horizon Hackathon, Mumbai 2026
        </footer>
      </body>
    </html>
  );
}
