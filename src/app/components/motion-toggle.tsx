"use client";

/*
 * The visitor's pause control for the ambient scene (WCAG 2.2.2 Pause, Stop, Hide), in the footer
 * bar and in the mobile menu. A real button whose visible label names the action a press takes
 * ("Pause animation", then "Play animation"), like the rotation control of the WAI-ARIA carousel
 * pattern. A label that changes with the state is deliberately not combined with aria-pressed: the
 * pair would announce "Play animation, pressed" while the scene is paused.
 *
 * Shown only where pausing does something: the scene runs (WebGL2, the renderer has not given up)
 * and the visitor does not prefer reduced motion (they already get a still scene) or forced colours
 * (the scene is hidden). CSS hides it for those preferences as well, before any script runs.
 */

import { useSyncExternalStore, type JSX } from "react";
import { isMotionPaused, isPauseAllowed, setMotionPaused, subscribePause } from "../motion/pause";
import { PauseIcon, PlayIcon } from "./icons";

/** "pending": the runtime has not read this visitor's capabilities yet (server render, hydration). */
type Availability = "pending" | "on" | "off";

/** The html attributes the runtime writes whenever its view of the scene changes (motion/store.ts). */
const RUNTIME_ATTRIBUTES = ["data-engine", "data-motion", "data-scene"];

function readAvailability(): Availability {
  // startRuntime() writes data-engine once the capabilities are known. ExperienceRoot starts the
  // runtime in its own effect, which runs after the effects of the page inside it (this one).
  if (!document.documentElement.dataset.engine) return "pending";
  // The same rule the runtime applies a stored pause by, so the two can never disagree.
  return isPauseAllowed() ? "on" : "off";
}

function serverAvailability(): Availability {
  return "pending";
}

/**
 * Re-reads when the runtime says what isPauseAllowed() reads has changed (the capabilities read at
 * start, a restrictive preference switching on mid-visit, the scene hidden), and whenever it
 * touches those attributes, as a backstop. Lenis's class changes on <html> are filtered out.
 */
function subscribeAvailability(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: RUNTIME_ATTRIBUTES });
  const unsubscribe = subscribePause(onChange);
  return () => {
    observer.disconnect();
    unsubscribe();
  };
}

function serverPaused(): boolean {
  return false;
}

function togglePause(): void {
  setMotionPaused(!isMotionPaused());
}

interface MotionToggleProps {
  labels: { pause: string; play: string };
  /** The placement's own look: the footer bar or a mobile-menu row. */
  className: string;
}

export default function MotionToggle({ labels, className }: MotionToggleProps): JSX.Element {
  const availability = useSyncExternalStore(subscribeAvailability, readAvailability, serverAvailability);
  const paused = useSyncExternalStore(subscribePause, isMotionPaused, serverPaused);

  // Rendered from the server on and kept invisible while pending, so the control holds its place
  // in the bar instead of pushing the links aside when it appears; "off" takes it out entirely.
  // Both labels share one grid cell, so the button keeps the longer one's width and a press never
  // moves it or the links beside it; the other label is hidden (and so not part of the name).
  return (
    <button
      type="button"
      className={`motion-toggle ${className}`}
      data-available={availability}
      hidden={availability === "off"}
      onClick={togglePause}
    >
      {paused ? <PlayIcon /> : <PauseIcon />}
      <span className="motion-toggle-label">
        <span data-current={paused ? "false" : "true"} aria-hidden={paused}>
          {labels.pause}
        </span>
        <span data-current={paused ? "true" : "false"} aria-hidden={!paused}>
          {labels.play}
        </span>
      </span>
    </button>
  );
}
