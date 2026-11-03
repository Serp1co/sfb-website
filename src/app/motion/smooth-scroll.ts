/*
 * Smooth scroll (Lenis), keyboard scrolling and in-page anchor links.
 *
 * The DOM scroll and the WebGL glass must move in the same frame, so Lenis writes the scroll from
 * inside the master tick (ticker.ts calls lenis.raf). Lenis only takes over the wheel; keyboard
 * scrolling would otherwise run on the compositor and the glass would trail its text, so the keys
 * are routed through Lenis here. Scrollbar drags stay native (a one-frame trail is accepted).
 *
 * Lenis is skipped with reduced motion (native, instant scrolling) and on coarse pointers: its
 * non-passive touch listeners would make the compositor wait for a busy main thread before every
 * touch scroll, and native touch scroll cannot be synced anyway (those visitors get CSS glass).
 *
 * Lenis ignores native scroll while it glides and writes its own offset back on the next frame.
 * Whatever scrolls the page natively during a glide therefore has to stop the glide first: a
 * keyboard focus move (the browser scrolls the focused element into view), find-in-page, a
 * scrollbar drag. See onFocusIn and onWindowScroll. And every glide starts from where the page
 * actually is (startFromPage), so a native scroll from just before a glide does not count as one
 * during it.
 */

import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { ScrollTrigger } from "./gsap-setup";
import { motion } from "./store";
import { clamp } from "./springs";

/** Lenis lerp for the wheel and for key presses (0.1 per 60 Hz frame, frame-rate independent). */
const SCROLL_LERP = 0.1;
/** Page keys move most of a viewport, keeping some context on screen, like browsers do. */
const PAGE_STEP_VIEWPORTS = 0.85;
/** Arrow keys: one comfortable line step. */
const ARROW_STEP_PX = 80;
/** Duration of anchor and Home/End scrolls: 0.6 s plus distance / 4000, kept within 0.7-1.5 s. */
const JUMP_BASE_S = 0.6;
const JUMP_PX_PER_S = 4000;
const JUMP_MIN_S = 0.7;
const JUMP_MAX_S = 1.5;

/** Focus in these keeps its own arrow/space/page keys (text editing, menus, sliders, lists). */
const EDITABLE_SELECTOR = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";
const KEY_WIDGET_SELECTOR =
  "[role='listbox'], [role='menu'], [role='menubar'], [role='radiogroup'], [role='slider'], " +
  "[role='spinbutton'], [role='tablist'], [role='tree'], [role='grid'], [role='combobox'], [role='textbox']";
/**
 * Space activates these natively, so it must not scroll. Not links: Space pages a document even
 * with a link focused, and left to the browser that scroll would run on the compositor, with the
 * WebGL glass trailing its text.
 */
const SPACE_ACTIVATES_SELECTOR = "button, summary, [role='button']";
/**
 * The window scroll may differ from Lenis's glide by sub-pixel rounding (fractional device pixel
 * ratios). More than this is something else scrolling the page: find-in-page, a scrollbar drag.
 */
const GLIDE_DIVERGENCE_PX = 2;

let lenis: Lenis | null = null;
let anchorsActive = false;

export function getLenis(): Lenis | null {
  return lenis;
}

function jumpDuration(distance: number): number {
  return clamp(JUMP_BASE_S + Math.abs(distance) / JUMP_PX_PER_S, JUMP_MIN_S, JUMP_MAX_S);
}

/** Lenis's own scroll event keeps ScrollTrigger in step within the tick that wrote the scroll. */
function onLenisScroll(): void {
  ScrollTrigger.update();
}

/**
 * Glides start from Lenis's own offset, which lags a native scroll whose event has not arrived yet
 * (scroll events are dispatched with the next frame): a script focus that scrolls the page, then a
 * key press in the same frame. The glide would start from the old position and throw the page back
 * on its first frame, and onWindowScroll would take the late event for a scroll during the glide
 * and stop it. Catching up first keeps Lenis's offset at the scroll the glide started from until
 * its first frame, so only scrolls that happen during a glide stop it. Mid-glide, Lenis's offset is
 * the page's. Every glide start comes through here: the keys, the anchors and the wheel.
 */
