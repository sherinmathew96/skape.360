"use client";

import { useEffect, useRef } from "react";

/*
 * While a viewer is open it takes one step in the browser history, so the
 * phone's back button closes it instead of leaving the page. Viewers can
 * stack (a 3D model over a drawing): back closes only the top one.
 */
type Entry = { id: number; close: () => void };
const stack: Entry[] = [];
let skip = 0;
let listening = false;
let nextId = 1;

function onPop() {
  if (skip > 0) {
    skip--;
    return;
  }
  stack.pop()?.close();
}

export function useBackToClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!open) return;
    if (!listening) {
      window.addEventListener("popstate", onPop);
      listening = true;
    }
    const entry: Entry = { id: nextId++, close: () => closeRef.current() };
    stack.push(entry);
    // Keep the router's own state so Next.js treats the step as this page.
    window.history.pushState({ ...window.history.state, skapeLayer: entry.id }, "");
    return () => {
      const at = stack.indexOf(entry);
      if (at === -1) return; // Closed by the back button: its step is gone already.
      stack.splice(at, 1);
      // Closed on screen: take back the step it added.
      if (window.history.state?.skapeLayer === entry.id) {
        skip++;
        window.history.back();
      }
    };
  }, [open]);
}
