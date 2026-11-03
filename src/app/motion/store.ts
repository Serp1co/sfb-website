/* ------------------------------------------------------------------ */
/*  Shared per-frame state: the contract between the DOM motion        */
/*  runtime (src/app/motion), the glass registry (src/app/glass) and   */
/*  the WebGL scene (src/app/scene, src/app/aquaism).                  */
/*                                                                     */
/*  Plain mutable objects, never React state: everything here is read  */
/*  inside the master ticker or R3F frame callbacks at 60 fps, so it    */
/*  must never cause a render. One writer per field (noted below).      */
/*                                                                     */
/*  Time: every timestamp is performance.now() in milliseconds.        */
/*  motion.time.now is the same clock in seconds. GSAP's ticker        */
/*  arguments (Date.now based, delta in ms) are never used for app time. */
/* ------------------------------------------------------------------ */

/** "webgl": panels are drawn by the WebGL composite. "css": panels use their CSS frosted glass. */
export type GlassMode = "webgl" | "css";

/** Starting quality of the 3D scene. The performance monitor may step the pipeline down at run time. */
export type SceneTier = "quality" | "balanced" | "performance";

/** With reduced motion the scene runs this long out of sight, then shows as a still frame. */
export const SETTLE_MS = 6000;

/** Written once at boot by motion/capabilities.ts. */
export interface Capabilities {
  /**
   * The browser has WebGL2 (three.js r163+ needs it). Not a context probe: one costs ~180 ms at
   * boot. Should the scene's own context then fail (blocklisted GPU), SceneErrorBoundary removes
   * the scene and the panels keep their CSS glass.
   */
  webgl2: boolean;
  /** (pointer: coarse): touch-first device. Gets CSS glass (owner decision, 2026-11-01). */
  coarsePointer: boolean;
  /** (hover: hover) */
  hover: boolean;
  reducedMotion: boolean;
  reducedTransparency: boolean;
  moreContrast: boolean;
  forcedColors: boolean;
  /** (max-width: 768px) */
  narrow: boolean;
  /**
   * The glass this visitor may get. "webgl" only with WebGL2, a fine pointer, and none of
   * reduced motion, reduced transparency, more contrast or forced colours. Everyone else: "css".
   * Decide per-visitor behaviour from this, not from engine.glassMode (which is "css" until boot).
   */
  glassMode: GlassMode;
  sceneTier: SceneTier;
}

export interface ViewportState {
  /**
   * CSS px of the layout viewport without the scrollbar
   * (document.documentElement.clientWidth / clientHeight), the space client rects live in.
   * The pipeline uses the canvas's own measured size and drawing buffer for its maths.
   */
  width: number;
  height: number;
  /** window.devicePixelRatio (the canvas may render below it; read the renderer for that). */
  dpr: number;
}

/** Written by the ticker after lenis.raf() each tick, so it matches what the DOM shows this frame. */
export interface ScrollState {
  /** Window scroll in CSS px as rendered this frame. */
  y: number;
  /** Value at the previous tick. */
  prevY: number;
  /** y - prevY for this tick, CSS px. Positive when scrolling down. */
  delta: number;
  /** Smoothed velocity, CSS px per second. Positive when scrolling down. */
  velocity: number;
  /** Smoothed d(velocity)/dt, CSS px per second squared (drives the liquid's slosh). */
  acceleration: number;
  /** Maximum scroll (document height - viewport height). */
  limit: number;
  /** y / limit, 0..1. */
  progress: number;
}

/** Written by motion/pointer.ts (window listeners) and smoothed by the ticker. */
export interface PointerState {
  /** Client (viewport) CSS px. */
  x: number;
  y: number;
  /** Position at the previous tick, for drawing drop segments along the cursor path. */
  prevX: number;
  prevY: number;
  /** Smoothed velocity, CSS px per second. */
  vx: number;
  vy: number;
  /** The pointer is over the document (false after it leaves the window). */
  inside: boolean;
  down: boolean;
  type: "mouse" | "pen" | "touch";
  /** performance.now() of the last move. */
  lastMove: number;
  /** Where the last press happened (client CSS px); -9999 before any press. */
  downX: number;
  downY: number;
  /** Packed index (into glassFrame) of the glass surface under the pointer this tick, or -1. */
  surface: number;
  /** Nearest [data-anchor] ancestor under the pointer, or null. */
  anchor: { name: string; index: number } | null;
}

/** A press on the open scene (not on a control or on text) drags the camera around the orb. */
export interface DragState {
  active: boolean;
  /** Total movement since the press, CSS px. */
  dx: number;
  dy: number;
}

/**
 * "press": a pointer press or keyboard activation (drives press light, ripples, the orb's splash).
 * "drop": a programmatic drop into the liquid (a pane condensing, a page change, the boot demo):
 *         ripples only, never press light or splash.
 */
