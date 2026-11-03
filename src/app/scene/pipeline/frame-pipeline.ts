/*
 * The render pipeline's frame (spec 5.2), independent of React:
 *
 *   world scene -> sceneRT (linear HDR, MSAA per tier)
 *   sceneRT -> dual-Kawase chain in CSS px -> frostMid, frost (bloom is read from the frost)
 *   ripple sim: fixed 120 steps/s, whole-texel scroll shift, pane pools (webgl) or open water (css)
 *   composite -> canvas: the scene, and every packed glass surface refracting it (under the CSS
 *     glass: the scene, and only the panel energy outside each pane), and round the electric logos
 *     their outline light, from their distance fields (one atlas, logo-field.ts, the tagline's from
 *     the page's text, tagline-field.ts): the hero's crisp white outline with its border,
 *     always on, the tagline's same outline (its hover border with no arcs or sparks), and the
 *     charge under the pointer (logo-energy.ts)
 *   logo overlay -> canvas: the logos' bolts and sparks (a small flash where a bigger discharge
 *     lands, and over a mark's burst), the hero's small arcs at rest and its thunder on a click or
 *     tap (bolts shooting outward, no flash), a screen blend over the composite (logo-arcs.ts),
 *     only while motion is allowed
 *
 * The narrow-screen dim (below 1024 px) is the composite's in both glass modes: under the WebGL glass
 * on the scene term (the CSS overlay is hidden), under the CSS glass whatever share of it the CSS
 * overlay leaves undrawn (css-dim.ts: the stylesheet hides it while the scene runs, v3.1), so the
 * energy light lands on top at full strength and copy keeps exactly the contrast the overlay gave it.
 *
 * Coordinates come from R3F's measured canvas size (state.size) and the drawing buffer, never from
 * motion.viewport: the canvas excludes the scrollbar and renders below window.devicePixelRatio.
 *
 * Time: everything that moves on its own (the sim, the slosh, the noise) advances by the frame's
 * delta, which is scene time: 0 while the visitor has paused the animation. The pipeline still
 * draws every frame then, so the WebGL glass keeps tracking the scroll. Wall-clock one-shots (the
 * scene fade, the boot wave and its drops) read performance.now().
 *
 * The canvas has no depth buffer: only full-screen passes draw to it. The world always renders
 * into the sceneRT, even in the direct fallback.
 */

import { Vector2, type Camera, type Scene, type ShaderMaterial, type Texture, type WebGLRenderer } from "three";
import { ANCHORS, MAX_SURFACES, anchorRects, type AnchorRect } from "../../glass/contract";
import { hideScene, motion, setEngineMode, type SceneTier } from "../../motion/store";
import { BlurChain } from "./blur-chain";
import { BootSequence } from "./boot-sequence";
import { Composite, type CompositeFrame } from "./composite";
import { CssDimProbe } from "./css-dim";
import { FullscreenPass, passMaterial } from "./fullscreen-pass";
import { BACKGROUND, ELECTRICITY, GUARD, TIERS } from "./glass-config";
import { ProgramValidator, type LinkStatus } from "./program-check";
import { createPressPoint, feedRipples } from "./ripple-input";
import { LogoArcs } from "./logo-arcs";
import { resetCharge, type ChargedLogo } from "./logo-energy";
import { RippleSim } from "./ripple-sim";
import { SceneCompileGate } from "./scene-compile";
import { SceneTarget } from "./scene-target";
import { PRESENT_FRAG } from "./shaders/present.frag";
import { Slosh } from "./slosh";

/** What a frame needs from R3F's root state (RootState satisfies it). */
export interface FrameState {
  /** The canvas's measured CSS size. */
  size: { width: number; height: number };
  scene: Scene;
  camera: Camera;
}

/** The noise patterns repeat after this many frames (keeps their float maths exact). */
const NOISE_FRAME_PERIOD = 64;

/**
 * The pipeline's own programs link in the background at start (the canvas stays black meanwhile,
 * as it is before the world is ready anyway); past this the first frame draws regardless.
 */
