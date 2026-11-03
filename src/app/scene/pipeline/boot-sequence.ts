import { GLASS_KINDS, glassFrame } from "../../glass/contract";
import { hasSize } from "../../glass/layout-box";
import { getSurfaces } from "../../glass/registry";
import { motion, setEngineMode } from "../../motion/store";
import { BOOT } from "./glass-config";
import type { LinkStatus } from "./program-check";
import type { RippleSim } from "./ripple-sim";

const CARD = GLASS_KINDS.indexOf("card");
const BUTTON = GLASS_KINDS.indexOf("button");

/**
 * The CSS frost of a surface hands over to the WebGL glass while the boot wave condenses it: it
 * starts fading when the front reaches the surface's nearest point and is gone once the band has
 * crossed its farthest one. One global timing (globals.css: --glass-handover, -delay) left the
 * frost over the panes beside the origin until 0.75 s, under which the ring drop at 0.3 s never
 * showed. Bounded, so a surface far below the fold does not keep its frost for seconds.
 */
const HANDOVER_DELAY_MAX_S = 0.85;
const HANDOVER_MIN_S = 0.2;
const HANDOVER_MAX_S = 0.6;

function timeCssHandover(originX: number, originY: number): void {
  const speed = BOOT.speedPxPerS;
  for (const surface of getSurfaces()) {
    if (!hasSize(surface.box)) continue;
    const left = surface.centerX - surface.halfWidth;
    const right = surface.centerX + surface.halfWidth;
    const top = surface.centerY - surface.halfHeight;
    const bottom = surface.centerY + surface.halfHeight;
    if (![left, right, top, bottom].every(Number.isFinite)) continue;
    const near = Math.hypot(Math.max(left - originX, 0, originX - right), Math.max(top - originY, 0, originY - bottom));
    const far = Math.hypot(Math.max(originX - left, right - originX), Math.max(originY - top, bottom - originY));
    const delay = Math.min(near / speed, HANDOVER_DELAY_MAX_S);
    const duration = Math.min(Math.max((far - near + BOOT.bandPx) / speed, HANDOVER_MIN_S), HANDOVER_MAX_S);
    const style = surface.element.style;
    style.setProperty("--glass-handover-delay", `${delay.toFixed(3)}s`);
    style.setProperty("--glass-handover", `${duration.toFixed(3)}s`);
  }
}

/** GSAP's expo.out, so the scene fade matches the site's other reveals. */
function expoOut(t: number): number {
  return t >= 1 ? 1 : 1 - 2 ** (-10 * t);
}

export interface BootInputs {
  nowMs: number;
  cssWidth: number;
  cssHeight: number;
  /** Float render targets: the sim and the WebGL glass need signed HDR values. */
  hdr: boolean;
  /** Every pipeline program's link verdict. */
  programs: LinkStatus;
}

/**
 * One boot sequence (spec 1, 5.4): the scene fades in inside the composite once the world is ready;
 * at 60 % of that fade, if this visitor may have WebGL glass and every program linked, the engine
 * switches to webgl and a single wave condenses the glass outward from the orb (the CSS glass fades
 * out over the same ~0.85 s). Each later moment gets its own beat: a drop lands at the wave's origin
 * 0.3 s in, and two drops skim the first visible card at 2.6 s, after the circuitry's power-on.
 * The timings are wall-clock one-shots; with the animation paused the sim drops them (no ripple
 * plays later, on resume). Any later fall back to css is final for this page view.
 */
export class BootSequence {
  private readonly fadeInComposite: boolean;
  private readyAt = 0;
  private firstFrameAt = 0;
  private activated = false;
  private fellBack = false;
  private ringDropped = false;
  private demoNext = 0;
  private demoTarget = -1;
  readonly origin = { x: 0, y: 0 };

  /**
   * fadeInComposite: webgl-capable visitors fade the scene in the composite (a CSS fade of the
   * canvas would fade the glass too); everyone else gets the CSS fade of the wrapper.
   */
  constructor(fadeInComposite: boolean) {
    this.fadeInComposite = fadeInComposite;
  }

