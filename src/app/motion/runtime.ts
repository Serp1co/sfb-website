/*
 * Starts, stops and re-routes the DOM motion runtime: capabilities, the visitor's stored pause,
 * viewport, pointer, smooth scroll, the glass registry, story, reveals (and the exit on a press
 * that navigates), magnetic pull and the master ticker. ExperienceRoot calls these from its
 * effects; everything here is idempotent and fully undone by stopRuntime(), so React StrictMode's
 * mount -> unmount -> mount in development leaves exactly one of each.
 */

import {
  markNavigated,
  onLayoutChange,
  onRescan,
  pruneDisconnected,
  rescanRegistry,
  startRegistry,
  stopRegistry,
  updateRegistry,
  type RescanReason,
} from "../glass/registry";
import { detectCapabilities, watchRestrictivePreferences, type RestrictivePreference } from "./capabilities";
import { ensureGsapPlugins } from "./gsap-setup";
import { rebuildMagnetic, startMagnetic, stopMagnetic, updateMagnetic } from "./magnetic";
import { applyStoredPause, notifyPauseListeners } from "./pause";
import { startPointer, stopPointer } from "./pointer";
import { addRevealsForNewElements, completeAllReveals, setupRouteReveals, teardownReveals } from "./reveals";
import { settleRouteExit, startRouteExit, stopRouteExit } from "./route-exit";
import { resetScrollMotion } from "./scroll-state";
import {
  haltSmoothScroll,
  jumpToElement,
  jumpToTop,
  resizeSmoothScroll,
  startAnchorLinks,
  startSmoothScroll,
  stopAnchorLinks,
  stopSmoothScroll,
  syncSmoothScrollDimensions,
} from "./smooth-scroll";
import { motion, setEngineMode } from "./store";
import { rebuildStory, updateStory } from "./story";
import { TICK_ORDER, onTick, startTicker, stopTicker } from "./ticker";
import { startViewportTracking } from "./viewport";

let running = false;
let cleanups: Array<() => void> = [];
let currentPath = "";
/** Pathname a popstate (back/forward) is taking the visitor to, until its route change runs. */
let traversalTarget: string | null = null;
/** A traversal's setup waits one frame for the browser's scroll restoration. */
let pendingFrame = 0;
let routePending = false;

