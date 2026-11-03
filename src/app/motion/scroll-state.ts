/*
 * motion.scroll, written once per tick by the ticker right after lenis.raf(), so it matches what
 * the DOM shows in the frame the WebGL renders.
 */

import { motion } from "./store";
import { clamp, lagFactor } from "./springs";

/** Velocity smoothing: long enough to calm wheel jitter, short enough that a flick reads at once. */
const VELOCITY_TAU_S = 0.12;
/** Acceleration smoothing (it drives the liquid's slosh, so it must stay snappy). */
const ACCELERATION_TAU_S = 0.08;
/**
 * Fastest believable scroll. A native scrollbar drag or find-in-page can jump thousands of px in
 * one frame; clamping the instantaneous speed keeps those from kicking the slosh oscillators.
 */
const MAX_SCROLL_SPEED_PX_S = 12000;
/**
 * A single-tick move longer than this many viewport heights is a teleport (route change, hash
 * jump, history restoration), not motion: the smoothing restarts from rest instead.
 */
const TELEPORT_VIEWPORTS = 1.5;

let documentHeight = 0;

/** Set by the registry whenever it measures the document (scrollHeight). */
export function setDocumentHeight(height: number): void {
  documentHeight = height;
  updateLimit();
}

function updateLimit(): void {
  const scroll = motion.scroll;
  scroll.limit = Math.max(0, documentHeight - motion.viewport.height);
  scroll.progress = scroll.limit > 0 ? clamp(scroll.y / scroll.limit, 0, 1) : 0;
}

/** Restarts the scroll state at rest at the current position (boot, after programmatic jumps). */
export function resetScrollMotion(): void {
  const scroll = motion.scroll;
  scroll.y = window.scrollY;
  scroll.prevY = scroll.y;
  scroll.delta = 0;
  scroll.velocity = 0;
  scroll.acceleration = 0;
  updateLimit();
}

export function updateScrollState(dt: number): void {
  const scroll = motion.scroll;
  const y = window.scrollY;
  scroll.prevY = scroll.y;
  scroll.y = y;
  scroll.delta = y - scroll.prevY;
  updateLimit();
  if (dt <= 0) return;

  if (Math.abs(scroll.delta) > TELEPORT_VIEWPORTS * motion.viewport.height) {
    scroll.velocity = 0;
    scroll.acceleration = 0;
    return;
  }
  const previousVelocity = scroll.velocity;
  const instantVelocity = clamp(scroll.delta / dt, -MAX_SCROLL_SPEED_PX_S, MAX_SCROLL_SPEED_PX_S);
  scroll.velocity += (instantVelocity - scroll.velocity) * lagFactor(dt, VELOCITY_TAU_S);
  const instantAcceleration = (scroll.velocity - previousVelocity) / dt;
  scroll.acceleration += (instantAcceleration - scroll.acceleration) * lagFactor(dt, ACCELERATION_TAU_S);
}