  /**
   * Marks the scene ready at the first composite frame that shows the world (or after a timeout, so
   * a world that never reports ready cannot keep the page black). Returns true on that frame only.
   */
  markFrame(nowMs: number): boolean {
    if (this.readyAt > 0) return false;
    if (this.firstFrameAt === 0) this.firstFrameAt = nowMs;
    const timedOut = nowMs - this.firstFrameAt > BOOT.worldReadyTimeoutS * 1000;
    if (!motion.engine.worldReady && !timedOut) return false;
    this.readyAt = nowMs;
    motion.engine.sceneReady = true;
    motion.engine.sceneReadyAt = nowMs;
    return true;
  }

  sceneFade(nowMs: number): number {
    if (!this.fadeInComposite) return 1;
    if (this.readyAt === 0) return 0;
    return expoOut((nowMs - this.readyAt) / (BOOT.sceneFadeS * 1000));
  }

  /** Seconds since the WebGL glass took over, or -1 while the CSS glass is drawing. */
  bootSeconds(nowMs: number): number {
    const engine = motion.engine;
    return engine.glassMode === "webgl" && engine.activatedAt > 0 ? (nowMs - engine.activatedAt) / 1000 : -1;
  }

  /** Activation and the boot drops; call once per frame after the composite has drawn. */
  update(inputs: BootInputs, sim: RippleSim | null): void {
    const engine = motion.engine;
    if (this.activated && engine.glassMode !== "webgl") this.fellBack = true;
    if (this.fellBack) return;

    if (!this.activated) {
      if (inputs.programs === "failed" && engine.glassMode === "webgl") setEngineMode("css");
      if (!this.canActivate(inputs)) return;
      this.activated = true;
      const orb = motion.orb;
      const orbOnScreen = orb.visible && Number.isFinite(orb.x) && Number.isFinite(orb.y);
      this.origin.x = orbOnScreen ? orb.x : inputs.cssWidth / 2;
      this.origin.y = orbOnScreen ? orb.y : inputs.cssHeight / 2;
      // Before the switch: the CSS transitions start with the timings in place.
      timeCssHandover(this.origin.x, this.origin.y);
      setEngineMode("webgl");
      return;
    }

    if (!this.ringDropped && this.bootSeconds(inputs.nowMs) >= BOOT.ringDelayS) {
      this.ringDropped = true;
      sim?.addDrop(this.origin.x, this.origin.y, BOOT.ringRadiusPx, BOOT.ringAmp);
    }
    this.dropDemo(inputs, sim);
  }

  private canActivate(inputs: BootInputs): boolean {
    return (
      motion.capabilities.glassMode === "webgl" &&
      motion.engine.glassMode === "css" &&
      inputs.hdr &&
      inputs.programs === "linked" &&
      motion.engine.worldReady &&
      this.sceneFade(inputs.nowMs) >= BOOT.activateAtFade
    );
  }

  private dropDemo(inputs: BootInputs, sim: RippleSim | null): void {
    if (!sim || this.demoNext >= BOOT.demoDrops.length) return;
    const t = this.bootSeconds(inputs.nowMs);
    if (t < BOOT.demoDelayS + this.demoNext * BOOT.demoGapS) return;
    if (this.demoNext === 0) this.demoTarget = this.findDemoTarget(inputs.cssWidth, inputs.cssHeight);
    const i = this.demoTarget;
    const drop = BOOT.demoDrops[this.demoNext];
    this.demoNext += 1;
    if (i < 0 || i >= glassFrame.count) return;
    const r = glassFrame.rects;
    sim.addDrop(r[4 * i] + drop.u * r[4 * i + 2], r[4 * i + 1] + drop.v * r[4 * i + 3], drop.radiusPx, drop.amp);
  }

  /** The first condensed card fully on screen, else the first such button, else none. */
  private findDemoTarget(width: number, height: number): number {
    let button = -1;
    for (let i = 0; i < glassFrame.count; i++) {
      const [cx, cy, hw, hh] = glassFrame.rects.subarray(4 * i, 4 * i + 4);
      const kind = Math.round(glassFrame.shape[4 * i + 1]);
      const settled = glassFrame.state[4 * i] >= BOOT.demoMinAppear;
      const inside = cx - hw >= 0 && cy - hh >= 0 && cx + hw <= width && cy + hh <= height;
      if (!settled || !inside) continue;
      if (kind === CARD) return i;
      if (kind === BUTTON && button < 0) button = i;
    }
    return button;
  }
}