export type ImpulseKind = "press" | "drop";

export interface Impulse {
  kind: ImpulseKind;
  /** Client CSS px. */
  x: number;
  y: number;
  /** 0..1. A mouse click is 1, a keyboard activation 0.6, drops as their caller decides. */
  strength: number;
  /** Lands on a glass surface. */
  onGlass: boolean;
  /**
   * The press reaches the orb, which splashes: a mouse or pen press anywhere on the page, over glass
   * and text too (owner decision 2026-11-02: the orb answers inside its panels), but not on the
   * fixed chrome or an overlay. A touch presses only once it lifts as a tap (it stayed put and no
   * scroll took it), and then reaches the orb like a click (v3). Keyboard activations and drops: false.
   */
  onScene: boolean;
  /** performance.now() */
  time: number;
}

/** Written by motion/story.ts every tick from the [data-story] sections of the current page. */
export interface StoryState {
  /** Pose names of the page's [data-story] sections, in DOM order. Empty: use the "hero" pose. */
  names: string[];
  /**
   * Continuous position through the page: i + f, where names[i] is the current section and
   * f (0..1) how far through it the reading is. A section starts when its top reaches the viewport
   * centre; the first runs from scroll 0 and the last ends exactly at the scroll limit. Where a
   * short first or last section would start outside [0, limit] (tall viewports), the starts are
   * clamped back inside with at least 1 px each, so both end poses are reachable on any viewport
   * (motion/section-knots.ts). 0 at the top; (n - 1) + 0.9999 at the limit.
   */
  position: number;
  /** Practice slug when the page is a practice page ([data-practice] on <main>), else "". */
  practice: string;
  /** Pathname the story was built for. */
  path: string;
  /** performance.now() of the last client navigation to a new page; 0 on the first page. */
  changedAt: number;
}

/**
 * One body of the orb as the visitor sees it (owner decision 2026-11-02: the orb splits into as many
 * bodies as a section has panels, and a panel glows while a body is inside it). The small droplet in
 * each technology pill (v3.1) is a body too, and lights its pill. Written by the world every frame,
 * up to MAX_ORB_BODIES; empty while the scene is not drawing.
 */
export interface OrbBody {
  /** Projected centre, client CSS px. */
  x: number;
  y: number;
  /**
   * Projected radius, CSS px: what shows. A pill's droplet lights its pill fully from 0.2 of the
   * pill's height up (about 0.3 by design), so one condensing or dissolving there grows from or
   * shrinks to 0 rather than fading at full size (glass/energy.ts).
   */
  radius: number;
  /**
   * Share of the orb's mass in this body, 0..1 (all bodies sum to about 1). A cell needs a body with
   * a fair share of an even split; a pill only needs one with any (weight > 0), so 0 switches a
   * droplet off for the glass whatever its radius.
   */
  weight: number;
}

/**
 * Most bodies the orb splits into: one per panel cell of a section (About 2, Services 3, Contact 3, and
 * since 2026-11-02 the practice pages' feature cards, up to 9, their CTA panel, and one small ball in each
 * of the 11-14 technology pills).
 */
export const MAX_ORB_BODIES = 16;

/** Written by the scene: the orb's projected centre and radius, for effects that start from it. */
export interface OrbState {
  /** Client CSS px. */
  x: number;
  y: number;
  radius: number;
  /** In front of the camera and within the viewport. */
  visible: boolean;
}

export interface EngineState {
  /** What is drawing the panels right now. "css" until the WebGL glass has drawn its first frames. */
  glassMode: GlassMode;
  /** The canvas has drawn its first composite frame. Written by the pipeline. */
  sceneReady: boolean;
  /** performance.now() of the first composite frame; 0 = not yet. Written by the pipeline. */
  sceneReadyAt: number;
  /** The world has mounted (physics loaded, first world frame ran). Written by the world. */
  worldReady: boolean;
  /** performance.now() when the WebGL glass took over (drives the boot wave). 0 = never. */
  activatedAt: number;
}

