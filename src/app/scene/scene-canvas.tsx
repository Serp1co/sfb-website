"use client";

/*
 * The fixed WebGL scene behind every page. Loaded by ExperienceRoot with next/dynamic (ssr: false)
 * after the page, so the content is readable and interactive without waiting for three.js and the
 * physics engine, and only for visitors with WebGL2.
 *
 * - frameloop "never": nothing renders on its own. The master ticker (motion/ticker) calls the
 *   ROOT-BOUND state.advance once per tick, after the scroll, the pointer and the glass rects are
 *   updated, so the WebGL glass and its HTML move in the same frame. (R3F's global advance() would
 *   iterate every root without checking that it is configured.) The ticker hands over SCENE
 *   seconds, which stop while the visitor has paused the animation: every useFrame delta is then 0,
 *   yet the canvas still draws every tick, so the glass keeps tracking the scroll.
 * - <World> is the scene content (lights, orb, boards...); <RenderPipeline> renders it through the
 *   liquid-glass composite at useFrame priority 1.
 * - Reduced motion: the world settles out of sight, then the canvas holds a still frame. The page
 *   scrolls over it, so only the composite re-runs (the copy guard follows the text); the whole
 *   scene re-renders only after a resize or a client navigation.
 * - drei's PerformanceMonitor steps the PIPELINE between tiers with our own hysteresis, and only for
 *   GPU-bound slowdowns: when the orb's field rebuild is what costs the frame, the world steps its
 *   own field resolution (motion.perf) and the pipeline keeps its look.
 * - The hero logo's legibility (v3.2): while the composite draws the logo's outline and border on
 *   a canvas the visitor sees whole, html[data-logo-energy="on"] lets the CSS drop the logo's
 *   drop-shadow outline, which would sit over the canvas and hide the bolts; the composite's
 *   outline replaces it (since v3.4 both are an outline round the black letters, white since the owner's
 *   call that evening, where they were a dark halo). Since v3.3 that waits for the logo to finish its CSS rise (on a client
 *   navigation home the outline rises with it), and the two cross over the CSS's 0.6 s transition.
 *   Under the CSS glass it also waits for the wrapper's own fade-in to end: until then the canvas
 *   is still see-through, and black letters left without the CSS outline would blink out.
 * - The hero tagline's outline (v3.4), the same way: while the composite draws it (its field fits
 *   its layout, it has risen), html[data-tagline-energy="on"] lets the CSS drop the tagline's
 *   text-shadow outline, which would sit over the canvas and hide the border drawn on it.
 */

import { Suspense, useCallback, useEffect, useRef, useState, type JSX } from "react";
import { Canvas, type RootState } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { Vector2 } from "three";
import { notifyPauseListeners } from "../motion/pause";
import { hideScene, motion, setEngineMode, SETTLE_MS, type SceneTier } from "../motion/store";
import { setRenderer } from "../motion/ticker";
import { MONITOR, TIERS } from "./pipeline/glass-config";
import RenderPipeline, { type PipelineHandle } from "./pipeline/render-pipeline";
import { TierGovernor } from "./pipeline/tier-governor";
import World from "./world";
import { ROUTE_SNAP_WINDOW_MS } from "./world/camera-rig";

/** Module constants, so R3F sees the same objects on every render and never reconfigures them. */
const CAMERA = { position: [0, 0, 5] as [number, number, number], fov: 75, near: 0.1, far: 120 };
/**
 * No depth buffer on the canvas: only full-screen passes draw to it (the world renders into the
 * pipeline's sceneRT, which has its own), and at 1440x900@1.5 it was ~11 MiB nobody read.
 */
const GL_OPTIONS = { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "high-performance" as const };

/** The ticker never hands out a longer step; a bigger jump means R3F reset its clock. */
const MAX_TICK_DELTA_S = 1 / 20;
const CLOCK_SLACK_S = 1e-3;

/**
 * Reduced motion switched on during the visit: the world pauses its physics SETTLE_MS after it
 * notices (a React update later); the last frame is kept a little after that, so it shows the
 * settled orb.
 */
const STILL_MARGIN_MS = 250;

/**
 * After a client navigation the still re-renders the whole scene for this long: the world snaps to
 * the new page's pose on the frames it is given (the new page's anchors and practice slug can land
 * a few ticks late), for the same window the rig keeps snapping in.
 */
