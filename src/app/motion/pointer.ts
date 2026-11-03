/*
 * motion.pointer and motion.drag from window listeners, plus the per-tick smoothing the ticker
 * runs right after the scroll update. Listeners only record; nothing here reads layout per tick.
 */

import { isInsideFixedChrome, surfaceAtPoint, surfaceFor } from "../glass/registry";
import { lagFactor } from "./springs";
import { motion, queueImpulse, type PointerState } from "./store";

/** Pointer velocity smoothing: steady enough for wake strength, quick enough to follow a flick. */
const VELOCITY_TAU_S = 0.06;
/** A pointer press (mouse click, tap). Keyboard activations are softer (DOM keyboard press). */
const POINTER_PRESS_STRENGTH = 1;
const KEYBOARD_PRESS_STRENGTH = 0.6;
const OFF_SCREEN = -9999;
/**
 * A touch is a tap, not the start of a scroll, while it stays within this of where it landed:
 * about the browsers' own touch slop, so a touch the browser still turns into a click is a tap here.
 */
const TAP_SLOP_PX = 16;
/** ...and lifts within this long: a longer hold is a long press (the context menu, a text selection). */
const TAP_MAX_MS = 500;

/** A press on any of these lands on a control, text or glass, never on the open scene. */
const NOT_SCENE_SELECTOR =
  "a, button, input, textarea, select, label, summary, [data-glass], p, h1, h2, h3, li, img, " +
  // Fixed chrome (the header bar, the footer bar, menus) is glass too, just CSS glass.
  "header, footer, nav, [data-lenis-prevent], [role='dialog']";
/** Overlays above the page that a press never reaches the scene through (with the fixed chrome). */
const ABOVE_SCENE_SELECTOR = "[data-lenis-prevent], [role='dialog']";
/** Keys that activate the focused element natively, by key (so a press only fires when it acts). */
const ENTER_ACTIVATES =
  "a[href], button, summary, input[type='button'], input[type='submit'], input[type='reset'], " +
  "input[type='image'], [role='button'], [role='link']";
const SPACE_ACTIVATES =
  "button, summary, input[type='button'], input[type='submit'], input[type='reset'], " +
  "input[type='image'], input[type='checkbox'], input[type='radio'], [role='button']";

export interface Activation {
  /** Client CSS px of the last press or keyboard activation. */
  x: number;
  y: number;
  /** performance.now(); 0 before any. */
  time: number;
}

const activation: Activation = { x: OFF_SCREEN, y: OFF_SCREEN, time: 0 };

/** The touch that may still become a tap: landed, not lifted, not moved off, not taken by a scroll. */
const tap = { active: false, pointerId: -1, x: 0, y: 0, time: 0 };

let running = false;
let lastX = 0;
let lastY = 0;
let lastValid = false;

/** Where (and when) the visitor last pressed or activated something: route changes drop there. */
export function lastActivation(): Readonly<Activation> {
  return activation;
}

function pointerType(type: string): PointerState["type"] {
  return type === "touch" || type === "pen" ? type : "mouse";
}

function endDrag(): void {
  const drag = motion.drag;
  if (!drag.active) return;
  drag.active = false;
  drag.dx = 0;
  drag.dy = 0;
  document.documentElement.classList.remove("is-dragging");
}

function isOnScene(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(NOT_SCENE_SELECTOR)) return false;
  // Inside the page itself; a press on <html> (the page scrollbar, below a short body) is not.
  return target.closest("main, body") !== null;
}

/**
 * Whether a press reaches the orb (Impulse.onScene). Owner decisions 2026-11-02: the orb lives
 * inside the panels and answers clicks there, and over text, too, and a tap answers like a click
 * (v3); only the chrome and overlays above the page stand between.
 */
function reachesScene(target: EventTarget | null, onFixedChrome: boolean): boolean {
  if (!(target instanceof Element) || onFixedChrome || target.closest(ABOVE_SCENE_SELECTOR)) return false;
  return target.closest("main, body") !== null;
}

/** A mouse or pen press, or a tap: lights the glass under it and splashes the body of the orb there. */
function queuePress(target: EventTarget | null, x: number, y: number, now: number): void {
  // The header, footer bar and menus are CSS glass above the page: a press on them is not on the
  // WebGL glass that may be scrolling underneath, nor on the orb.
  const onFixedChrome = isInsideFixedChrome(target);
  queueImpulse({
    kind: "press",
    x,
    y,
    strength: POINTER_PRESS_STRENGTH,
    onGlass: !onFixedChrome && surfaceAtPoint(x, y) !== null,
    onScene: reachesScene(target, onFixedChrome),
    time: now,
  });
}

function cancelTap(): void {
  tap.active = false;
  tap.pointerId = -1;
}

function offTapSpot(x: number, y: number): boolean {
  return !(Math.hypot(x - tap.x, y - tap.y) <= TAP_SLOP_PX);
}

/**
 * A touch lifted: a tap when it stayed put, was quick, and no scroll took it (a scroll fires
 * pointercancel, which cancels the tap first). Only then does it press, like a click.
 */
function endTap(event: PointerEvent): void {
  if (!tap.active || event.pointerId !== tap.pointerId) return;
  const now = performance.now();
  const isTap = now - tap.time <= TAP_MAX_MS && !offTapSpot(event.clientX, event.clientY);
  cancelTap();
  if (isTap) queuePress(event.target, event.clientX, event.clientY, now);
}

