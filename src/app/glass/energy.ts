/*
 * Panel energy (owner decisions 2026-11-02, "choreography v2", on every page since v3): the orb
 * splits into as many bodies as a section has panels, each body lives inside its panel, and an
 * occupied panel lights up electric blue (focused, its border crackles). Since v3.1 each technology
 * pill holds a small droplet body of its own, which lights that pill. This turns motion.bodies into
 * one eased energy per surface, from how well a body sits in it (see EnergyFit), plus that body's
 * projected centre and radius for the composite's inner glow.
 *
 * Pure maths on numbers the registry hands in, no DOM: the registry owns the surfaces, decides each
 * one's fit, packs the result into glassFrame.energy and writes data-energized when `energized` flips.
 */

import { clamp, createSpring, criticalOmega, finite, stepCriticalSpring, type Spring } from "../motion/springs";
import { MAX_ORB_BODIES, type OrbBody } from "../motion/store";
import type { GlassKind } from "./contract";

/**
 * How a body lights a surface.
 *  - "contain": a cell the body lives in (the About and contact panels, the service and feature
 *    cards, the call-to-action panel): lit by the share of the body's disc inside it, so a body
 *    crossing an edge in transit stays dark.
 *  - "overlap": a technology pill of the practice-tech row (see pillCoverage). Two kinds of body
 *    meet a pill: its own droplet (v3.1: about 0.3 of the pill's height in radius, wholly inside
 *    it, so about a tenth of its area), and the bigger bodies flowing in to become the droplets
 *    (or out of them again), which a pill is too small to hold. Lit by the share of the smaller
 *    shape lying inside the other: fully by the droplet sitting in it, and by how much of the PILL
 *    a bigger body covers.
 */
export type EnergyFit = "contain" | "overlap";

/**
 * The fit each kind can have (the registry also requires the cell's anchor). Bands are full-bleed
 * strips the partners orb only glides past (they are not cells), and buttons are controls a body
 * never sits behind.
 */
export const ENERGY_FIT: Readonly<Partial<Record<GlassKind, EnergyFit>>> = {
  panel: "contain",
  card: "contain",
  pill: "overlap",
};

/** Energy rises over about this long (to 5%), so a body settling into its panel lights it promptly... */
const ENERGY_RISE_S = 0.3;
/** ...and falls about twice as slowly: a body leaving for the next section leaves a short afterglow. */
const ENERGY_FALL_S = 0.6;
const RISE_OMEGA = criticalOmega(ENERGY_RISE_S);
const FALL_OMEGA = criticalOmega(ENERGY_FALL_S);

/** Share of a body's disc inside the surface below which it stays dark: an edge grazed in transit. */
const COVERAGE_DARK = 0.25;
/** Share from which the body counts as wholly inside: its liquid skin may bulge a little past the edge. */
const COVERAGE_FULL = 0.85;
/** A pill this little under the body (the body's rim brushing the pill's end) stays dark... */
const OVERLAP_DARK = 0.15;
/** ...and one this much under it glows fully: the body sits right behind it. */
const OVERLAP_FULL = 0.6;
/**
 * A body measured against a pill counts as at least this share of the pill's height in radius.
 * The pill's own droplet (about 0.3 of it) is bigger and lights the pill fully; a fleck of liquid
 * pinching off in transit is smaller and lights it only by its area: half this radius, a quarter.
 */
const PILL_BODY_FLOOR = 0.2;
/**
 * A body's weight is measured against an even split's share (weight x the number of bodies, 1 when
 * the metaballs are shared out evenly): a body carrying under this much of its share (a droplet
 * pinching off mid-split) lights no cell... (Pills skip this: see stepSurfaceEnergy.)
 */
const WEIGHT_DARK = 0.15;
/**
 * ...and one carrying this much lights fully. Relative, because v3's splits run to 12 bodies of 2-3
 * metaballs each (an absolute floor tuned for v2's thirds left a 9-way split's 3-ball cards at half
 * energy, never energized); for v2's three bodies these are its old 0.05 / 0.15 of the orb.
 */
const WEIGHT_FULL = 0.45;

