import { motion } from "../../motion/store";
import { RIPPLE } from "./glass-config";
import type { RippleSim } from "./ripple-sim";

/** Last press on WebGL glass (client CSS px), for the composite's press ring light. */
export interface PressPoint {
  x: number;
  y: number;
}

/** Far off-screen: no press yet. */
const NO_PRESS = -9999;

/** brushAmp is calibrated per 1/60 s of stroke; each sim step paints its share of that. */
const BRUSH_STEP_SHARE = 60 / RIPPLE.stepsPerS;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

function onScreen(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) < 1e5;
}

export function createPressPoint(): PressPoint {
  return { x: NO_PRESS, y: NO_PRESS };
}

/**
 * Feeds this tick's impulses and the pointer into the ripple sim (spec 5.2 step 3).
 * glassOn: the WebGL glass is drawing (pools on panes); otherwise the water is the scene (css mode).
 * The cursor brush is handed to the sim as a position and a per-step strength: the sim cuts the path
 * per step, so the wake does not depend on the refresh rate. Nothing here reads time: with the
 * scene clock stopped the sim drops what it is given.
 */
export function feedRipples(sim: RippleSim, glassOn: boolean, press: PressPoint): void {
  for (const impulse of motion.impulses) {
    if (!onScreen(impulse.x) || !onScreen(impulse.y)) continue;
    const strength = Math.min(Math.max(impulse.strength, 0), 1);
    if (impulse.kind === "press") {
      if (glassOn) {
        if (!impulse.onGlass) continue;
        // The ring light runs out from the press on the pressed pane; a press elsewhere (a link
        // on the open scene) must not move the ring of a pane that is still lit.
        press.x = impulse.x;
        press.y = impulse.y;
        sim.addDrop(impulse.x, impulse.y, RIPPLE.pressRadiusPx, RIPPLE.pressAmp * strength);
      } else {
        sim.addDrop(impulse.x, impulse.y, RIPPLE.pressRadiusPx, RIPPLE.cssPressAmp * strength);
      }
    } else {
      sim.addDrop(impulse.x, impulse.y, RIPPLE.dropRadiusPx, RIPPLE.dropAmp * strength);
    }
  }

  // The cursor is water only on glass, and only with a real pointer (taps arrive as presses).
  const pointer = motion.pointer;
  if (!glassOn || !pointer.inside || pointer.type === "touch" || pointer.surface < 0) {
    sim.clearBrush();
    return;
  }
  const speed = Math.hypot(pointer.vx, pointer.vy);
  if (!onScreen(pointer.x) || !onScreen(pointer.y) || !Number.isFinite(speed)) {
    sim.clearBrush();
    return;
  }
  const waveAmp = Math.min(speed / RIPPLE.brushFullSpeed, 1) * RIPPLE.brushAmp * BRUSH_STEP_SHARE;
  // The trail wipes the frost; a resting cursor lets it re-fog.
  const wipeStrength = RIPPLE.wipeStrength * smoothstep(RIPPLE.wipeSpeedFrom, RIPPLE.wipeSpeedTo, speed);
  sim.setBrush(pointer.x, pointer.y, waveAmp, wipeStrength);
}