function startFromPage(instance: Lenis): void {
  if (instance.isScrolling === "smooth") return;
  if (Math.abs(instance.actualScroll - instance.animatedScroll) <= GLIDE_DIVERGENCE_PX) return;
  // The public way to re-sync: it re-reads the page height too, and the glide clamps to that.
  instance.resize();
}

/** Lenis starts wheel glides itself; it emits virtual-scroll just before it does. */
function onVirtualScroll(): void {
  if (lenis) startFromPage(lenis);
}

type KeyMove = { by: number } | { to: "start" | "end" };

/** What a scroll key does: a step on from the current destination, or a jump to an end. */
function keyMove(event: KeyboardEvent): KeyMove | null {
  const page = motion.viewport.height * PAGE_STEP_VIEWPORTS;
  switch (event.key) {
    case "PageDown":
      return { by: page };
    case "PageUp":
      return { by: -page };
    case " ":
      return { by: event.shiftKey ? -page : page };
    case "ArrowDown":
      return { by: ARROW_STEP_PX };
    case "ArrowUp":
      return { by: -ARROW_STEP_PX };
    case "Home":
      return { to: "start" };
    case "End":
      return { to: "end" };
    default:
      return null;
  }
}

function onKeyDown(event: KeyboardEvent): void {
  const instance = lenis;
  if (!instance || event.defaultPrevented) return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  // Shift only combines with Space (Shift+Space pages up); Shift+arrows extend selections.
  if (event.shiftKey && event.key !== " ") return;
  const target = event.target instanceof Element ? event.target : null;
  if (target) {
    if (target.closest(EDITABLE_SELECTOR) || target.closest("[data-lenis-prevent]")) return;
    if (target.closest(KEY_WIDGET_SELECTOR)) return;
    if (event.key === " " && target.closest(SPACE_ACTIVATES_SELECTOR)) return;
  }
  const move = keyMove(event);
  if (!move) return;
  event.preventDefault();
  startFromPage(instance);
  if ("to" in move) {
    const destination = move.to === "start" ? 0 : instance.limit;
    instance.scrollTo(destination, { duration: jumpDuration(destination - instance.animatedScroll) });
    return;
  }
  // Not "programmatic": Lenis then keeps the destination in targetScroll, so repeated presses
  // (and a wheel turn mid-way) add up the way native keyboard scrolling does.
  instance.scrollTo(instance.targetScroll + move.by, { programmatic: false, lerp: SCROLL_LERP });
}

/**
 * A keyboard focus move (Tab, Shift+Tab, assistive technology, a script) during a glide: the
 * browser has just scrolled the focused element into view, and the glide would carry the page
 * away from it (End then Shift+Tab left the focused button 2,700 px off screen). The focus wins.
 * Pointer focus lands on what is under the pointer and needs no scroll, so it does not stop a
 * wheel glide. The anchor handler focuses its target BEFORE it starts its own glide, so this
 * never cancels that one.
 */
function onFocusIn(event: FocusEvent): void {
  const target = event.target;
  if (!(target instanceof Element) || !matchesFocusVisible(target)) return;
  haltSmoothScroll();
}

function matchesFocusVisible(element: Element): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    // Engines without :focus-visible: treat every focus as keyboard focus (halting is harmless).
    return true;
  }
}

/**
 * What focusin cannot see: find-in-page jumps and scrollbar drags during a glide. While Lenis
 * glides, every native scroll event it causes matches its own offset (before its first frame, the
 * scroll it started from: startFromPage); one that does not came from something else, and Lenis
 * would overwrite it on its next frame.
 */
function onWindowScroll(): void {
  const instance = lenis;
  if (!instance || instance.isScrolling !== "smooth") return;
  if (Math.abs(window.scrollY - instance.animatedScroll) > GLIDE_DIVERGENCE_PX) haltSmoothScroll();
}

