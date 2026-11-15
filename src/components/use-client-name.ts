"use client";

import { useSyncExternalStore } from "react";

/**
 * The client's name, remembered on this device for comments and approvals.
 * One store for every form on the page, so a name typed in a comment shows
 * straight away in the approval form. On the server (and the first render)
 * it is empty, which keeps the page the same on both sides.
 */
const KEY = "skape_client_name";
const listeners = new Set<() => void>();

function read() {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function saveClientName(name: string) {
  try {
    localStorage.setItem(KEY, name.trim());
  } catch {}
  listeners.forEach((l) => l());
}

export function useClientName(): string {
  return useSyncExternalStore(subscribe, read, () => "");
}
