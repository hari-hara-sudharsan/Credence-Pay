"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

const R = 19;
const C = 2 * Math.PI * R;

/** Appears once you have scrolled; its ring shows how far down the page you are. */
export default function BackToTop() {
  const [progress, setProgress] = useState(0);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    // Updated straight from the scroll event (cheap): state setters skip unchanged values.
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
      setShown(window.scrollY > window.innerHeight * 0.7);
    };
    const onScroll = update;
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <button
      type="button"
      aria-label="Back to top"
      tabIndex={shown ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
      className={`group fixed right-5 bottom-5 z-40 grid size-12 place-items-center rounded-full border border-line bg-[var(--nav-bg-solid)] text-dim shadow-[var(--nav-shadow-solid)] backdrop-blur-xl transition-all duration-700 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:text-ink sm:right-7 sm:bottom-7 ${
        shown ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-4 scale-90 opacity-0"
      }`}
    >
      <svg viewBox="0 0 44 44" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <defs>
          <linearGradient id="btt-g" x1="0" x2="1">
            <stop offset="0" stopColor="#8b9dff" />
            <stop offset="1" stopColor="#5ee7ff" />
          </linearGradient>
        </defs>
        <circle cx="22" cy="22" r={R} fill="none" strokeWidth="2" style={{ stroke: "var(--ring-track)" }} />
        <circle
          cx="22"
          cy="22"
          r={R}
          fill="none"
          stroke="url(#btt-g)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${C * progress} ${C}`}
          style={{ transition: "stroke-dasharray 0.25s linear" }}
        />
      </svg>
      <ArrowUp className="relative size-4 transition-transform duration-500 group-hover:-translate-y-0.5" />
    </button>
  );
}
