"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const EVERY_MS = 5000;
/** No mouse, keys or touch for this long: stop checking until the next one. */
const IDLE_MS = 10 * 60 * 1000;

/** Someone is typing or choosing: hold the refresh until they leave the field. */
function editing() {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLElement && el.isContentEditable);
}

/**
 * Live updates: while the page is on screen, checks every few seconds whether
 * anything changed in the app and, if so, refreshes the page's data in place.
 * Open dialogs, scroll and typed text stay as they are.
 */
export function LiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    let seen: number | null = null;
    let pending = false;
    let busy = false;
    let stopped = false;
    let lastActive = Date.now();

    const apply = () => {
      if (!pending || editing()) return;
      pending = false;
      router.refresh();
    };
    const check = async () => {
      if (busy || stopped || document.visibilityState !== "visible" || Date.now() - lastActive > IDLE_MS) return;
      busy = true;
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        const { v } = (await res.json()) as { v: number | null };
        if (v === null) return;
        if (seen !== null && v !== seen) pending = true;
        seen = v;
        apply();
      } catch {
        // Offline for a moment: try again next time.
      } finally {
        busy = false;
      }
    };

    void check();
    const timer = window.setInterval(check, EVERY_MS);
    const onVisible = () => {
      lastActive = Date.now();
      void check();
    };
    // Back after a pause: check at once rather than waiting for the next tick.
    const onActive = () => {
      const wasIdle = Date.now() - lastActive > IDLE_MS;
      lastActive = Date.now();
      if (wasIdle) void check();
    };
    const ACTIVITY = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"] as const;
    for (const e of ACTIVITY) window.addEventListener(e, onActive, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const onBlur = () => window.setTimeout(apply, 0);
    document.addEventListener("focusout", onBlur);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("focusout", onBlur);
      for (const e of ACTIVITY) window.removeEventListener(e, onActive);
    };
  }, [router]);
  return null;
}