export interface MotionStore {
  capabilities: Capabilities;
  viewport: ViewportState;
  scroll: ScrollState;
  pointer: PointerState;
  drag: DragState;
  /**
   * Impulses for THIS tick. The ticker moves pending impulses here at the start of each tick
   * and empties the array at the start of the next, so every consumer sees each impulse once.
   * Push new ones with queueImpulse(), never into this array directly.
   */
  impulses: Impulse[];
  story: StoryState;
  orb: OrbState;
  /** The orb's bodies this frame (one when merged), projected; see OrbBody. */
  bodies: OrbBody[];
  engine: EngineState;
  /**
   * The visitor paused the ambient animation with the on-page toggle (WCAG 2.2.2), persisted
   * across visits. Not the same as reduced motion: the WebGL glass keeps drawing and tracking the
   * scroll, but the scene's clock stops (time.sceneDelta = 0). Written by motion/pause.ts.
   */
  paused: boolean;
  /**
   * Seconds on the performance.now() clock: now = performance.now() / 1000. delta is clamped to
   * 1/20 s, so a background tab or a long frame never explodes the physics or the ripples.
   * sceneDelta is delta, or 0 while paused: everything autonomous in the scene (physics, the
   * ripple sim, shader time, idle drift, camera springs) advances by sceneDelta, which is also what
   * R3F's useFrame delta becomes through the ticker's scene clock. Wall-clock one-shot timers (the
   * boot wave, the CSS handover) may keep using performance.now().
   */
  time: { now: number; delta: number; sceneDelta: number };
  /**
   * Shared cost readings so CPU-bound and GPU-bound slowdowns get different remedies.
   * frameMs: smoothed rAF interval (ticker). rebuildMs: smoothed orb field rebuild (world).
   * fieldResolution: the orb's live marching-cubes resolution (world).
   */
  perf: { frameMs: number; rebuildMs: number; fieldResolution: number };
  /**
   * v3.4: how charged each electric mark is this frame, 0..1, written by the pipeline (which owns the
   * hover/charge envelopes and the bursts) and read by the world (node flares, the orb feeding the logo).
   * hero: the hero logo; tagline: the hero tagline; marks: the partner/customer logos by logo-mark index.
   * burstAt: performance.now() of the last click/tap discharge on the hero logo (0 = none yet).
   */
  charge: { hero: number; tagline: number; marks: Float32Array; burstAt: number };
}

/** Most partner/customer logo marks the charge array holds (9 today). */
export const MAX_MARKS = 16;

export const motion: MotionStore = {
  capabilities: {
    webgl2: false,
    coarsePointer: false,
    hover: false,
    reducedMotion: false,
    reducedTransparency: false,
    moreContrast: false,
    forcedColors: false,
    narrow: false,
    glassMode: "css",
    sceneTier: "quality",
  },
  viewport: { width: 1, height: 1, dpr: 1 },
  scroll: { y: 0, prevY: 0, delta: 0, velocity: 0, acceleration: 0, limit: 1, progress: 0 },
  pointer: {
    x: -9999,
    y: -9999,
    prevX: -9999,
    prevY: -9999,
    vx: 0,
    vy: 0,
    inside: false,
    down: false,
    type: "mouse",
    lastMove: 0,
    downX: -9999,
    downY: -9999,
    surface: -1,
    anchor: null,
  },
  drag: { active: false, dx: 0, dy: 0 },
  impulses: [],
  story: { names: [], position: 0, practice: "", path: "", changedAt: 0 },
  orb: { x: 0, y: 0, radius: 0, visible: false },
  bodies: [],
  engine: { glassMode: "css", sceneReady: false, sceneReadyAt: 0, worldReady: false, activatedAt: 0 },
  paused: false,
  time: { now: 0, delta: 1 / 60, sceneDelta: 1 / 60 },
  perf: { frameMs: 1000 / 60, rebuildMs: 0, fieldResolution: 0 },
  charge: { hero: 0, tagline: 0, marks: new Float32Array(MAX_MARKS), burstAt: 0 },
};

/** Impulses waiting for the next tick (moved into motion.impulses by the ticker). */
export const pendingImpulses: Impulse[] = [];

/** Queues an impulse for the next tick. Safe to call from event handlers and from the scene. */
export function queueImpulse(impulse: Impulse): void {
  pendingImpulses.push(impulse);
}

/**
 * Switches what draws the panels. The CSS listens to html[data-engine]: "webgl" fades the CSS
 * frosted glass out (the WebGL composite draws the glass instead), "css" brings it back
 * (also on WebGL context loss or a renderer failure).
 */
export function setEngineMode(mode: GlassMode): void {
  motion.engine.glassMode = mode;
  motion.engine.activatedAt = mode === "webgl" ? performance.now() : 0;
  if (typeof document !== "undefined") document.documentElement.dataset.engine = mode;
}

/**
 * The renderer gave up (it kept throwing): nothing will draw to the canvas again, and a WebGL
 * canvas keeps its last frame, stale glass panes included. CSS hides the scene on
 * html[data-scene="off"] with visibility (not display), so the canvas keeps its size.
 */
export function hideScene(): void {
  // Nothing draws the orb any more: its last bodies must not keep panels lit (glass/energy.ts).
  motion.bodies.length = 0;
  motion.orb.visible = false;
  if (typeof document === "undefined") return;
  document.documentElement.dataset.scene = "off";
  // Nor does it draw the hero logo's outline or the tagline's any more: both take their CSS outline
  // back (the CSS also ignores both flags under data-scene="off";
  // this keeps <html> honest as well).
  delete document.documentElement.dataset.logoEnergy;
  delete document.documentElement.dataset.taglineEnergy;
}
