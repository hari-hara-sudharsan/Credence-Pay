"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Site-wide interaction layer, one listener each:
 * - spotlight: sets --mx/--my on the .glass surface under the pointer (CSS draws the glow)
 * - tilt: sets --rx/--ry on .tilt elements for a soft 3D lean
 * - magnet: primary buttons lean slightly toward the cursor
 * - reveal: adds data-shown to [data-reveal] elements as they scroll into view; below-the-fold
 *   cards, panels and table rows on every page are tagged automatically
 */
export default function Effects() {
  const path = usePathname();

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let last: PointerEvent | null = null;
    let tilted: HTMLElement | null = null;
    let magnet: HTMLElement | null = null;
    const release = () => {
      if (magnet) magnet.style.translate = "";
      magnet = null;
    };

    const apply = () => {
      frame = 0;
      const e = last;
      if (!e) return;
      const target = e.target as Element | null;
      const glass = target?.closest?.(".glass") as HTMLElement | null;
      if (glass) {
        const r = glass.getBoundingClientRect();
        glass.style.setProperty("--mx", `${e.clientX - r.left}px`);
        glass.style.setProperty("--my", `${e.clientY - r.top}px`);
      }
      if (reduced) return;
      const tilt = target?.closest?.(".tilt") as HTMLElement | null;
      if (tilted && tilted !== tilt) {
        tilted.style.setProperty("--rx", "0deg");
        tilted.style.setProperty("--ry", "0deg");
      }
      tilted = tilt;
      if (tilt) {
        const r = tilt.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        const k = Number(tilt.dataset.tilt ?? 6);
        tilt.style.setProperty("--rx", `${(-py * k).toFixed(2)}deg`);
        tilt.style.setProperty("--ry", `${(px * k).toFixed(2)}deg`);
      }
      // magnetic primary buttons: lean a few pixels toward the cursor, glide back on leave
      const btn = target?.closest?.(".btn-primary") as HTMLElement | null;
      if (magnet && magnet !== btn) release();
      if (btn && !(btn as HTMLButtonElement).disabled) {
        magnet = btn;
        const r = btn.getBoundingClientRect();
        const dx = Math.max(-6, Math.min(6, (e.clientX - (r.left + r.width / 2)) * 0.18));
        const dy = Math.max(-4, Math.min(4, (e.clientY - (r.top + r.height / 2)) * 0.28));
        btn.style.translate = `${dx.toFixed(1)}px ${dy.toFixed(1)}px`;
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      if (tilted) {
        tilted.style.setProperty("--rx", "0deg");
        tilted.style.setProperty("--ry", "0deg");
        tilted = null;
      }
      release();
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const show = (el: Element) => el.setAttribute("data-shown", "");
    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll("[data-reveal]").forEach(show);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            show(en.target);
            io.unobserve(en.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    // Every page: cards, panels and table rows that start below the fold rise in as you reach them,
    // cascading slightly with their siblings. Anything already on screen is left alone (no flicker).
    const AUTO = "main .glass, main tbody tr";
    const autoTag = () => {
      const fold = window.innerHeight * 0.92;
      document.querySelectorAll<HTMLElement>(AUTO).forEach((el) => {
        if (el.dataset.revealChecked) return;
        el.dataset.revealChecked = "1";
        if (el.hasAttribute("data-reveal") || el.parentElement?.closest("[data-reveal], .glass, .sheet")) return;
        if (el.getBoundingClientRect().top < fold) return;
        const i = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
        el.style.setProperty("--d", `${Math.min(i, 6) * 70}ms`);
        el.setAttribute("data-reveal", "");
      });
    };
    const scan = () => {
      autoTag();
      document.querySelectorAll("[data-reveal]:not([data-shown])").forEach((el) => io.observe(el));
      document.querySelectorAll(".halo").forEach((el) => halo.observe(el));
    };
    // Gradient rings only animate while visible.
    const halo = new IntersectionObserver((entries) => {
      for (const en of entries) en.target.toggleAttribute("data-inview", en.isIntersecting);
    });
    scan();
    // Client-rendered sections appear after data loads: watch for them (batched).
    let pending: ReturnType<typeof setTimeout> | undefined;
    const mo = new MutationObserver(() => {
      if (!pending) pending = setTimeout(() => { pending = undefined; scan(); }, 60);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      halo.disconnect();
      mo.disconnect();
      clearTimeout(pending);
    };
  }, [path]);

  return null;
}