function onPointerMove(event: PointerEvent): void {
  const pointer = motion.pointer;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.type = pointerType(event.pointerType);
  pointer.lastMove = performance.now();
  pointer.inside = true;
  const drag = motion.drag;
  if (drag.active) {
    drag.dx = pointer.x - pointer.downX;
    drag.dy = pointer.y - pointer.downY;
  }
  // A finger sliding off its spot is a scroll or a drag in the making, even before the browser says so.
  if (tap.active && event.pointerId === tap.pointerId && offTapSpot(event.clientX, event.clientY)) cancelTap();
}

function onPointerDown(event: PointerEvent): void {
  const pointer = motion.pointer;
  const now = performance.now();
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.type = pointerType(event.pointerType);
  pointer.inside = true;
  pointer.down = true;
  pointer.downX = event.clientX;
  pointer.downY = event.clientY;
  activation.x = event.clientX;
  activation.y = event.clientY;
  activation.time = now;

  if (event.pointerType === "touch") {
    // A touch may be the start of a scroll, which must not splash the orb wherever the finger
    // lands: it presses only once it lifts as a tap (endTap). A second finger (never the primary
    // pointer) makes the gesture a pinch or a two-finger pan, never a tap; a primary one always
    // starts a new gesture, so a candidate whose lift went missing never blocks the next tap.
    if (!event.isPrimary) {
      cancelTap();
      return;
    }
    tap.active = true;
    tap.pointerId = event.pointerId;
    tap.x = event.clientX;
    tap.y = event.clientY;
    tap.time = now;
    return;
  }
  queuePress(event.target, event.clientX, event.clientY, now);

  // Dragging the camera stays on the open scene: on text it would fight selection, on a control its click.
  if (event.pointerType === "mouse" && event.button === 0 && isOnScene(event.target)) {
    motion.drag.active = true;
    motion.drag.dx = 0;
    motion.drag.dy = 0;
    document.documentElement.classList.add("is-dragging");
  }
}

function onPointerUp(event: PointerEvent): void {
  const pointer = motion.pointer;
  pointer.down = false;
  if (event.pointerType === "touch") {
    // A lifted finger is no pointer at all: nothing should keep hovering where it was.
    pointer.inside = false;
    endTap(event);
  }
  endDrag();
}

/** The browser took the pointer: for a touch, almost always a scroll or a zoom starting. */
function onPointerCancel(event: PointerEvent): void {
  if (event.pointerId === tap.pointerId) cancelTap();
  onPointerUp(event);
}

function onPointerLeave(): void {
  motion.pointer.inside = false;
  motion.pointer.down = false;
  cancelTap();
  endDrag();
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.repeat || event.defaultPrevented) return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const selector = event.key === "Enter" ? ENTER_ACTIVATES : event.key === " " ? SPACE_ACTIVATES : null;
  if (!selector) return;
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement) || !focused.matches(selector)) return;
  // One rect read per key activation (not per tick); the visual rect is what the visitor sees.
  const rect = focused.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const now = performance.now();
  activation.x = x;
  activation.y = y;
  activation.time = now;
  const surfaceElement = focused.closest("[data-glass]");
  if (!surfaceElement || !surfaceFor(surfaceElement)) return;
  queueImpulse({ kind: "press", x, y, strength: KEYBOARD_PRESS_STRENGTH, onGlass: true, onScene: false, time: now });
}

export function startPointer(): void {
  if (running) return;
  running = true;
  lastValid = false;
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("pointercancel", onPointerCancel, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerLeave, { passive: true });
  window.addEventListener("blur", onPointerLeave);
  window.addEventListener("keydown", onKeyDown);
}

export function stopPointer(): void {
  if (!running) return;
  running = false;
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerdown", onPointerDown);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerCancel);
  document.documentElement.removeEventListener("pointerleave", onPointerLeave);
  window.removeEventListener("blur", onPointerLeave);
  window.removeEventListener("keydown", onKeyDown);
  cancelTap();
  endDrag();
  const pointer = motion.pointer;
  pointer.inside = false;
  pointer.down = false;
  pointer.vx = 0;
  pointer.vy = 0;
}

/**
 * Per tick: prevX/prevY become the position recorded at the previous tick, so every consumer this
 * tick draws the same segment prev -> current; velocity is smoothed from that segment.
 */
export function updatePointerTick(dt: number): void {
  const pointer = motion.pointer;
  const valid = pointer.inside && pointer.x > OFF_SCREEN;
  if (!valid) {
    pointer.prevX = pointer.x;
    pointer.prevY = pointer.y;
    const decay = 1 - lagFactor(dt, VELOCITY_TAU_S);
    pointer.vx *= decay;
    pointer.vy *= decay;
    lastValid = false;
    return;
  }
  // Re-entering the window must not draw a segment from where the pointer left (or from -9999).
  pointer.prevX = lastValid ? lastX : pointer.x;
  pointer.prevY = lastValid ? lastY : pointer.y;
  lastX = pointer.x;
  lastY = pointer.y;
  lastValid = true;
  if (dt <= 0) return;
  const k = lagFactor(dt, VELOCITY_TAU_S);
  pointer.vx += ((pointer.x - pointer.prevX) / dt - pointer.vx) * k;
  pointer.vy += ((pointer.y - pointer.prevY) / dt - pointer.vy) * k;
}
