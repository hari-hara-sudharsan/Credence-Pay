"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

export const THEME_KEY = "credence-theme";
type Theme = "dark" | "light";

// The theme lives on <html data-theme>; a tiny script in layout.tsx sets it before first paint.
const subscribe = (cb: () => void) => {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
};
const read = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "dark" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";

  const toggle = () => {
    const apply = () => {
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* private mode: the choice just isn't remembered */
      }
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (doc.startViewTransition && !reduced) doc.startViewTransition(apply);
    else apply();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="group relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-white/[0.04] text-dim transition-colors duration-300 hover:border-accent/50 hover:text-ink"
    >
      <Sun
        className={`absolute size-[17px] transition-all duration-500 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] ${
          theme === "light" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0"
        }`}
      />
      <Moon
        className={`absolute size-[17px] transition-all duration-500 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] ${
          theme === "dark" ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-50 opacity-0"
        }`}
      />
    </button>
  );
}
