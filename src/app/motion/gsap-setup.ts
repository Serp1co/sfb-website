/*
 * One place that registers the GSAP plugins the runtime uses (ScrollTrigger, SplitText; Standard
 * no-charge licence). Registration is deferred to the first client-side call instead of running
 * at import time, so importing these modules during the server render never touches `window`.
 */

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

let registered = false;

/** Idempotent. Call before creating any ScrollTrigger, SplitText or ScrollTrigger.refresh(). */
export function ensureGsapPlugins(): void {
  if (registered) return;
  gsap.registerPlugin(ScrollTrigger, SplitText);
  registered = true;
}

/**
 * Makes ScrollTrigger's cached window scroll true again. ScrollTrigger caches the scroll position,
 * re-reads it only through a live trigger after a scroll event, and refresh() scrolls the page
 * back to the position it recorded from that cache. After a scroll it has not seen (a route
 * change's jump while the old page's triggers are gone, the browser restoring a page), that
 * record is the OLD position. Measured with gsap 3.15: a client navigation from y 1200 jumped to
 * the top, and the refresh one frame later scrolled the new page back to 1200 (Observer.js
 * _scrollCacheFunc; ScrollTrigger.js _recordScrollPositions pre-increments the cache id, so a
 * cache stale by exactly one read passes as fresh). Read-only: update() invalidates the cache and
 * lets live triggers re-read it, the getter re-reads it when no trigger did.
 */
export function syncScrollTriggerScroll(): void {
  ScrollTrigger.update();
  (ScrollTrigger.getScrollFunc(window) as ScrollGetterSetter)();
}

/**
 * The function getScrollFunc() returns also reads (and re-caches) the scroll when called without a
 * value (Observer.js _scrollCacheFunc); gsap's typings only declare the setter.
 */
type ScrollGetterSetter = (position?: number) => number;

export { gsap, ScrollTrigger, SplitText };