/** Starts Lenis and keyboard scrolling when this visitor gets them. Idempotent. */
export function startSmoothScroll(): void {
  if (lenis) return;
  const { reducedMotion, coarsePointer } = motion.capabilities;
  if (reducedMotion || coarsePointer) return;
  lenis = new Lenis({
    autoRaf: false,
    smoothWheel: true,
    syncTouch: false,
    lerp: SCROLL_LERP,
    wheelMultiplier: 1,
    stopInertiaOnNavigate: true,
  });
  lenis.on("scroll", onLenisScroll);
  lenis.on("virtual-scroll", onVirtualScroll);
  window.addEventListener("keydown", onKeyDown);
  // Capture: runs before any handler that might move focus again or stop propagation.
  window.addEventListener("focusin", onFocusIn, { capture: true });
  window.addEventListener("scroll", onWindowScroll, { passive: true });
}

/** Stops Lenis (native scrolling resumes). Idempotent. */
export function stopSmoothScroll(): void {
  if (!lenis) return;
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("focusin", onFocusIn, { capture: true });
  window.removeEventListener("scroll", onWindowScroll);
  lenis.destroy();
  lenis = null;
}

/** Re-reads the page height without touching an animation in progress (the layout changed). */
export function syncSmoothScrollDimensions(): void {
  lenis?.dimensions.resize();
}

/** Re-reads the page height and re-syncs Lenis to the actual scroll (after a route change). */
export function resizeSmoothScroll(): void {
  lenis?.resize();
}

/**
 * Cancels a smooth scroll still gliding. Lenis ignores native scroll while it animates and would
 * write its old offset over the browser's history restoration (or over Next's scroll) on its
 * next frame. stop() + start() is the public way to reset it; nothing paints in between.
 */
export function haltSmoothScroll(): void {
  if (!lenis || lenis.isScrolling !== "smooth") return;
  lenis.stop();
  lenis.start();
}

/** Jumps (no animation) so `element` sits under the header, honouring html scroll-padding-top. */
export function jumpToElement(element: HTMLElement): void {
  if (lenis) lenis.scrollTo(element, { immediate: true, force: true });
  else element.scrollIntoView({ block: "start", behavior: "instant" });
}

/** Jumps (no animation) to the top of the page. */
export function jumpToTop(): void {
  if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
  else window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

function scrollPaddingTop(): number {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
  return Number.isFinite(value) ? value : 0;
}

function decodeFragment(fragment: string): string {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

/**
 * In-page anchors (the header nav on the landing page, the skip link):
 * focus moves to the target at once, so the next Tab continues from there even while the scroll
 * is still gliding, and the URL updates without waiting for the scroll to finish (a wheel turn
 * during the glide would otherwise swallow the completion). No offset is added: Lenis and native
 * scrollIntoView both subtract html's scroll-padding-top, the single header offset.
 *
 * Without Lenis (touch, reduced motion) the behaviour is passed explicitly: the stylesheet sets no
 * scroll-behavior (a smooth one there also animated the browser's scroll restoration on reload),
 * so touch keeps its smooth in-page jumps and reduced motion jumps at once.
 */
function onDocumentClick(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const origin = event.target instanceof Element ? event.target : null;
  const link = origin?.closest<HTMLAnchorElement>("a[href^='#']");
  if (!link) return;
  if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return;
  const id = decodeFragment((link.getAttribute("href") ?? "").slice(1));
  if (!id) return;
  const target = document.getElementById(id);
  if (!target) return;

  event.preventDefault();
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
  const hash = `#${id}`;
  if (window.location.hash !== hash) window.history.pushState(null, "", hash);

  if (lenis) {
    // Lenis measures the target from its own offset.
    startFromPage(lenis);
    const distance = target.getBoundingClientRect().top - scrollPaddingTop();
    lenis.scrollTo(target, { duration: jumpDuration(distance) });
  } else {
    target.scrollIntoView({ block: "start", behavior: motion.capabilities.reducedMotion ? "auto" : "smooth" });
  }
}

/** Starts in-page anchor handling (with or without Lenis). Idempotent. */
export function startAnchorLinks(): void {
  if (anchorsActive) return;
  anchorsActive = true;
  // Window bubble phase: React's and Next's handlers on the document run first, so a link they
  // already handled (defaultPrevented) is left alone.
  window.addEventListener("click", onDocumentClick);
}

export function stopAnchorLinks(): void {
  if (!anchorsActive) return;
  anchorsActive = false;
  window.removeEventListener("click", onDocumentClick);
}
