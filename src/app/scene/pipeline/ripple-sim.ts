import {
  HalfFloatType,
  LinearFilter,
  RGBAFormat,
  Vector2,
  Vector4,
  WebGLRenderTarget,
  type ShaderMaterial,
  type Texture,
  type WebGLRenderer,
} from "three";
import { MAX_SURFACES } from "../../glass/contract";
import { RIPPLE } from "./glass-config";
import { passMaterial, type FullscreenPass } from "./fullscreen-pass";
import { RIPPLE_STEP_FRAG } from "./shaders/ripple.frag";

/** Packed glass surfaces for the pool walls (the composite's arrays, already NaN-guarded). */
export interface PoolSurfaces {
  count: number;
  rects: Float32Array;
  shape: Float32Array;
  state: Float32Array;
}

interface Drop {
  x: number;
  y: number;
  radius: number;
  amp: number;
}

const STEP_S = 1 / RIPPLE.stepsPerS;

/** The leapfrog step runs at a Courant number of 1/sqrt(2) texels per step: long waves travel at this many texels per step. */
const COURANT = Math.SQRT1_2;

/**
 * The sponge's absorption profile (1 - depth / width)^2 integrates to 1/3 of its peak over the
 * band, so a peak density of 3 x nepers / width absorbs RIPPLE.spongeNepers across it.
 */
const SPONGE_PROFILE_INTEGRAL = 1 / 3;

