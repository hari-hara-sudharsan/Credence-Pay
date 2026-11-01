"use client";

import { useEffect, useRef, useState } from "react";
import { TERMS_COLOR, tint } from "@/lib/api";

const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

/** Counts up to `value` once it scrolls into view, then eases between later values. */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString(), duration = 1400 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const [shown, setShown] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setVisible(true), io.disconnect()), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    // Reduced motion: jump straight to the value on the first frame.
    const dur = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : duration;
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = dur ? Math.min(1, (t - start) / dur) : 1;
      const v = a + (value - a) * easeOut(p);
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    // Animation frames pause in background tabs: make sure the final value always lands.
    const settle = setTimeout(() => {
      cancelAnimationFrame(raf);
      from.current = value;
      setShown(value);
    }, dur + 250);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
    };
  }, [value, visible, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {format(shown)}
    </span>
  );
}

export const tierOf = (score: number, defaulted = false) => (defaulted || score < 560 ? "PREPAY" : score < 700 ? "NET" : "CREDIT");

/** Radial trust gauge (300–900) with the 560 / 700 tier boundaries marked. */
export function TrustRing({ score, size = 120, stroke = 9, label = "trust", defaulted = false }: { score: number; size?: number; stroke?: number; label?: string; defaulted?: boolean }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arc = 0.78; // 280° sweep, open at the bottom
  const pct = Math.max(0, Math.min(1, (score - 300) / 600));
  const color = TERMS_COLOR[tierOf(score, defaulted)];
  const id = `tr-${size}-${label}`;
  const tick = (s: number) => {
    const a = (-90 - arc * 180 + ((s - 300) / 600) * arc * 360) * (Math.PI / 180);
    const cx = size / 2, cy = size / 2;
    return { x1: cx + (r - stroke) * Math.cos(a), y1: cy + (r - stroke) * Math.sin(a), x2: cx + (r + stroke * 0.2) * Math.cos(a), y2: cy + (r + stroke * 0.2) * Math.sin(a) };
  };
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0" style={{ transform: `rotate(${90 + (1 - arc) * 180}deg)` }} aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" style={{ stopColor: color }} stopOpacity="0.45" />
            <stop offset="1" style={{ stopColor: color }} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: "var(--ring-track)" }} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * arc} ${c}`} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * arc * pct} ${c}`}
          style={{ transition: "stroke-dasharray 1s cubic-bezier(0.16,1,0.3,1), stroke 0.4s", filter: `drop-shadow(0 0 ${stroke}px ${tint(color, "88")})` }}
        />
      </svg>
      <svg width={size} height={size} className="absolute inset-0" aria-hidden>
        {[560, 700].map((s) => {
          const t = tick(s);
          return <line key={s} {...t} style={{ stroke: "var(--ring-tick)" }} strokeWidth={1.5} strokeLinecap="round" />;
        })}
      </svg>
      <div className="text-center leading-none">
        <div className="font-display font-semibold tabular-nums" style={{ fontSize: size * 0.27 }}>
          <CountUp value={score} duration={900} />
        </div>
        <div className="mt-1 text-[10px] tracking-[0.18em] text-faint uppercase">{label}</div>
      </div>
    </div>
  );
}

/** Mirrors A2ASettlementRegistry.trustScore() and termsFor() exactly. */
export function scoreFrom({ onTime, volume, late, defaults }: { onTime: number; volume: number; late: number; defaults: number }) {
  const s = 500 + Math.min(onTime, 20) * 15 + Math.min(Math.floor(volume / 10), 100) - late * 40 - defaults * 150;
  return Math.max(300, Math.min(900, s));
}
export function termsFrom(score: number, defaults: number) {
  if (defaults > 0 || score < 560) return { terms: "PREPAY", limit: 0, days: 0 };
  if (score < 700) return { terms: "NET", limit: 25, days: 7 };
  return { terms: "CREDIT", limit: 25 + (score - 700), days: 30 };
}
