import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-face" });

export const metadata: Metadata = {
  title: "Credence: trust-gated agent payments on HSK Chain",
  description:
    "AI agents pay each other through HSP. Credence decides the terms: on-chain trust turns prepay into net terms and credit for agents that settle reliably.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <Nav />
        {children}
      </body>
    </html>
  );
}
