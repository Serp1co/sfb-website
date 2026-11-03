/*
 * What this visitor's device and preferences allow, decided once at boot (client only).
 *
 * The glass this visitor may get is decided here, from capabilities, never from
 * motion.engine.glassMode (which stays "css" until the WebGL glass has booted).
 */

import type { Capabilities, GlassMode, SceneTier } from "./store";

const QUERY = {
  coarsePointer: "(pointer: coarse)",
  hover: "(hover: hover)",
  reducedMotion: "(prefers-reduced-motion: reduce)",
  reducedTransparency: "(prefers-reduced-transparency: reduce)",
  moreContrast: "(prefers-contrast: more)",
  forcedColors: "(forced-colors: active)",
  narrow: "(max-width: 768px)",
} as const;

/** Preferences that, once on, rule out the WebGL glass for the rest of the visit. */
export type RestrictivePreference = "reducedMotion" | "reducedTransparency" | "moreContrast" | "forcedColors";

const RESTRICTIVE: readonly RestrictivePreference[] = [
  "reducedMotion",
  "reducedTransparency",
  "moreContrast",
  "forcedColors",
];

function matches(query: string): boolean {
  // An unsupported feature (prefers-reduced-transparency in some engines) parses as "not all",
  // which never matches: the visitor simply keeps the default.
  return window.matchMedia(query).matches;
}

/**
 * three.js r163+ needs WebGL2, and the canvas is only mounted when the browser has it. Checked by
 * the API's presence, not with a throwaway context: creating one blocked the main thread for
 * ~180 ms at boot (the GPU process starts for it), only to be thrown away before the scene makes
 * its own. Where the API exists but no context can be had (a blocklisted GPU, the context limit),
 * R3F rejects the scene's renderer into SceneErrorBoundary, which drops the scene and keeps the
 * CSS glass.
 */
function hasWebGL2(): boolean {
  return typeof WebGL2RenderingContext !== "undefined";
}

export function detectCapabilities(): Capabilities {
  const webgl2 = hasWebGL2();
  const coarsePointer = matches(QUERY.coarsePointer);
  const hover = matches(QUERY.hover);
  const reducedMotion = matches(QUERY.reducedMotion);
  const reducedTransparency = matches(QUERY.reducedTransparency);
  const moreContrast = matches(QUERY.moreContrast);
  const forcedColors = matches(QUERY.forcedColors);
  const narrow = matches(QUERY.narrow);

  // Touch gets frosted CSS glass (owner decision): native touch scroll runs on the compositor and
  // cannot be kept in step with a WebGL frame. Every restrictive preference also keeps CSS glass.
  const glassMode: GlassMode =
    webgl2 && !coarsePointer && hover && !reducedMotion && !reducedTransparency && !moreContrast && !forcedColors
      ? "webgl"
      : "css";
  const sceneTier: SceneTier = coarsePointer || narrow ? "performance" : "quality";

  return {
    webgl2,
    coarsePointer,
    hover,
    reducedMotion,
    reducedTransparency,
    moreContrast,
    forcedColors,
    narrow,
    glassMode,
    sceneTier,
  };
}

/**
 * Calls `onRestrict` when a restrictive preference switches on during the visit. The caller drops
 * to CSS glass and keeps it; switching the preference off again only takes effect on a reload, so
 * the page never flips back and forth under the visitor.
 */
export function watchRestrictivePreferences(onRestrict: (preference: RestrictivePreference) => void): () => void {
  const unsubscribers = RESTRICTIVE.map((preference) => {
    const list = window.matchMedia(QUERY[preference]);
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) onRestrict(preference);
    };
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  });
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}