const WARMUP_MAX_MS = 2000;

/** An anchor's first rect when laid out (finite, not empty), else null. */
function firstRect(name: string): AnchorRect | null {
  const rect = anchorRects.get(name)?.[0];
  return rect && Number.isFinite(rect.x) && Number.isFinite(rect.y) && rect.width > 0 && rect.height > 0 ? rect : null;
}

/** Texel sizes handed to the composite when there is no sim (it is then never sampled). */
const NO_SIM_TEXEL = new Vector2(1, 1);

interface CompositeVariant {
  material: ShaderMaterial;
  taps: number;
}

/** Float render targets: the HDR scene, and the sim's signed heights. */
export function supportsFloatTargets(gl: WebGLRenderer): boolean {
  return gl.extensions.has("EXT_color_buffer_float") || gl.extensions.has("EXT_color_buffer_half_float");
}

/** The first `used` entries match. */
function sameValues(a: Float32Array, b: Float32Array, used: number): boolean {
  for (let i = 0; i < used; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * The still's static energy glow reads each surface's hover, focus and energy: a change past this
 * redraws it. One 8-bit step of the glow; the hover springs and the energy ease approach their
 * targets without ever landing, and redrawing for that would keep the still busy for seconds.
 */
const STILL_GLOW_EPSILON = 1 / 256;

/** Hover (state y), focus (state w) and energy (x) of the first `count` surfaces match the still's within STILL_GLOW_EPSILON. */
function sameGlow(state: Float32Array, energy: Float32Array, stillState: Float32Array, stillEnergy: Float32Array, count: number): boolean {
  for (let o = 0; o < 4 * count; o += 4) {
    if (Math.abs(state[o + 1] - stillState[o + 1]) > STILL_GLOW_EPSILON) return false;
    if (Math.abs(state[o + 3] - stillState[o + 3]) > STILL_GLOW_EPSILON) return false;
    if (Math.abs(energy[o] - stillEnergy[o]) > STILL_GLOW_EPSILON) return false;
  }
  return true;
}

export class FramePipeline {
  private readonly gl: WebGLRenderer;
  private readonly hdr: boolean;
  private readonly sceneTarget: SceneTarget;
  private readonly blur: BlurChain;
  private readonly sim: RippleSim | null;
  private readonly composite = new Composite();
  /** The electric logos' bolts and sparks, drawn over the composite. */
  private readonly arcs = new LogoArcs();
  /** The logo records the bolts follow (the hero's, then the two marks'; the tagline has none), refilled each frame (no allocation). */
  private readonly logoRecords: ChargedLogo[] = [];
  private readonly pass: FullscreenPass;
  private readonly slosh = new Slosh();
  private readonly boot: BootSequence;
  private readonly validator = new ProgramValidator();
  private readonly sceneCompile = new SceneCompileGate();
  private readonly press = createPressPoint();
  private readonly buffer = new Vector2();
  /** uDim: the narrow-screen dim the direct copy draws, when the CSS overlay has handed it over. */
  private readonly presentUniforms = { tScene: { value: null as Texture | null }, uDim: { value: 1 } };
  /** The direct fallback's copy to the canvas (built on first use). */
  private present: ShaderMaterial | null = null;
  private tier: SceneTier;
  private compositeVariant: CompositeVariant;
  /** The last variant whose program is known to link (the fallback if a new one does not). */
  private linkedVariant: CompositeVariant | null = null;
  /** A tier's composite variant compiling off the critical path, swapped in when ready. */
  private compiling: CompositeVariant | null = null;
  /** Tap counts whose variant failed to link: never retried. */
  private readonly brokenTaps = new Set<number>();
  /** A core program failed: draw the scene alone (through the sceneRT), CSS glass for the panels. */
  private direct = false;
  /** Even the direct copy failed: nothing is drawn again. */
  private halted = false;
  private disposed = false;
  private warm = false;
  private readonly warmStartedAt = performance.now();
  private noiseFrame = 0;
  /** The border electricity's clock: scene seconds (so it holds while paused), wrapped. */
  private electricTime = 0;
  /** Every composite input, reused each frame (no allocation in the frame). */
  private readonly inputs: CompositeFrame;
  /** How much of the narrow-screen dim the CSS overlay draws right now (css mode). */
  private readonly cssDimProbe: CssDimProbe;
  /** This frame's dim split under the CSS glass (see updateDim): the composite's own share, and 1 / the overlay's. */
  private cssDim = 1;
  private overlayGain = 1;
  /** The last frame's scene pass was skipped (its programs were compiling): the sceneRT is behind. */
  private sceneBehind = true;
  /** What the canvas shows, for the still's change test: has anything been composited, at what size, over what. */
  private composited = false;
  private stillWidth = 0;
  private stillHeight = 0;
  private stillGuardCount = 0;
  private readonly stillGuards = new Float32Array(4 * GUARD.maxRects);
  private stillSurfaceCount = 0;
  private readonly stillRects = new Float32Array(4 * MAX_SURFACES);
  private readonly stillState = new Float32Array(4 * MAX_SURFACES);
  private readonly stillEnergy = new Float32Array(4 * MAX_SURFACES);
  private stillCssDim = 1;
  private stillOverlayGain = 1;
  /** The logos as the still drew them (Composite.logo: each slot's box and look). */
  private readonly stillLogo = new Float32Array(this.composite.logo.length);

  constructor(gl: WebGLRenderer, tier: SceneTier) {
    this.gl = gl;
    this.tier = tier;
    this.cssDimProbe = new CssDimProbe(gl.domElement);
    this.hdr = supportsFloatTargets(gl);
    this.sceneTarget = new SceneTarget(this.hdr);
    this.blur = new BlurChain(this.sceneTarget.target.texture.type);
    // Without float targets there are no signed heights: no water, and css glass only.
    this.sim = this.hdr ? new RippleSim() : null;
    this.compositeVariant = this.variant(TIERS[tier].taps);
    this.pass = new FullscreenPass(this.compositeVariant.material);
    this.boot = new BootSequence(motion.capabilities.glassMode === "webgl");
    this.inputs = {
      cssWidth: 1,
      cssHeight: 1,
      bufferWidth: 1,
      bufferHeight: 1,
      scene: this.sceneTarget.target.texture,
      frostMid: this.blur.frostMid,
      frost: this.blur.frost,
      ripple: null,
      rippleTexel: NO_SIM_TEXEL,
      rippleTexelCss: NO_SIM_TEXEL,
      glassOn: false,
      sceneFade: 0,
      backgroundDim: 1,
      cssDim: 1,
      overlayGain: 1,
      bloomThreshold: 1,
      scrollSpeed: 0,
      slosh: 0,
      pointerX: -9999,
      pointerY: -9999,
      pointerOn: false,
      pressX: -9999,
      pressY: -9999,
      pressRingSpeed: 0,
      bootT: -1,
      bootOriginX: 0,
      bootOriginY: 0,
      frame: 0,
      electricTime: 0,
      electricArcs: false,
    };
    this.warmUp();
  }

  /**
   * The scene pass skipped its last chance to draw (new world programs were compiling): a still
   * frame must keep rendering until it has drawn the world as it is now.
   */
  get stale(): boolean {
    return this.sceneBehind && !this.halted;
  }

  /**
   * The composite draws the hero logo's outline and border (its field is built, the page has it
   * and it has finished rising): the canvas hands the logo's legibility over on this. Never in the
   * direct fallback or once halted: nothing composites there.
   */
  get logoActive(): boolean {
    return !this.direct && !this.halted && !this.disposed && this.composite.logoActive;
  }

  /** The composite draws the hero tagline's outline (and its hover border): the canvas hands its CSS outline over on this. Never in the direct fallback or once halted. */
  get taglineActive(): boolean {
    return !this.direct && !this.halted && !this.disposed && this.composite.taglineActive;
  }

  /** Renders one frame. delta: scene seconds (0 while paused). Returns true on the frame the scene first shows the world. */
  frame(state: FrameState, delta: number, tier: SceneTier): boolean {
    if (this.disposed || this.halted) return false;
    const gl = this.gl;
    const nowMs = performance.now();
    const cssWidth = state.size.width;
    const cssHeight = state.size.height;
    if (!(cssWidth >= 1 && cssHeight >= 1)) return false;
    if (!this.warm && nowMs - this.warmStartedAt < WARMUP_MAX_MS) return false;
    const dt = delta > 0 ? delta : 0;

    if (!this.direct) this.applyTier(tier);
    const settings = TIERS[this.tier];
    gl.getDrawingBufferSize(this.buffer);
    this.sceneTarget.resize(this.buffer.x, this.buffer.y, settings);
    gl.transmissionResolutionScale = settings.transmissionScale;
    if (this.direct) return this.frameDirect(state, nowMs);

    this.blur.resize(cssWidth, cssHeight, settings.blurStartLevel);
    this.sim?.resize(cssWidth, cssHeight, settings.simTexelCss);

    let drewScene = false;
    const autoClear = gl.autoClear;
    try {
      // 1. Scene pass. Linear HDR: three never tone-maps into render targets.
      drewScene = this.renderScene(state, nowMs);

      // Every later pass overwrites its whole target.
      gl.autoClear = false;

      // 2. Frost chain.
      const sceneRT = this.sceneTarget.target;
      this.blur.render(gl, this.pass, sceneRT.texture, sceneRT.width, sceneRT.height);

      // 3. Water. Reduced motion (read per frame: it can switch on during the visit) has none.
      const glassOn = motion.engine.glassMode === "webgl";
      const still = motion.capabilities.reducedMotion;
      // The logos' bolts, bursts and crackle move only with motion allowed: paused or still, a static glow.
      const arcs = !still && !motion.paused;
      const surfaces = this.composite.packSurfaces();
      this.composite.packAnchors(glassOn, cssWidth, cssHeight, nowMs, arcs, still);
      this.updateDim(glassOn);
      const water = still ? null : this.sim;
      if (water) {
        feedRipples(water, glassOn, this.press);
        // Pools ride with their panes; css-mode water lies on the fixed scene and stays put.
        if (glassOn) water.addScroll(motion.scroll.delta);
        water.update(gl, this.pass, dt, glassOn, surfaces);
      }

      // 4. Composite. The noise moves with scene time: a paused frame matches the last one.
      if (dt > 0) this.noiseFrame = (this.noiseFrame + 1) % NOISE_FRAME_PERIOD;
      this.electricTime = (this.electricTime + dt) % ELECTRICITY.timePeriodS;
      const slosh = still ? 0 : this.slosh.update(dt, motion.scroll.acceleration);
      this.compose(cssWidth, cssHeight, nowMs, glassOn, water, slosh, still);

      // 5. The logos' bolts, sparks and thunder, over the composite on the canvas (still bound);
      // the hero's keep off the tagline's box (its lockup's lower part without one). The tagline
      // itself throws none (owner, 2026-11-02 evening: its hover border without the sparkles).
      const logos = this.composite.logos;
      this.logoRecords[0] = logos.hero;
      this.logoRecords[1] = logos.marks[0];
      this.logoRecords[2] = logos.marks[1];
      this.arcs.update(this.logoRecords, dt, arcs, firstRect(ANCHORS.heroBrand), firstRect(ANCHORS.heroTagline), cssWidth, cssHeight);
      this.arcs.render(gl, cssWidth, cssHeight, this.inputs.sceneFade * this.overlayGain);
    } finally {
      gl.autoClear = autoClear;
      gl.setRenderTarget(null);
    }
    this.sceneBehind = !drewScene;
    this.rememberStill(cssWidth, cssHeight);

    const programs = this.programStatus();
    if (programs === "failed") {
      this.fallBackToDirect();
      return false;
    }
    // Ready only on a frame whose scene pass drew: the fade must start on the world, not on a stale image.
    const ready = drewScene && this.boot.markFrame(nowMs);
    this.boot.update({ nowMs, cssWidth, cssHeight, hdr: this.hdr, programs }, this.sim);
    return ready;
  }

  /**
   * The reduced-motion still: the page moves over a fixed scene, so only the composite re-runs,
   * over the cached sceneRT and frost, and only when what it draws over that scene has moved (the
   * copy rects the guard follows, the packed surfaces, the static energy glow: a body's pane
   * scrolling in or the pointer entering it, the logos: the hero's box on screen, its field built,
   * its outline fading in, a logo's static glow on hover) or the CSS has handed the narrow-screen dim over or back (the still
   * is revealed late, after it settles). Returns whether it drew. A resize needs a full frame (the
   * canvas was cleared, the targets resized), which the caller sends instead.
   */
  recomposite(state: FrameState): boolean {
    if (this.disposed || this.halted || this.direct || !this.composited) return false;
    const cssWidth = state.size.width;
    const cssHeight = state.size.height;
    if (cssWidth !== this.stillWidth || cssHeight !== this.stillHeight) return false;
    const glassOn = motion.engine.glassMode === "webgl";
    const nowMs = performance.now();
    const surfaces = this.composite.packSurfaces();
    // The still has no motion: a logo's charge jumps to its hover, no bolts, bursts or crackle.
    this.composite.packAnchors(glassOn, cssWidth, cssHeight, nowMs, false, true);
    this.updateDim(glassOn);
    const guardCount = this.composite.guardCount;
    if (
      this.cssDim === this.stillCssDim &&
      this.overlayGain === this.stillOverlayGain &&
      guardCount === this.stillGuardCount &&
      surfaces.count === this.stillSurfaceCount &&
      sameValues(this.composite.guards, this.stillGuards, 4 * guardCount) &&
      sameValues(surfaces.rects, this.stillRects, 4 * surfaces.count) &&
      sameGlow(surfaces.state, this.composite.energy, this.stillState, this.stillEnergy, surfaces.count) &&
      sameValues(this.composite.logo, this.stillLogo, this.stillLogo.length)
    ) {
      return false;
    }
    const gl = this.gl;
    const autoClear = gl.autoClear;
    try {
      gl.autoClear = false;
      this.compose(cssWidth, cssHeight, nowMs, glassOn, null, 0, true);
    } finally {
      gl.autoClear = autoClear;
      gl.setRenderTarget(null);
    }
    this.rememberStill(cssWidth, cssHeight);
    return true;
  }

  /** The scene pass into the sceneRT, unless the world's new programs are still compiling (the sceneRT then keeps its last image). */
  private renderScene(state: FrameState, nowMs: number): boolean {
    const gl = this.gl;
    const sceneRT = this.sceneTarget.target;
    if (!this.sceneCompile.allows(gl, state.scene, state.camera, sceneRT, nowMs)) return false;
    gl.autoClear = true;
    gl.setRenderTarget(sceneRT);
    gl.render(state.scene, state.camera);
    return true;
  }

  /** Fills this frame's composite inputs and draws the composite to the canvas. */
  private compose(
    cssWidth: number,
    cssHeight: number,
    nowMs: number,
    glassOn: boolean,
    water: RippleSim | null,
    slosh: number,
    still: boolean,
  ): void {
    const f = this.inputs;
    const pointer = motion.pointer;
    f.cssWidth = cssWidth;
    f.cssHeight = cssHeight;
    f.bufferWidth = this.buffer.x;
    f.bufferHeight = this.buffer.y;
    f.scene = this.sceneTarget.target.texture;
    f.frostMid = this.blur.frostMid;
    f.frost = this.blur.frost;
    f.ripple = water?.texture ?? null;
    f.rippleTexel = water?.texel ?? NO_SIM_TEXEL;
    f.rippleTexelCss = water?.texelCss ?? NO_SIM_TEXEL;
    f.glassOn = glassOn;
    f.sceneFade = this.boot.sceneFade(nowMs);
    f.backgroundDim = glassOn && cssWidth < BACKGROUND.narrowWidth ? BACKGROUND.narrowDim : 1;
    f.cssDim = this.cssDim;
    f.overlayGain = this.overlayGain;
    f.bloomThreshold = this.hdr ? BACKGROUND.bloomThreshold : BACKGROUND.bloomThresholdLdr;
    // A still frame is a fixed image under a moving page: no scroll fringe on it.
    f.scrollSpeed = still ? 0 : Math.abs(motion.scroll.velocity);
    f.slosh = slosh;
    f.pointerX = pointer.x;
    f.pointerY = pointer.y;
    f.pointerOn = pointer.inside && pointer.type !== "touch";
    f.pressX = this.press.x;
    f.pressY = this.press.y;
    f.pressRingSpeed = this.sim?.waveSpeedPxPerS ?? 0;
    f.bootT = this.boot.bootSeconds(nowMs);
    f.bootOriginX = this.boot.origin.x;
    f.bootOriginY = this.boot.origin.y;
    f.frame = this.noiseFrame;
    f.electricTime = this.electricTime;
    // Paused or reduced motion: the energised border keeps its static glow, the arcs stop.
    f.electricArcs = !still && !motion.paused;
    this.composite.setFrame(f);
    this.pass.render(this.gl, this.compositeVariant.material, null);
  }

  private rememberStill(cssWidth: number, cssHeight: number): void {
    this.composited = true;
    this.stillWidth = cssWidth;
    this.stillHeight = cssHeight;
    this.stillGuardCount = this.composite.guardCount;
    this.stillGuards.set(this.composite.guards);
    this.stillSurfaceCount = this.composite.surfaces.count;
    this.stillRects.set(this.composite.surfaces.rects);
    this.stillState.set(this.composite.surfaces.state);
    this.stillEnergy.set(this.composite.energy);
    this.stillCssDim = this.cssDim;
    this.stillOverlayGain = this.overlayGain;
    this.stillLogo.set(this.composite.logo);
  }

  /**
   * Who draws the narrow-screen dim this frame. Under the WebGL glass the composite does, on the
   * scene term (backgroundDim), and the CSS overlay is hidden: nothing here. Under the CSS glass the
   * scene must end at narrowDim on the overlay's narrow screens, as it always has: the composite
   * draws whatever share of that the overlay does not (all of it once the stylesheet hides the
   * overlay while the scene runs, none while it still draws), after the copy guard, where the
   * overlay scaled the canvas, so bare copy keeps exactly its contrast. overlayGain pre-compensates
   * the energy light for an overlay still drawn (1 once it is not: the plain screen blend).
   */
  private updateDim(glassOn: boolean): void {
    if (glassOn) {
      this.cssDim = 1;
      this.overlayGain = 1;
      return;
    }
    const overlay = this.cssDimProbe.pass();
    const target = this.cssDimProbe.narrow ? BACKGROUND.narrowDim : 1;
    this.cssDim = Math.min(target / overlay, 1);
    this.overlayGain = 1 / overlay;
  }

  /** The direct fallback: the world into the sceneRT (it has the depth buffer), then copied to the canvas. */
  private frameDirect(state: FrameState, nowMs: number): boolean {
    const gl = this.gl;
    // No composite here: nothing charges the logos (a charge left as it was would keep the world's flares lit).
    resetCharge();
    const present = (this.present ??= this.presentMaterial());
    let drewScene = false;
    const autoClear = gl.autoClear;
    try {
      drewScene = this.renderScene(state, nowMs);
      gl.autoClear = false;
      this.presentUniforms.tScene.value = this.sceneTarget.target.texture;
      // No guard here, so the whole dim the overlay hands over is the copy's only protection.
      this.updateDim(motion.engine.glassMode === "webgl");
      this.presentUniforms.uDim.value = this.cssDim;
      this.pass.render(gl, present, null);
    } finally {
      gl.autoClear = autoClear;
      gl.setRenderTarget(null);
    }
    this.sceneBehind = !drewScene;
    if (this.validator.status(gl, present) === "failed") {
      // Nothing can draw the scene: take it off screen (the canvas would keep a stale frame).
      this.halted = true;
      resetCharge();
      hideScene();
      console.error("[scene] The scene's fallback copy failed to link too; the scene is not drawn.");
      return false;
    }
    return drewScene && this.boot.markFrame(nowMs);
  }

  private presentMaterial(): ShaderMaterial {
    const material = passMaterial(PRESENT_FRAG, this.presentUniforms);
    material.name = "scene present (direct fallback)";
    return material;
  }

  private variant(taps: number): CompositeVariant {
    return { material: this.composite.material(taps), taps };
  }

  /**
   * Links the pipeline's own programs off the main thread before their first draw: the composite
   * alone used to block the first frame for tens of milliseconds (KHR_parallel_shader_compile).
   * The blur and sim programs draw into render targets and the composite into the canvas, and three
   * keys programs by that, so each compiles with such a target bound.
   */
  private warmUp(): void {
    const gl = this.gl;
    const target = this.sceneTarget.target;
    const jobs: Promise<unknown>[] = [];
    try {
      for (const material of this.blur.materials) jobs.push(this.pass.compile(gl, material, target));
      if (this.sim) jobs.push(this.pass.compile(gl, this.sim.material, target));
      jobs.push(this.pass.compile(gl, this.compositeVariant.material, null));
    } catch {
      // The first frame compiles them synchronously, as it always did.
      this.warm = true;
      return;
    }
    const done = (): void => {
      this.warm = true;
    };
    Promise.all(jobs).then(done, done);
  }

  /** Link verdicts of every program the pipeline drew with this frame. */
  private programStatus(): LinkStatus {
    const gl = this.gl;
    const core = this.validator.statusAll(gl, this.sim ? [...this.blur.materials, this.sim.material] : this.blur.materials);
    if (core === "failed") return "failed";
    const composite = this.validator.status(gl, this.compositeVariant.material);
    if (composite === "linked") this.linkedVariant = this.compositeVariant;
    if (composite === "failed") {
      // A tier variant that will not link: go back to one that did, else give up on the pipeline.
      this.brokenTaps.add(this.compositeVariant.taps);
      if (!this.linkedVariant) return "failed";
      this.compositeVariant = this.linkedVariant;
      return core;
    }
    return core === "pending" || composite === "pending" ? "pending" : "linked";
  }

  private fallBackToDirect(): void {
    this.direct = true;
    if (motion.engine.glassMode === "webgl") setEngineMode("css");
    console.error("[scene] A render-pipeline shader failed to link; drawing the scene without the liquid glass.");
  }

  /** Tier changes from the performance monitor: sizes follow next frame, the composite variant when compiled. */
  private applyTier(tier: SceneTier): void {
    if (tier === this.tier) return;
    this.tier = tier;
    const taps = TIERS[tier].taps;
    if (this.brokenTaps.has(taps) || taps === this.compositeVariant.taps || taps === this.compiling?.taps) return;
    const next = this.variant(taps);
    if (this.validator.status(this.gl, next.material) === "linked") {
      this.compositeVariant = next;
      return;
    }
    // A new #define means a new program: compile it in parallel and keep drawing the old one.
    this.compiling = next;
    this.pass
      .compile(this.gl, next.material, null)
      .then(() => {
        if (this.disposed || this.compiling !== next) return;
        this.compiling = null;
        // Compiled, so asking for the link status no longer stalls. A variant that did not link is
        // never drawn (one frame of it would be black).
        const status = this.validator.status(this.gl, next.material);
        if (status === "failed") {
          this.brokenTaps.add(taps);
          return;
        }
        if (TIERS[this.tier].taps === taps) this.compositeVariant = next;
      })
      .catch(() => {
        if (this.compiling === next) this.compiling = null;
        this.brokenTaps.add(taps);
      });
  }

  dispose(): void {
    this.disposed = true;
    this.cssDimProbe.dispose();
    this.sceneTarget.dispose();
    this.blur.dispose();
    this.sim?.dispose();
    this.composite.dispose();
    this.arcs.dispose();
    this.pass.dispose();
    this.present?.dispose();
  }
}