const STILL_ROUTE_REDRAW_MS = ROUTE_SNAP_WINDOW_MS;

/** The verification run appends this to the URL to keep three's shader logs in production builds. */
const GL_DEBUG_FLAG = "gl-debug";

/** Scratch vector for the drawing-buffer size check (the ticker is single-threaded). */
const drawingBuffer = new Vector2();

/** The wrapper's fade-in counts as ended this long after its transition's own end: a frame or two of slack. */
const REVEAL_SLACK_MS = 50;

/** The longest of an element's transitions (duration plus delay, ms), from its computed style's lists. */
function transitionMs(style: CSSStyleDeclaration): number {
  const seconds = (list: string): number[] =>
    list.split(",").map((item) => {
      const value = Number.parseFloat(item);
      if (!Number.isFinite(value)) return 0;
      return item.trim().endsWith("ms") ? value / 1000 : value;
    });
  const durations = seconds(style.transitionDuration);
  const delays = seconds(style.transitionDelay);
  let longest = 0;
  durations.forEach((duration, i) => {
    longest = Math.max(longest, duration + (delays[i % delays.length] ?? 0));
  });
  return longest * 1000;
}

interface RunState {
  root: RootState | null;
  /** The WebGL context was lost: never draw again (a reload restores). */
  stopped: boolean;
  /** Reduced motion: the settled still frame is on screen; only the composite follows the page. */
  frozen: boolean;
  /** performance.now() when reduced motion was first seen switched on during the visit; 0 = not. */
  stillSince: number;
  /** The story's changedAt the still was drawn for: a newer one is a client navigation. */
  stillStoryAt: number;
  /** The still re-renders the whole scene until then (performance.now() ms). */
  redrawUntil: number;
  drawnWidth: number;
  drawnHeight: number;
  detachContextListener: (() => void) | null;
  /**
   * The visitor sees the canvas whole: the wrapper is shown (data-reveal="shown") and its fade-in,
   * if it had one (the CSS glass), has ended. Before that what is drawn there is not all seen.
   */
  revealed: boolean;
  /** What html[data-logo-energy] says now ("on" = true), so it is written on change only. */
  logoEnergy: boolean;
  /** ...and html[data-tagline-energy]. */
  taglineEnergy: boolean;
}

/**
 * Hands the hero logo's legibility to the composite and back. "on" only while the composite draws
 * the logo's outline and border on a canvas the visitor sees whole; off (the attribute removed) as
 * soon as it cannot: before the wrapper has faded in, in the direct fallback, after a lost context
 * or when the canvas unmounts, so the logo's CSS outline is back as the no-scene fallback.
 */
function syncLogoEnergy(state: RunState, on: boolean): void {
  if (state.logoEnergy === on || typeof document === "undefined") return;
  state.logoEnergy = on;
  if (on) document.documentElement.dataset.logoEnergy = "on";
  else delete document.documentElement.dataset.logoEnergy;
}

/** Hands the hero tagline's outline to the composite and back, on the same terms as the logo's (syncLogoEnergy). */
function syncTaglineEnergy(state: RunState, on: boolean): void {
  if (state.taglineEnergy === on || typeof document === "undefined") return;
  state.taglineEnergy = on;
  if (on) document.documentElement.dataset.taglineEnergy = "on";
  else delete document.documentElement.dataset.taglineEnergy;
}

/**
 * A lost context (GPU reset, reclaimed by the browser) hands the panels back to the CSS glass for
 * good. Nothing draws the canvas again, so the scene is off as after a renderer failure (ticker.ts):
 * its last bodies stop lighting the panels, and html[data-scene="off"] gives the CSS its no-scene
 * fallbacks (the outer glow, the service photos), which a wrapper still marked shown would withhold
 * over a blank canvas.
 */
