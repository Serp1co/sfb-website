/*
 * The one master loop of the site, on gsap.ticker (requestAnimationFrame). GSAP's callback
 * arguments are ignored: they are Date.now based with the delta in milliseconds. Time comes from
 * performance.now(), the clock every timestamp in the store uses. Every tick, in order:
 *   1. motion.time (now = performance.now()/1000, delta clamped to 1/20 s; 1/60 on the first tick;
 *      sceneDelta = delta, or 0 while the visitor has paused the animation), motion.perf.frameMs,
 *      then pending impulses -> motion.impulses
 *   2. lenis.raf(performance.now())       (smooth scroll writes the window scroll)
 *   3. motion.scroll                      (y, delta, velocity, acceleration, limit, progress)
 *   4. motion.pointer                     (prevX/prevY = last tick's position, vx/vy)
 *   5. onTick callbacks by order: the built-ins (TICK_ORDER: magnetic, then the glass registry,
 *      then the story) and anything else registered
 *   6. the renderer set by the canvas, inside try/catch (three consecutive throws: drop it, fall
 *      back to CSS glass and hide the canvas)
 *
 * The renderer receives SCENE SECONDS: a clock that starts at 0 when the renderer registers and
 * advances by motion.time.sceneDelta each tick. R3F's advance() (frameloop "never") uses its
 * argument directly as clock time, so every useFrame delta equals the clamped tick delta (0 while
 * paused: the scene holds still, yet the renderer still runs every tick, so the WebGL glass keeps
 * tracking the scroll), the first frame never jumps, and a background tab simply pauses the scene.
 */

import { gsap } from "gsap";
import { notifyPauseListeners } from "./pause";
import { updatePointerTick } from "./pointer";
import { updateScrollState } from "./scroll-state";
import { getLenis } from "./smooth-scroll";
import { hideScene, motion, pendingImpulses, setEngineMode } from "./store";

export type TickFn = (timeSeconds: number, deltaSeconds: number) => void;

/**
 * Orders of the built-in callbacks. Magnetic runs before the registry packs the glass, so the DOM
 * translate and the WebGL lens of a magnetic button move in the same frame.
 */
export const TICK_ORDER = {
  magnetic: 10,
  registry: 20,
  story: 30,
} as const;

const DEFAULT_TICK_ORDER = 100;
const FIRST_TICK_DELTA_S = 1 / 60;
/** Longest step any consumer ever sees: physics and ripples stay stable after a long frame. */
const MAX_TICK_DELTA_S = 1 / 20;
const MAX_CONSECUTIVE_RENDER_FAILURES = 3;
/** GSAP's own lag-smoothing defaults, restored when the ticker stops. */
const GSAP_LAG_THRESHOLD_MS = 500;
const GSAP_ADJUSTED_LAG_MS = 33;
/**
 * perf.frameMs follows the rAF interval with this weight per frame (about a 20-frame memory):
 * one hitch barely moves it, a sustained slowdown or a new refresh rate shows within ~0.3 s.
 */
const FRAME_MS_SMOOTHING = 0.05;
/** A longer gap is a background tab, a debugger pause or a one-off stall, not the frame cost. */
const MAX_FRAME_SAMPLE_MS = 100;

interface TickEntry {
  readonly fn: TickFn;
  readonly order: number;
  readonly sequence: number;
  active: boolean;
}

/** Sorted by order, then registration; replaced (never mutated) so a tick can iterate a snapshot. */
let entries: readonly TickEntry[] = [];
let sequence = 0;
const failedEntries = new WeakSet<TickEntry>();
const failedStages = new Set<string>();

let renderer: ((sceneSeconds: number) => void) | null = null;
let sceneSeconds = 0;
let consecutiveRenderFailures = 0;
let rendererFailureLogged = false;

let running = false;
let lastMs = -1;

/**
 * Adds a per-tick callback (lower order runs first; the built-ins use TICK_ORDER, 10-30, and
 * everything else defaults to 100, after them). Returns a remover.
 */
export function onTick(fn: TickFn, order = DEFAULT_TICK_ORDER): () => void {
  const entry: TickEntry = { fn, order, sequence: sequence++, active: true };
  entries = [...entries, entry].sort((a, b) => a.order - b.order || a.sequence - b.sequence);
  return () => {
    if (!entry.active) return;
    entry.active = false;
    entries = entries.filter((candidate) => candidate !== entry);
  };
}

