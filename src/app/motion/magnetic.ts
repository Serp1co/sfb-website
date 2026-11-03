/*
 * [data-magnetic] elements lean toward a nearby cursor. The pull is written to the element's CSS
 * `translate` (so GSAP and CSS keep `transform`) and to the glass registry in the same tick, so the
 * WebGL lens of a magnetic glass button moves with its label. Reveals never tween these elements'
 * transforms (they animate opacity or children), so the two never fight over the same property.
 * Off with reduced motion and on touch-first devices.
 */

import { getMagneticTargets, setOffset } from "../glass/registry";
import { hasSize, type LayoutBox } from "../glass/layout-box";
import { createSpring, stepDampedSpring, type Spring } from "./springs";
import { motion } from "./store";

/** The pull starts this far outside the element's rect. */
const REACH_PX = 48;
/** Fraction of the pointer's distance from the centre the element follows... */
const FOLLOW = 0.22;
/** ...up to this far (a nudge, never a chase). */
const MAX_PULL_PX = 10;
/** Spring constants: about 3% overshoot over a 10 px move, so it settles without a visible bounce. */
const STIFFNESS = 220;
const DAMPING = 22;
/** Below this the element is treated as at rest and its inline translate is removed. */
const REST_EPSILON_PX = 0.01;

interface Magnet {
  readonly element: HTMLElement;
  /** The registry's layout box for the element (replaced on every rescan, see rebuildMagnetic). */
  box: LayoutBox;
  readonly x: Spring;
  readonly y: Spring;
  /** An inline translate is currently set. */
  written: boolean;
}

const magnets = new WeakMap<HTMLElement, Magnet>();
let active: Magnet[] = [];
let enabled = false;

function clear(magnet: Magnet): void {
  magnet.x.value = magnet.x.velocity = 0;
  magnet.y.value = magnet.y.velocity = 0;
  if (magnet.written) {
    magnet.element.style.translate = "";
    magnet.written = false;
  }
  setOffset(magnet.element, 0, 0);
}

/** After a registry scan: follow the current [data-magnetic] elements. */
export function rebuildMagnetic(): void {
  const next: Magnet[] = [];
  for (const target of getMagneticTargets()) {
    let magnet = magnets.get(target.element);
    if (!magnet) {
      magnet = { element: target.element, box: target.box, x: createSpring(), y: createSpring(), written: false };
      magnets.set(target.element, magnet);
    }
    magnet.box = target.box;
    next.push(magnet);
  }
  for (const magnet of active) if (!next.includes(magnet)) clear(magnet);
  active = next;
}

export function startMagnetic(): void {
  const { reducedMotion, coarsePointer } = motion.capabilities;
  enabled = !reducedMotion && !coarsePointer;
  rebuildMagnetic();
}

export function stopMagnetic(): void {
  enabled = false;
  for (const magnet of active) clear(magnet);
  active = [];
}

/** Per tick, before the registry packs the glass. No DOM reads: rects come from layout boxes. */
export function updateMagnetic(): void {
  if (!enabled) return;
  const dt = motion.time.delta;
  if (dt <= 0) return;
  const pointer = motion.pointer;
  const pointerLive = pointer.inside && pointer.type !== "touch";
  const scrollY = motion.scroll.y;

  for (const magnet of active) {
    const box = magnet.box;
    let targetX = 0;
    let targetY = 0;
    if (pointerLive && hasSize(box)) {
      // The LAYOUT rect (without the pull itself), so the element never chases its own offset.
      const left = box.x;
      const top = box.fixed ? box.y : box.y - scrollY;
      if (
        pointer.x >= left - REACH_PX &&
        pointer.x <= left + box.width + REACH_PX &&
        pointer.y >= top - REACH_PX &&
        pointer.y <= top + box.height + REACH_PX
      ) {
        targetX = (pointer.x - (left + box.width / 2)) * FOLLOW;
        targetY = (pointer.y - (top + box.height / 2)) * FOLLOW;
        const length = Math.hypot(targetX, targetY);
        if (length > MAX_PULL_PX) {
          targetX *= MAX_PULL_PX / length;
          targetY *= MAX_PULL_PX / length;
        }
      }
    }
    stepDampedSpring(magnet.x, targetX, STIFFNESS, DAMPING, dt);
    stepDampedSpring(magnet.y, targetY, STIFFNESS, DAMPING, dt);

    const resting =
      targetX === 0 &&
      targetY === 0 &&
      Math.abs(magnet.x.value) < REST_EPSILON_PX &&
      Math.abs(magnet.y.value) < REST_EPSILON_PX &&
      Math.abs(magnet.x.velocity) < REST_EPSILON_PX &&
      Math.abs(magnet.y.velocity) < REST_EPSILON_PX;
    if (resting) {
      if (magnet.written) clear(magnet);
      continue;
    }
    magnet.element.style.translate = `${magnet.x.value.toFixed(2)}px ${magnet.y.value.toFixed(2)}px`;
    magnet.written = true;
    setOffset(magnet.element, magnet.x.value, magnet.y.value);
  }
}
