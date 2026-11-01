"use client";

import { useSyncExternalStore } from "react";

/**
 * Subscribes to a CSS media query. Returns `false` on the server and during
 * hydration, then the real value, so static HTML never mismatches.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const usePrefersReducedMotion = (): boolean => useMediaQuery("(prefers-reduced-motion: reduce)");

/** True on touch-first devices (phones, tablets), where there is no hover pointer. */
export const useCoarsePointer = (): boolean => useMediaQuery("(pointer: coarse)");

export const useNarrowViewport = (): boolean => useMediaQuery("(max-width: 768px)");
