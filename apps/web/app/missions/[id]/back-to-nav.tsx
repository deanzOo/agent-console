"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { shouldShowScrollNav } from "@/lib/scroll-nav";

// A long transcript traps a phone user at the bottom, and rereading from the
// top is rarely the goal — leaving is. This floats over the corner rather
// than sitting inline, so it never pushes the latest output off screen, and
// it sits above the iOS home indicator via env(safe-area-inset-bottom).
export function BackToNav() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () =>
      setVisible(shouldShowScrollNav(window.scrollY, window.innerHeight));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    // The threshold is a fraction of the viewport, so rotating a phone or a
    // mobile browser collapsing its address bar changes the answer without any
    // scrolling happening.
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed right-4 z-20 flex gap-1 rounded-full border border-neutral-200 bg-white/95 p-1 text-xs shadow-lg backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95"
      style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Scroll to top"
        className="rounded-full px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        ↑ Top
      </button>
      <Link
        href="/"
        aria-label="Back to missions list"
        className="rounded-full px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        Missions
      </Link>
    </div>
  );
}