/**
 * The canvas registers its root-bound R3F `state.advance` here, so WebGL renders in the same
 * tick, after the scroll and the glass rects are updated. Pass null on unmount.
 */
export function setRenderer(render: ((sceneSeconds: number) => void) | null): void {
  renderer = render;
  sceneSeconds = 0;
  consecutiveRenderFailures = 0;
}

function logOnce(stage: string, error: unknown): void {
  if (failedStages.has(stage)) return;
  failedStages.add(stage);
  console.error(`[motion] ${stage} failed; the rest of the frame keeps running.`, error);
}

function drainImpulses(): void {
  const impulses = motion.impulses;
  impulses.length = 0;
  for (const impulse of pendingImpulses) impulses.push(impulse);
  pendingImpulses.length = 0;
}

function runCallbacks(now: number, dt: number): void {
  const snapshot = entries;
  for (const entry of snapshot) {
    if (!entry.active) continue;
    try {
      entry.fn(now, dt);
    } catch (error) {
      if (!failedEntries.has(entry)) {
        failedEntries.add(entry);
        console.error("[motion] an onTick callback threw; it keeps being called.", error);
      }
    }
  }
}

function render(sceneDelta: number): void {
  const draw = renderer;
  if (!draw) return;
  sceneSeconds += sceneDelta;
  try {
    draw(sceneSeconds);
    consecutiveRenderFailures = 0;
  } catch (error) {
    consecutiveRenderFailures++;
    if (consecutiveRenderFailures < MAX_CONSECUTIVE_RENDER_FAILURES) return;
    // A renderer that keeps throwing (a useFrame bug, a lost GPU) would otherwise throw every
    // frame forever: stop calling it and give the panels back their CSS glass. Nothing draws to
    // the canvas again, and a WebGL canvas keeps its last frame (glass panes where the page has
    // since scrolled away from), so the scene is hidden too: no GL call, which may be what throws.
    setRenderer(null);
    setEngineMode("css");
    hideScene();
    // No scene, nothing to pause: the toggle hides.
    notifyPauseListeners();
    if (!rendererFailureLogged) {
      rendererFailureLogged = true;
      console.error("[motion] The WebGL renderer failed repeatedly; falling back to CSS glass.", error);
    }
  }
}

/** Smoothed rAF interval, for the CPU- vs GPU-bound decisions of the world and the pipeline. */
function sampleFrameInterval(intervalMs: number): void {
  if (intervalMs <= 0 || intervalMs > MAX_FRAME_SAMPLE_MS) return;
  const perf = motion.perf;
  perf.frameMs += (intervalMs - perf.frameMs) * FRAME_MS_SMOOTHING;
}

function tick(): void {
  const nowMs = performance.now();
  const dt = lastMs < 0 ? FIRST_TICK_DELTA_S : Math.min(Math.max((nowMs - lastMs) / 1000, 0), MAX_TICK_DELTA_S);
  if (lastMs >= 0) sampleFrameInterval(nowMs - lastMs);
  lastMs = nowMs;
  motion.time.now = nowMs / 1000;
  motion.time.delta = dt;
  // The visitor's pause (motion/pause.ts) stops the scene's clock only: scroll, pointer, the glass
  // registry's hover and press feedback and the reveals keep the real delta.
  motion.time.sceneDelta = motion.paused ? 0 : dt;
  drainImpulses();

  const lenis = getLenis();
  if (lenis) {
    try {
      lenis.raf(nowMs);
    } catch (error) {
      logOnce("smooth scroll", error);
    }
  }
  try {
    updateScrollState(dt);
    updatePointerTick(dt);
  } catch (error) {
    logOnce("scroll and pointer state", error);
  }
  runCallbacks(motion.time.now, dt);
  render(motion.time.sceneDelta);
}

/** Idempotent (React StrictMode mounts twice in development). */
export function startTicker(): void {
  if (running) return;
  running = true;
  lastMs = -1;
  // No lag smoothing: after a long frame GSAP's clock must not drift from performance.now(),
  // which drives the scene, the ripples and every timestamp in the store.
  gsap.ticker.lagSmoothing(0);
  gsap.ticker.add(tick);
}

export function stopTicker(): void {
  if (!running) return;
  running = false;
  gsap.ticker.remove(tick);
  gsap.ticker.lagSmoothing(GSAP_LAG_THRESHOLD_MS, GSAP_ADJUSTED_LAG_MS);
}