function watchContextLoss(state: RunState): void {
  state.detachContextListener?.();
  state.detachContextListener = null;
  const root = state.root;
  if (!root) return;
  const canvas = root.gl.domElement;
  const onContextLost = () => {
    state.stopped = true;
    syncLogoEnergy(state, false);
    syncTaglineEnergy(state, false);
    setEngineMode("css");
    hideScene();
    // No scene, nothing to pause: the toggle hides.
    notifyPauseListeners();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  state.detachContextListener = () => canvas.removeEventListener("webglcontextlost", onContextLost);
}

function configureRenderer(state: RootState): void {
  const { gl } = state;
  // Production only: skip the per-program shader log query. It prints harmless driver warnings
  // (for example Direct3D's X4122) and costs a GPU round-trip per compile. Development keeps the
  // check so real shader errors still show, and so does any production URL with ?gl-debug (the
  // verification run needs the logs). The pipeline still verifies its own programs' link status.
  const glDebug = typeof location !== "undefined" && location.search.includes(GL_DEBUG_FLAG);
  if (process.env.NODE_ENV === "production" && !glDebug) gl.debug.checkShaderErrors = false;
  // motion.pointer replaces R3F's pointer; skip its raycasting entirely.
  state.setEvents({ enabled: false });
}

/** The still starts now: it is drawn for the current page. */
function freeze(state: RunState): void {
  state.frozen = true;
  state.stillStoryAt = motion.story.changedAt;
  state.redrawUntil = 0;
}

/**
 * One ROOT-BOUND advance at scene seconds; in the still, the composite alone, or a whole frame with
 * no time passing when the scene itself must change.
 */
function drawFrame(state: RunState, root: RootState, sceneSeconds: number, pipeline: PipelineHandle): void {
  const clock = root.clock;
  const buffer = root.gl.getDrawingBufferSize(drawingBuffer);
  if (state.frozen) {
    const nowMs = performance.now();
    const changedAt = motion.story.changedAt;
    if (changedAt !== state.stillStoryAt) {
      // A client navigation: the world snaps to the new page's pose on the frames it runs.
      state.stillStoryAt = changedAt;
      state.redrawUntil = nowMs + STILL_ROUTE_REDRAW_MS;
    }
    const resized = buffer.x !== state.drawnWidth || buffer.y !== state.drawnHeight;
    // A resize clears the canvas; after a navigation the pose changes; a scene pass that waited for
    // its programs left the sceneRT behind. Otherwise only the page moved over the still.
    if (!resized && nowMs >= state.redrawUntil && !pipeline.current?.stale) {
      pipeline.current?.recomposite(root.get());
      return;
    }
    root.advance(clock.elapsedTime);
  } else {
    // R3F sets its clock to 0 whenever it (re)applies the frameloop, and the ticker restarts
    // scene seconds at 0 on every registration: re-seed so the useFrame delta stays the tick's
    // scene delta (0 while paused, so a re-seed never moves a paused scene).
    const delta = sceneSeconds - clock.elapsedTime;
    if (delta < 0 || delta > MAX_TICK_DELTA_S + CLOCK_SLACK_S) {
      clock.elapsedTime = Math.max(sceneSeconds - motion.time.sceneDelta, 0);
    }
    root.advance(sceneSeconds);
  }
  state.drawnWidth = buffer.x;
  state.drawnHeight = buffer.y;
}

/** Decisions only after shaders have compiled and the first textures uploaded. */
function monitorReady(): boolean {
  const readyAt = motion.engine.sceneReadyAt;
  return readyAt > 0 && performance.now() - readyAt > MONITOR.warmupS * 1000;
}

/** The orb's field rebuild, not the GPU, is what costs the frame (both read from motion.perf). */
function cpuBound(): boolean {
  const { rebuildMs, frameMs } = motion.perf;
  return rebuildMs > MONITOR.cpuBoundShare * frameMs;
}

export default function SceneCanvas(): JSX.Element {
  // Capabilities are read once, by ExperienceRoot, before this mounts.
  const [initialTier] = useState<SceneTier>(() => motion.capabilities.sceneTier);
  const [reducedMotion] = useState(() => motion.capabilities.reducedMotion);
  // WebGL-capable visitors fade the scene inside the composite (a CSS fade of this wrapper would
  // fade the glass too), so the wrapper is shown at once. Everyone else gets the CSS fade.
  const [revealed, setRevealed] = useState(() => motion.capabilities.glassMode === "webgl");
  const [tier, setTier] = useState<SceneTier>(initialTier);
  const [governor] = useState(() => new TierGovernor(initialTier, setTier, monitorReady, cpuBound));
  const [pipeline] = useState<PipelineHandle>(() => ({ current: null }));
  const run = useRef<RunState>({
    root: null,
    stopped: false,
    frozen: false,
    stillSince: 0,
    stillStoryAt: 0,
    redrawUntil: 0,
    drawnWidth: 0,
    drawnHeight: 0,
    detachContextListener: null,
    revealed,
    logoEnergy: false,
    taglineEnergy: false,
  });
  const mounted = useRef(false);
  const settleTimer = useRef<number | null>(null);

  // The ticker's renderer: scene seconds (0 at registration, + the tick's scene delta per tick).
  const draw = useCallback(
    (sceneSeconds: number) => {
      const state = run.current;
      const root = state.root;
      if (!root || state.stopped) return;
      if (!state.frozen && !reducedMotion && motion.capabilities.reducedMotion) {
        // Switched on during the visit (the scene is already shown): the same still frame as a
        // visitor who arrives with it, once the world has settled.
        const nowMs = performance.now();
        if (state.stillSince === 0) state.stillSince = nowMs;
        if (nowMs - state.stillSince > SETTLE_MS + STILL_MARGIN_MS) freeze(state);
      }
      drawFrame(state, root, sceneSeconds, pipeline);
      syncLogoEnergy(state, state.revealed && pipeline.current?.logoActive === true);
      syncTaglineEnergy(state, state.revealed && pipeline.current?.taglineActive === true);
    },
    [reducedMotion, pipeline],
  );

  // The canvas is seen whole once the wrapper has faded in: under the CSS glass it fades from
  // opacity 0 on reveal (1.2 s, 0.8 s for the reduced-motion still), and the logo's and the tagline's
  // outlines are handed to the composite only then, never to a canvas still see-through. WebGL glass
  // shows the wrapper at once (its opacity is already 1), so nothing waits there.
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const state = run.current;
    const element = wrapper.current;
    if (!revealed || !element) {
      state.revealed = revealed;
      return;
    }
    const style = getComputedStyle(element);
    if (Number.parseFloat(style.opacity) >= 1) {
      state.revealed = true;
      return;
    }
    state.revealed = false;
    const timer = window.setTimeout(() => {
      state.revealed = true;
    }, transitionMs(style) + REVEAL_SLACK_MS);
    return () => window.clearTimeout(timer);
  }, [revealed]);

  const handleCreated = useCallback(
    (root: RootState) => {
      configureRenderer(root);
      const state = run.current;
      state.root = root;
      watchContextLoss(state);
      if (mounted.current) setRenderer(draw);
    },
    [draw],
  );

  // Registered here as well as in onCreated: a StrictMode remount keeps the R3F root (and does not
  // call onCreated again) but has just cleared the ticker's renderer and the context listener.
  useEffect(() => {
    mounted.current = true;
    const state = run.current;
    if (state.root) {
      watchContextLoss(state);
      setRenderer(draw);
    }
    return () => {
      mounted.current = false;
      setRenderer(null);
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
      state.detachContextListener?.();
      state.detachContextListener = null;
      syncLogoEnergy(state, false);
      syncTaglineEnergy(state, false);
    };
  }, [draw]);

  const handleSceneReady = useCallback(() => {
    if (!reducedMotion) {
      setRevealed(true);
      return;
    }
    // Reduced motion: the orb settles out of sight, then shows as a still frame.
    if (settleTimer.current !== null) return;
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      freeze(run.current);
      setRevealed(true);
    }, SETTLE_MS);
  }, [reducedMotion]);

  const handleDecline = useCallback(() => governor.decline(), [governor]);
  const handleIncline = useCallback(() => governor.incline(), [governor]);

  return (
    <div ref={wrapper} className="scene-fade" data-reveal={revealed ? "shown" : "hidden"} data-still={reducedMotion ? "true" : "false"}>
      <Canvas frameloop="never" camera={CAMERA} gl={GL_OPTIONS} dpr={TIERS[tier].dpr} onCreated={handleCreated}>
        {/* Its own boundary: while the physics WASM and textures load, the pipeline keeps drawing (black). */}
        <Suspense fallback={null}>
          <World tier={initialTier} />
        </Suspense>
        <RenderPipeline tier={tier} onSceneReady={handleSceneReady} handle={pipeline} />
        {!reducedMotion && <PerformanceMonitor flipflops={Infinity} onDecline={handleDecline} onIncline={handleIncline} />}
      </Canvas>
    </div>
  );
}