/** data-energized turns on at this energy and off below ENERGIZED_OFF, so it never flickers near 0.5. */
export const ENERGIZED_ON = 0.6;
export const ENERGIZED_OFF = 0.4;
/** Energy this small is gone: it snaps to 0 and the body it tracked is forgotten (zeros are packed). */
const ENERGY_EPSILON = 1e-3;

/** One surface's energy, kept on its registry record (so it survives a mutation rescan). */
export interface SurfaceEnergy {
  /** value: the eased energy 0..1; velocity: its rate (critically damped, never overshoots far). */
  readonly spring: Spring;
  /** The body inside, client CSS px; held while the glow fades after it left; zeros when dark. */
  x: number;
  y: number;
  radius: number;
  /** The surface element carries data-energized="true" (hysteresis on the eased energy). */
  energized: boolean;
}

export function createSurfaceEnergy(): SurfaceEnergy {
  return { spring: createSpring(), x: 0, y: 0, radius: 0, energized: false };
}

/** Dark at once. The caller removes the attribute (it owns the element). */
export function resetSurfaceEnergy(energy: SurfaceEnergy): void {
  energy.spring.value = 0;
  energy.spring.velocity = 0;
  energy.x = 0;
  energy.y = 0;
  energy.radius = 0;
  energy.energized = false;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Share of a disc's area on the near side of a chord `t` radii from its centre (-1: none, 1: all). */
function discShareBelow(t: number): number {
  if (t <= -1) return 0;
  if (t >= 1) return 1;
  return (Math.PI - Math.acos(t) + t * Math.sqrt(1 - t * t)) / Math.PI;
}

/**
 * Share (0..1) of a disc inside an axis-aligned rect (client CSS px): the product of its shares
 * between the rect's left and right edges and between its top and bottom edges. Exact while one
 * axis clips the disc, within a few percent where a corner does, and the panels' rounded corners
 * are small next to any body. A disc of no size has no area inside anything.
 */
export function discCoverage(
  left: number,
  top: number,
  right: number,
  bottom: number,
  x: number,
  y: number,
  radius: number,
): number {
  if (!(right > left) || !(bottom > top) || !(radius > 0)) return 0;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius)) return 0;
  if (x + radius <= left || x - radius >= right || y + radius <= top || y - radius >= bottom) return 0;
  if (x - radius >= left && x + radius <= right && y - radius >= top && y + radius <= bottom) return 1;
  const across = discShareBelow((right - x) / radius) - discShareBelow((left - x) / radius);
  const down = discShareBelow((bottom - y) / radius) - discShareBelow((top - y) / radius);
  return clamp(across * down, 0, 1);
}

/** Integral of sqrt(r^2 - t^2) from 0 to t (|t| <= r): the area under a quarter circle's arc. */
function areaUnderArc(t: number, r: number): number {
  return (t * Math.sqrt(Math.max(r * r - t * t, 0)) + r * r * Math.asin(clamp(t / r, -1, 1))) / 2;
}

/**
 * Area of the disc of radius r centred on the origin inside the rect spanning the origin to (x, y),
 * signed like x * y (negative across one axis), so that four corner terms give any rect's share.
 */
function cornerArea(x: number, y: number, r: number): number {
  const sign = Math.sign(x) * Math.sign(y);
  if (sign === 0) return 0;
  const ax = Math.min(Math.abs(x), r);
  const ay = Math.min(Math.abs(y), r);
  if (ax * ax + ay * ay <= r * r) return sign * ax * ay;
  // The arc crosses the rect: full height out to where the arc drops below ay, then under the arc.
  const knee = Math.sqrt(Math.max(r * r - ay * ay, 0));
  return sign * (ay * knee + areaUnderArc(ax, r) - areaUnderArc(knee, r));
}

/**
 * Share (0..1) of the smaller of a disc and an axis-aligned rect (client CSS px) lying inside the
 * other: their intersection's exact area over the smaller one's area, the disc counted as at least
 * `floorRadius` in radius (its area in the denominator, never its geometry). 1 while the disc covers
 * the rect, or sits wholly inside it and is at least the floor; 0 apart, and for a degenerate or
 * non-finite shape.
 */
