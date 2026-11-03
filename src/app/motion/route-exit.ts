/*
 * When to play the page exit (reveals.ts playExit): a press on a link that will take the visitor
 * to another page. A mouse or pen press starts it at once, because Next swaps the page about
 * 145 ms after the press (the release, then the commit) and the exit has to fit in that wait. A
 * touch press may be the start of a scroll, so a tap starts it on its click instead (shorter, but
 * never on a scroll). Keyboard activation navigates at once: no exit.
 *
 * Every way a press can fail to navigate brings the page back (cancelExit): released off the link,
 * a cancelled pointer (a link dragged out), or no new page after EXIT_TIMEOUT_MS. A route change
 * undoes the exit on its own (teardownReveals), and so does a page restored from the back/forward
 * cache, which comes back exactly as it was left.
 */

import { cancelExit, playExit } from "./reveals";
import { motion } from "./store";

/**
 * A prefetched page commits within ~150 ms of the press; one that has not arrived after this is
 * slow or not coming, and a page left faded would look broken.
 */
const EXIT_TIMEOUT_MS = 1500;

let running = false;
/** The link the current exit was played for, until the press resolves. */
let pressedLink: HTMLAnchorElement | null = null;
let clicked = false;
let timer: ReturnType<typeof setTimeout> | 0 = 0;
let releaseCheck: ReturnType<typeof setTimeout> | 0 = 0;

function clearTimers(): void {
  if (timer) clearTimeout(timer);
  if (releaseCheck) clearTimeout(releaseCheck);
  timer = 0;
  releaseCheck = 0;
}

function abandon(): void {
  clearTimers();
  pressedLink = null;
  clicked = false;
  cancelExit();
}

function armTimeout(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(abandon, EXIT_TIMEOUT_MS);
}

/** "/it/" and "/it" are the same page (the export uses trailing slashes; a host may not). */
function samePath(a: string, b: string): boolean {
  const trim = (path: string) => (path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path);
  return trim(a) === trim(b);
}

/** An internal link to another page: anything else (new tab, download, mailto:, an in-page anchor) stays. */
function navigatingLink(target: EventTarget | null): HTMLAnchorElement | null {
  const link = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
  if (!link) return null;
  if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return null;
  // Other sites and non-http schemes (mailto:, tel:) report a different (or "null") origin.
  if (link.origin !== window.location.origin) return null;
  // Same page: an in-page anchor, or the page's own link; no new page arrives to exit for.
  if (samePath(link.pathname, window.location.pathname)) return null;
  return link;
}

function isPlainPrimary(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function start(link: HTMLAnchorElement): void {
  clearTimers();
  pressedLink = link;
  clicked = false;
  playExit();
  armTimeout();
}

function onPointerDown(event: PointerEvent): void {
  if (event.pointerType === "touch" || !event.isPrimary || !isPlainPrimary(event)) return;
  if (motion.capabilities.reducedMotion) return;
  const link = navigatingLink(event.target);
  if (link) start(link);
}

function onPointerUp(event: PointerEvent): void {
  if (!pressedLink || event.pointerType === "touch") return;
  // The click (if the release completes one on the link) is dispatched right after this event,
  // in the same task: look once it has had its chance.
  if (releaseCheck) clearTimeout(releaseCheck);
  releaseCheck = setTimeout(() => {
    releaseCheck = 0;
    if (pressedLink && !clicked) abandon();
  }, 0);
}

function onPointerCancel(): void {
  if (pressedLink) abandon();
}

function onClick(event: MouseEvent): void {
  if (!isPlainPrimary(event)) return;
  if (pressedLink) {
    if (event.target instanceof Node && pressedLink.contains(event.target)) {
      clicked = true;
      // From now on the wait is for Next's commit.
      armTimeout();
    }
    return;
  }
  // A tap (pointer presses already exited above); detail 0 is a keyboard activation.
  if (event.detail === 0 || motion.capabilities.reducedMotion) return;
  const link = navigatingLink(event.target);
  if (!link) return;
  start(link);
  clicked = true;
}

/** A page restored from the back/forward cache comes back as it was left: mid-exit. */
function onPageShow(event: PageTransitionEvent): void {
  if (event.persisted) abandon();
}

/** The new page has committed (handleRouteChange): its own teardown reverts the exit. */
export function settleRouteExit(): void {
  clearTimers();
  pressedLink = null;
  clicked = false;
}

export function startRouteExit(): void {
  if (running) return;
  running = true;
  // Capture phase: before any handler can stop the event, and before Next's link handler navigates.
  window.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
  window.addEventListener("pointerup", onPointerUp, { capture: true, passive: true });
  window.addEventListener("pointercancel", onPointerCancel, { capture: true, passive: true });
  window.addEventListener("click", onClick, { capture: true });
  window.addEventListener("pageshow", onPageShow);
}

export function stopRouteExit(): void {
  if (!running) return;
  running = false;
  window.removeEventListener("pointerdown", onPointerDown, { capture: true });
  window.removeEventListener("pointerup", onPointerUp, { capture: true });
  window.removeEventListener("pointercancel", onPointerCancel, { capture: true });
  window.removeEventListener("click", onClick, { capture: true });
  window.removeEventListener("pageshow", onPageShow);
  settleRouteExit();
}
