/*
 * The visitor's "pause animation" choice (WCAG 2.2.2 Pause, Stop, Hide): ambient scene motion
 * (circuit pulses, drifting droplets, the idle orb) runs for the whole visit, so the page offers a
 * visible toggle. Pausing stops the scene's clock (motion.time.sceneDelta = 0); the WebGL glass keeps
 * drawing and tracking the scroll, and resuming is instant. Persisted, so it holds across pages and
 * visits. Reduced motion is separate: those visitors already get a still scene and no toggle.
 */

import { motion } from "./store";

const STORAGE_KEY = "sfb-motion-paused";

type PauseListener = (paused: boolean) => void;

const listeners = new Set<PauseListener>();

/** The stored choice; false when storage is unavailable (private windows, blocked site data). */
export function readStoredPause(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function isMotionPaused(): boolean {
  return motion.paused;
}

/**
 * Whether the toggle applies: the scene mounts (WebGL2), moves (no reduced motion: those visitors
 * already get a still scene) and shows (forced colours hide it), and it has not been taken off
 * screen (html[data-scene="off"] after a renderer failure or a scene error). The toggle is offered
 * exactly when this holds, and a stored pause is applied only then, so a visitor can never be left
 * with a frozen scene and no control to start it. False until the runtime has read the
 * capabilities, which happens after the page's own first effects: subscribe to hear when it changes.
 */
export function isPauseAllowed(): boolean {
  const { webgl2, reducedMotion, forcedColors } = motion.capabilities;
  if (!webgl2 || reducedMotion || forcedColors) return false;
  return typeof document === "undefined" || document.documentElement.dataset.scene !== "off";
}

/** Applies and persists the choice; html[data-motion] lets CSS follow it. */
export function setMotionPaused(paused: boolean): void {
  if (typeof document !== "undefined") document.documentElement.dataset.motion = paused ? "paused" : "running";
  if (motion.paused === paused) return;
  motion.paused = paused;
  try {
    window.localStorage.setItem(STORAGE_KEY, paused ? "1" : "0");
  } catch {
    // Storage blocked: the choice still holds for this page view.
  }
  for (const listener of listeners) listener(paused);
}

/**
 * Something isPauseAllowed() reads has changed (the capabilities were read, a restrictive
 * preference switched on, the scene was hidden): subscribers re-read.
 */
export function notifyPauseListeners(): void {
  for (const listener of listeners) listener(motion.paused);
}

/**
 * Once the runtime has read the capabilities (before the ticker starts, so the first scene frame
 * already honours it): the stored choice, where the toggle applies. A reduced-motion visitor's
 * scene must settle into its still frame, which a stored pause from an earlier visit would stop.
 */
export function applyStoredPause(): void {
  if (isPauseAllowed()) setMotionPaused(readStoredPause());
  notifyPauseListeners();
}

/** For UI (useSyncExternalStore): returns an unsubscribe. */
export function subscribePause(listener: PauseListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