export function overlapShare(
  left: number,
  top: number,
  right: number,
  bottom: number,
  x: number,
  y: number,
  radius: number,
  floorRadius = 0,
): number {
  if (!(right > left) || !(bottom > top) || !(radius > 0)) return 0;
  if (![left, top, right, bottom, x, y, radius, floorRadius].every(Number.isFinite)) return 0;
  if (x + radius <= left || x - radius >= right || y + radius <= top || y - radius >= bottom) return 0;
  const x0 = left - x;
  const x1 = right - x;
  const y0 = top - y;
  const y1 = bottom - y;
  const area =
    cornerArea(x1, y1, radius) - cornerArea(x0, y1, radius) - cornerArea(x1, y0, radius) + cornerArea(x0, y0, radius);
  const counted = Math.max(radius, floorRadius);
  const smaller = Math.min(Math.PI * counted * counted, (right - left) * (bottom - top));
  return smaller > 0 ? clamp(area / smaller, 0, 1) : 0;
}

/**
 * How much a body lights a pill (client CSS px), 0..1: the overlap share, the body counted as at
 * least PILL_BODY_FLOOR of the pill's shorter side (its height). So the pill's own droplet sitting
 * in it gives 1 (although it covers only about a tenth of the pill), a body bigger than the pill
 * gives the share of the PILL it covers, and a fleck gives its area over the floor's.
 */
export function pillCoverage(
  left: number,
  top: number,
  right: number,
  bottom: number,
  x: number,
  y: number,
  radius: number,
): number {
  return overlapShare(left, top, right, bottom, x, y, radius, PILL_BODY_FLOOR * Math.min(right - left, bottom - top));
}

/**
 * Advances one surface's energy by `dt` toward the best-placed body's share in the rect (client
 * CSS px, this tick's geometry), measured by the surface's fit. With no fit (not a cell, not laid
 * out, fixed chrome) the energy only fades. Returns true when `energized` flipped: the registry's
 * cue for its one DOM write.
 */
export function stepSurfaceEnergy(
  energy: SurfaceEnergy,
  fit: EnergyFit | null,
  left: number,
  top: number,
  right: number,
  bottom: number,
  bodies: readonly OrbBody[],
  dt: number,
): boolean {
  let target = 0;
  let best: OrbBody | null = null;
  if (fit) {
    const contain = fit === "contain";
    const dark = contain ? COVERAGE_DARK : OVERLAP_DARK;
    const full = contain ? COVERAGE_FULL : OVERLAP_FULL;
    const count = Math.min(bodies.length, MAX_ORB_BODIES);
    for (let i = 0; i < count; i++) {
      const body = bodies[i];
      const coverage = contain
        ? discCoverage(left, top, right, bottom, body.x, body.y, body.radius)
        : pillCoverage(left, top, right, bottom, body.x, body.y, body.radius);
      if (!(coverage > 0)) continue;
      const weight = finite(body.weight);
      // A pill's droplet is a separate small body whose share of the orb is the world's to choose
      // (the droplets may carry it all, or next to nothing beside a big body): any body with mass
      // lights a pill, and the size floor (pillCoverage), not the weight, keeps a fleck dim.
      const mass = contain ? smoothstep(WEIGHT_DARK, WEIGHT_FULL, weight * count) : weight > 0 ? 1 : 0;
      const share = smoothstep(dark, full, coverage) * mass;
      if (share > target) {
        target = share;
        best = body;
      }
    }
  }
  if (best) {
    energy.x = best.x;
    energy.y = best.y;
    energy.radius = best.radius;
  }

  const spring = energy.spring;
  stepCriticalSpring(spring, target, target > spring.value ? RISE_OMEGA : FALL_OMEGA, dt);
  if (!Number.isFinite(spring.value) || !Number.isFinite(spring.velocity)) {
    spring.value = target;
    spring.velocity = 0;
  }
  if (spring.value >= 1) {
    spring.value = 1;
    spring.velocity = Math.min(spring.velocity, 0);
  } else if (target === 0 && spring.value <= ENERGY_EPSILON) {
    spring.value = 0;
    spring.velocity = 0;
    energy.x = 0;
    energy.y = 0;
    energy.radius = 0;
  } else if (spring.value < 0) {
    spring.value = 0;
    spring.velocity = Math.max(spring.velocity, 0);
  }

  const energized = energy.energized ? spring.value >= ENERGIZED_OFF : spring.value >= ENERGIZED_ON;
  if (energized === energy.energized) return false;
  energy.energized = energized;
  return true;
}