function decodeFragment(fragment: string): string {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

/**
 * Capture phase on window: it runs before Next's own popstate handler, which may render the
 * restored page (and run the route effect) synchronously inside the same event.
 */
function onPopState(): void {
  traversalTarget = window.location.pathname;
  haltSmoothScroll();
}

function onRegistryRescan(reason: RescanReason): void {
  // Mount and route rescans are followed by explicit, ordered setup (see below).
  if (reason !== "mutation") return;
  rebuildStory(currentPath);
  rebuildMagnetic();
  if (!routePending) addRevealsForNewElements();
}

function onPreferenceRestricted(preference: RestrictivePreference): void {
  const capabilities = motion.capabilities;
  capabilities[preference] = true;
  // Kept for the rest of the visit, so nothing can re-activate the WebGL glass.
  capabilities.glassMode = "css";
  setEngineMode("css");
  if (preference === "reducedMotion") {
    stopSmoothScroll();
    stopMagnetic();
    completeAllReveals();
  }
  // Reduced motion: the scene settles into a still frame on its own now; forced colours: the scene
  // is hidden. Either way the pause toggle hides (isPauseAllowed). A pause the visitor chose stays
  // on (the still frame is then the paused one).
  notifyPauseListeners();
}

function onBeforePrint(): void {
  // A reveal parked below the fold (opacity 0, a line in its mask) would print as a blank.
  completeAllReveals();
}

/**
 * After a client navigation (not back/forward, which restores a page the visitor has seen):
 * Next 16 leaves focus alone, and the activated link has just been removed with the old page, so
 * focus fell to <body>. The next Tab would skip the new page's skip link and a screen reader would
 * get no reading position. Focus moves to the hash target, or else to the new page's heading,
 * without scrolling (the jump has already placed the page). A control that survived the swap (a
 * header link) keeps focus. Targets get tabindex -1, as the in-page anchors do.
 */
function focusNewPage(hashTarget: HTMLElement | null): void {
  const active = document.activeElement;
  if (active && active !== document.body && active.isConnected) return;
  const destination =
    hashTarget ?? document.querySelector<HTMLElement>("main h1") ?? document.querySelector<HTMLElement>("main");
  if (!destination) return;
  if (!destination.hasAttribute("tabindex")) destination.setAttribute("tabindex", "-1");
  destination.focus({ preventScroll: true });
}

/** After a client navigation's scroll is settled: rescan, then rebuild everything in order. */
function finishRoute(mode: "route" | "traversal"): void {
  routePending = false;
  if (mode === "traversal") resizeSmoothScroll();
  rescanRegistry("route");
  rebuildStory(currentPath);
  rebuildMagnetic();
  resetScrollMotion();
  setupRouteReveals(mode);
  motion.story.changedAt = performance.now();
}

function cancelPendingRoute(): void {
  if (pendingFrame) cancelAnimationFrame(pendingFrame);
  pendingFrame = 0;
  routePending = false;
}

export function startRuntime(pathname: string): void {
  if (running) return;
  running = true;
  currentPath = pathname;
  ensureGsapPlugins();

  // Keep the object identity: the scene may already hold a reference to it.
  Object.assign(motion.capabilities, detectCapabilities());
  setEngineMode("css");
  // Before the ticker starts, so the scene's first frame already honours a stored pause.
  applyStoredPause();

  const add = (cleanup: () => void) => cleanups.push(cleanup);
  add(startViewportTracking());
  startPointer();
  add(stopPointer);
  startSmoothScroll();
  add(stopSmoothScroll);
  startAnchorLinks();
  add(stopAnchorLinks);
  startRouteExit();
  add(stopRouteExit);
  startRegistry();
  add(stopRegistry);
  add(onRescan(onRegistryRescan));
  add(onLayoutChange(syncSmoothScrollDimensions));

  rescanRegistry("mount");
  rebuildStory(pathname);
  resetScrollMotion();
  setupRouteReveals("first");
  add(teardownReveals);
  startMagnetic();
  add(stopMagnetic);

  add(onTick(updateMagnetic, TICK_ORDER.magnetic));
  add(onTick(updateRegistry, TICK_ORDER.registry));
  add(onTick(updateStory, TICK_ORDER.story));
  startTicker();
  add(stopTicker);

  window.addEventListener("popstate", onPopState, { capture: true });
  add(() => window.removeEventListener("popstate", onPopState, { capture: true }));
  // Chrome runs beforeprint before its print layout, so the restored markup is what prints. The
  // stylesheet's print rules cover the same states without JavaScript.
  window.addEventListener("beforeprint", onBeforePrint);
  add(() => window.removeEventListener("beforeprint", onBeforePrint));
  add(watchRestrictivePreferences(onPreferenceRestricted));
}

export function stopRuntime(): void {
  if (!running) return;
  running = false;
  cancelPendingRoute();
  traversalTarget = null;
  const pending = cleanups;
  cleanups = [];
  for (let i = pending.length - 1; i >= 0; i--) pending[i]();
  setEngineMode("css");
}

/**
 * A client navigation committed a new page (called from a layout effect, before it paints).
 * Back/forward keeps the browser's restored scroll; anything else lands on the hash target or
 * the top. Only then are the registry, story and reveals rebuilt for the new page.
 */
export function handleRouteChange(pathname: string): void {
  if (!running) return;
  currentPath = pathname;
  const traversal = traversalTarget !== null && traversalTarget === window.location.pathname;
  traversalTarget = null;
  cancelPendingRoute();

  markNavigated();
  // The old page's elements are gone: never draw their glass over the new page, even for a frame.
  pruneDisconnected();
  // The press's exit has done its job; the teardown below reverts what it wrote.
  settleRouteExit();
  teardownReveals();
  haltSmoothScroll();
  // First, so Lenis clamps to the NEW page's height, not the old one's.
  resizeSmoothScroll();

  if (traversal) {
    routePending = true;
    // The browser restores the scroll after the popstate event; measure against that position.
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      finishRoute("traversal");
    });
    return;
  }

  const id = window.location.hash ? decodeFragment(window.location.hash.slice(1)) : "";
  const target = id ? document.getElementById(id) : null;
  if (target) jumpToElement(target);
  else jumpToTop();
  focusNewPage(target);
  finishRoute("route");
}
