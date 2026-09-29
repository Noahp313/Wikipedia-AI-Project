"use client";

import { useCallback, useSyncExternalStore } from "react";

// Same-tab writes don't fire "storage", so setters announce themselves with this.
const LOCAL_EVENT = "wikai-local-storage";

function subscribe(callback) {
  window.addEventListener("storage", callback);
  window.addEventListener(LOCAL_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(LOCAL_EVENT, callback);
  };
}

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked (private mode, disabled site data)
  }
}

// A string preference in localStorage, kept in sync across components and tabs.
// Renders `fallback` on the server and during hydration.
export function useLocalStorage(key, fallback) {
  const stored = useSyncExternalStore(subscribe, () => read(key), () => null);

  const setValue = useCallback(
    (value) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // storage blocked — the preference just won't stick
      }
      window.dispatchEvent(new Event(LOCAL_EVENT));
    },
    [key]
  );

  return [stored ?? fallback, setValue];
}