function simTarget(): WebGLRenderTarget {
  return new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    format: RGBAFormat,
    // The composite reads heights bilinearly (smooth slopes between 4 px texels); the step
    // itself uses texelFetch and ignores filtering.
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: false,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

/**
 * The water on the glass (spec 5.2 step 3): a ping-pong height field at one square texel scale,
 * stepped at a fixed 120 steps/s so its speed and fade do not depend on the display's refresh rate.
 * Drops queued between steps (frames with no step at > 120 Hz) are carried to the next step, the
 * scroll shift is carried as whole texels plus a fractional remainder, and the wipe decays once per
 * stepping frame by the time that actually passed. The cursor brush is cut per step: each step
 * paints its share of the path since the last step, at a fixed amplitude, so the wake is the same at
 * 60 and at 240 Hz. A sponge along every wall (RIPPLE.sponge*) takes its share per step too, so a
 * wall returns one clear reflection at any refresh rate and texel size.
 *
 * Only scene time moves the water (the frame's delta, 0 while the visitor has paused the
 * animation): with no time passing nothing propagates, decays or is injected, and the frozen field
 * only shifts with the scroll so it stays on its panes.
 */
export class RippleSim {
  private readonly targets: [WebGLRenderTarget, WebGLRenderTarget] = [simTarget(), simTarget()];
  private current = 0;
  private cssWidth = 0;
  private cssHeight = 0;
  private texelCssWanted = 0;
  private accumulator = 0;
  private shiftTexels = 0;
  private wipeSeconds = 0;
  private readonly drops: Drop[] = [];
  /** This frame's brush: where the pointer is, and what each step paints (set by setBrush every frame). */
  private brushOn = false;
  private brushX = 0;
  private brushY = 0;
  private brushWaveAmp = 0;
  private brushWipe = 0;
  /** Where the brush was at the last step: the start of the next stroke (NaN: start with a dab). */
  private lastX = Number.NaN;
  private lastY = Number.NaN;
  readonly texel = new Vector2(1, 1);
  readonly texelCss = new Vector2(1, 1);

  private readonly uniforms = {
    tState: { value: null as Texture | null },
    uSize: { value: new Vector2(1, 1) },
    uCss: { value: new Vector2(1, 1) },
    uShift: { value: 0 },
    uFreeze: { value: 0 },
    uDamping: { value: RIPPLE.dampingOpen as number },
    uPools: { value: 0 },
    uWipeDecay: { value: 1 },
    uDropCount: { value: 0 },
    uDrops: { value: Array.from({ length: RIPPLE.maxDrops }, () => new Vector4()) },
    uStrokeOn: { value: 0 },
    uStrokeA: { value: new Vector4() },
    uStrokeB: { value: new Vector4() },
    uSpongeRate: { value: 0 },
    uCount: { value: 0 },
    uRects: { value: new Float32Array(4 * MAX_SURFACES) },
    uShape: { value: new Float32Array(4 * MAX_SURFACES) },
    uState: { value: new Float32Array(4 * MAX_SURFACES) },
  };
  readonly material: ShaderMaterial = passMaterial(RIPPLE_STEP_FRAG, this.uniforms);

  /** The latest state (R height, G previous height, B wipe). */
  get texture(): Texture {
    return this.targets[this.current].texture;
  }

  /** Speed of the sim's wave front in CSS px per second (about 340 at 4 px texels). */
  get waveSpeedPxPerS(): number {
    return this.texelCss.x * RIPPLE.stepsPerS * COURANT;
  }

  /**
   * One scale for both axes, so waves stay round: k = min(1 / texelCss, maxSide / longest side).
   * A real size change starts from still water.
   */
  resize(cssWidth: number, cssHeight: number, texelCss: number): void {
    if (cssWidth === this.cssWidth && cssHeight === this.cssHeight && texelCss === this.texelCssWanted) return;
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.texelCssWanted = texelCss;
    const scale = Math.min(1 / texelCss, RIPPLE.maxSimSide / Math.max(cssWidth, cssHeight, 1));
    const width = Math.max(1, Math.ceil(cssWidth * scale));
    const height = Math.max(1, Math.ceil(cssHeight * scale));
    for (const target of this.targets) target.setSize(width, height);
    this.texel.set(1 / width, 1 / height);
    this.texelCss.set(cssWidth / width, cssHeight / height);
    this.uniforms.uSize.value.set(width, height);
    this.uniforms.uCss.value.set(cssWidth, cssHeight);
    // The sponge absorbs per CSS px a wave travels, and a step carries it this many px (more at
    // the coarser texels of big screens and the performance tier), so every texel size reflects
    // the same share of a wave.
    this.uniforms.uSpongeRate.value = (RIPPLE.spongeNepers / SPONGE_PROFILE_INTEGRAL) * this.texelCss.x * COURANT;
    this.accumulator = 0;
    this.shiftTexels = 0;
    this.drops.length = 0;
    this.lastX = Number.NaN;
    this.lastY = Number.NaN;
  }

  /** A cosine drop at rest (radiates a ring). Client CSS px. */
  addDrop(x: number, y: number, radius: number, amp: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !(amp > 0)) return;
    this.drops.push({ x, y, radius, amp });
    if (this.drops.length > RIPPLE.maxDrops) {
      // Keep the strongest: a burst never drops the press that caused it.
      this.drops.sort((a, b) => b.amp - a.amp);
      this.drops.length = RIPPLE.maxDrops;
    }
  }

  /**
   * The cursor over glass this frame (client CSS px): each step until the next frame paints a
   * capsule along its share of the path from the last step's position, with this wave amplitude
   * (per step) and frost wipe. A resting brush (both 0) still moves the path's start.
   */
  setBrush(x: number, y: number, waveAmp: number, wipeStrength: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      this.clearBrush();
      return;
    }
    this.brushOn = true;
    this.brushX = x;
    this.brushY = y;
    this.brushWaveAmp = Number.isFinite(waveAmp) ? Math.max(waveAmp, 0) : 0;
    this.brushWipe = Number.isFinite(wipeStrength) ? Math.max(wipeStrength, 0) : 0;
  }

  /** No cursor on glass this frame: the next stroke starts with a dab where the cursor comes back. */
  clearBrush(): void {
    this.brushOn = false;
  }

  /** Carries this frame's scroll (CSS px, + = scrolling down) into the next step's whole-texel shift. */
  addScroll(deltaCss: number): void {
    if (Number.isFinite(deltaCss) && this.cssHeight > 0) {
      this.shiftTexels += deltaCss * (this.uniforms.uSize.value.y / this.cssHeight);
    }
  }

  /** Advances the field by the fixed-rate steps that fit in dt (scene seconds: 0 while paused). */
  update(gl: WebGLRenderer, pass: FullscreenPass, dt: number, pools: boolean, surfaces: PoolSurfaces): void {
    if (!(dt > 0)) {
      this.freeze(gl, pass);
      return;
    }
    this.accumulator += dt;
    this.wipeSeconds += dt;
    const steps = Math.min(Math.floor(this.accumulator / STEP_S + 1e-6), RIPPLE.maxStepsPerFrame);
    this.accumulator -= steps * STEP_S;
    // After a long frame the backlog is dropped, never replayed: no catch-up bursts.
    if (steps === RIPPLE.maxStepsPerFrame) this.accumulator = Math.min(this.accumulator, STEP_S);
    // No step this frame (> 120 Hz): drops, the scroll and the brush path carry to the next one.
    if (steps === 0) return;

    const u = this.uniforms;
    u.uFreeze.value = 0;
    u.uPools.value = pools ? 1 : 0;
    u.uDamping.value = pools ? RIPPLE.dampingPools : RIPPLE.dampingOpen;
    u.uCount.value = pools ? surfaces.count : 0;
    u.uRects.value.set(surfaces.rects);
    u.uShape.value.set(surfaces.shape);
    u.uState.value.set(surfaces.state);

    // Everything queued since the last step (possibly over several step-less frames) rides on the
    // first step; the later steps of this frame only propagate, plus their share of the stroke.
    this.loadInjections();
    const brush = this.brushOn;
    let fromX = this.lastX;
    let fromY = this.lastY;
    if (brush && !(Math.hypot(this.brushX - fromX, this.brushY - fromY) <= RIPPLE.maxStrokePx)) {
      // First move, a re-entry or a jump (NaN fails the test too): a dab, never a streak across the screen.
      fromX = this.brushX;
      fromY = this.brushY;
    }
    const painting = brush && (this.brushWaveAmp > 0 || this.brushWipe > 0);
    u.uStrokeOn.value = painting ? 1 : 0;
    u.uStrokeB.value.set(RIPPLE.brushRadiusPx, this.brushWaveAmp, RIPPLE.wipeRadiusPx, this.brushWipe);
    for (let i = 0; i < steps; i++) {
      if (painting) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        u.uStrokeA.value.set(
          fromX + (this.brushX - fromX) * t0,
          fromY + (this.brushY - fromY) * t0,
          fromX + (this.brushX - fromX) * t1,
          fromY + (this.brushY - fromY) * t1,
        );
      }
      this.step(gl, pass);
      if (i === 0) {
        u.uShift.value = 0;
        u.uDropCount.value = 0;
        u.uWipeDecay.value = 1;
      }
    }
    this.lastX = brush ? this.brushX : Number.NaN;
    this.lastY = brush ? this.brushY : Number.NaN;
  }

  /**
   * No scene time passed (the visitor paused the animation): a press or a boot drop must not
   * ripple later, on resume, so queued drops are dropped; the frozen field shifts with the scroll
   * (whole texels, as a step would) so its ripples stay on their panes.
   */
  private freeze(gl: WebGLRenderer, pass: FullscreenPass): void {
    this.drops.length = 0;
    // On resume the brush path restarts at the cursor, not where it was before the pause.
    this.lastX = this.brushOn ? this.brushX : Number.NaN;
    this.lastY = this.brushOn ? this.brushY : Number.NaN;
    const whole = Math.round(this.shiftTexels);
    if (whole === 0) return;
    this.shiftTexels -= whole;
    const u = this.uniforms;
    u.uFreeze.value = 1;
    u.uShift.value = whole;
    this.step(gl, pass);
    u.uFreeze.value = 0;
    u.uShift.value = 0;
  }

  private step(gl: WebGLRenderer, pass: FullscreenPass): void {
    this.uniforms.tState.value = this.targets[this.current].texture;
    const next = 1 - this.current;
    pass.render(gl, this.material, this.targets[next]);
    this.current = next;
  }

  private loadInjections(): void {
    const u = this.uniforms;
    const whole = Math.round(this.shiftTexels);
    this.shiftTexels -= whole;
    u.uShift.value = whole;
    u.uWipeDecay.value = Math.exp(-this.wipeSeconds / RIPPLE.refogTauS);
    this.wipeSeconds = 0;
    u.uDropCount.value = this.drops.length;
    this.drops.forEach((drop, i) => u.uDrops.value[i].set(drop.x, drop.y, drop.radius, drop.amp));
    this.drops.length = 0;
  }

  dispose(): void {
    for (const target of this.targets) target.dispose();
    this.material.dispose();
  }
}
