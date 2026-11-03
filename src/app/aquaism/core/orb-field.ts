/* ------------------------------------------------------------------ */
/*  The orb's field: one mapping from physics space to the marching-   */
/*  cubes box, and the constants every part of the orb agrees on.     */
/*                                                                     */
/*  Physics space: the Rapier world, in world units around the field   */
/*  centre. Render space: the scene. They share the centre C and       */
/*  differ by the orb's pose scale s: render = C + (physics - C) * s.  */
/*  At s = 1 the two coincide, as they did before poses existed.       */
/*                                                                     */
/*  The box is adaptive (owner decision 2026-11-02, the big hero orb): */
/*  its half extent F (physics units) shrinks to what the bodies need  */
/*  while they are compact, so at the same resolution its cells shrink */
/*  and a bigger orb stays facet-free. Every ball's strength scales by */
/*  (FIELD_SCALE / F)^2 and the box mapping by F, so the surface stays */
/*  put in physics space; only the sampling gets finer.                */
/* ------------------------------------------------------------------ */

import * as THREE from "three";
import { clamp, lerp } from "./math";

/** Largest half extent of the field box in physics units (mb.scale at orb scale 1): the split's reach. */
export const FIELD_SCALE = 5;

/**
 * Room the box keeps around the bodies' farthest target (physics units, per axis): today's
 * FIELD_SCALE - TARGET_LIMIT, the iso reach of a cluster at the limit plus the outer cells.
 */
export const FIELD_ROOM = FIELD_SCALE - 3.95;
/**
 * Smallest half extents the box may shrink to, from the measured rebuild cost: each ball's term
 * reaches 2.24 units whatever the box, so a box half the size touches 8x the cells. 2.9 holds the
 * merged orb (iso radius 1.19) with room for a splash and costs ~6.7 ms per rebuild at 72 cells
 * (scratch W/mcbench, after the lazy palette; 1.8 ms at 5), and keeps the hero's cells under
 * MERGED_CELL_PX at ~0.28 of a 900 px viewport. The orb steps the floor up through the rest
 * when a rebuild costs too much of the frame, before it steps the grid's resolution down.
 */
export const FIELD_FLOOR_STEPS: readonly number[] = [2.9, 3.4, 4.2, FIELD_SCALE];
/** The soft wall starts at this share of the box's half extent (4.1 of 5, as before the box adapted). */
export const FIELD_WALL_SHARE = 0.82;

/** Iso level and per-ball strength / falloff, unchanged from the original orb's look. */
export const FIELD_ISOLATION = 1000;
export const BALL_STRENGTH = 0.5;
export const BALL_SUBTRACT = 10;

/**
 * Bound on every body target, per axis, relative to the centre: the box minus the iso radius
 * around a body (field +-5 less ~1.05), so a cluster at the limit still closes inside the box.
 */
export const TARGET_LIMIT = 3.95;

/**
 * Iso radius of the merged orb at scale 1 (scratch orb-sim: 30 bodies settled, iso vertices
 * 1.13 mean / 1.18 max from the centroid). Used to place layout-derived poses.
 */
export const ORB_RADIUS = 1.15;

/** How far the iso surface reaches beyond the outermost body centre (1.18 - 0.72 measured). */
export const ISO_MARGIN = 0.46;

/**
 * The same two measures for one body of the orb split N ways (index N - 1, measured to 12: since
 * v3 a practice page's feature grid splits it 7-9 ways, and no layout splits it further; the pills'
 * droplets of v3.1 are no metaball bodies, and past 12 the last entry holds). At rest, the largest body of the
 * split (ceil(30 / N) metaballs; scratch W/radii.cjs and v3-W/radii-n.cjs, Rapier and these
 * marching cubes): iso radius 1.13 / 0.85 / 0.71 / 0.64 / 0.56 / 0.52 / 0.52 / 0.46 / 0.47 / 0.41 /
 * 0.40 / 0.40 mean from the body's centroid, the max ~0.08-0.15 above it (bodies of three or four
 * metaballs are lumpy), so the radius is taken between them as ORB_RADIUS is; the margin is the max
 * iso radius less the outermost metaball centre.
 */
export const SPLIT_RADIUS: readonly number[] = [ORB_RADIUS, 0.88, 0.75, 0.69, 0.61, 0.56, 0.56, 0.5, 0.51, 0.47, 0.44, 0.44];
export const SPLIT_ISO_MARGIN: readonly number[] = [ISO_MARGIN, 0.38, 0.33, 0.3, 0.28, 0.27, 0.27, 0.26, 0.26, 0.25, 0.25, 0.25];

/** SPLIT_RADIUS for a `count`-way split, clamped to the table. */
export function splitRadius(count: number): number {
  return SPLIT_RADIUS[clamp(Math.round(count), 1, SPLIT_RADIUS.length) - 1];
}

/** SPLIT_ISO_MARGIN for a `count`-way split, clamped to the table. */
export function splitIsoMargin(count: number): number {
  return SPLIT_ISO_MARGIN[clamp(Math.round(count), 1, SPLIT_ISO_MARGIN.length) - 1];
}

/* -- The view box (owner decision 2026-11-02, choreography v3) ---------- */
/*  While the orb is split into cells, the field box covers the camera's  */
/*  visible region at the bodies' depth (where the cells are), not the    */
/*  bodies' spread: the cells' size on screen no longer grows with how    */
/*  far apart the panels are (a phone's stack, a 3 x 3 feature grid).     */
/*  Its cells are cubes of a size on screen the grid affords; the box is  */
/*  a slab, as deep as the bodies need. Bodies beyond it are not drawn:   */
/*  their panels are off screen.                                           */

/**
 * Depth room of the view box around the bodies' plane, beyond their iso radius (physics units,
 * per side): the layouts' dive (0.5), the rest offsets' swirl (0.32) and a splash toward the camera.
 */
export const VIEW_DEPTH_ROOM = 1.05;
/**
 * The view box reaches this many silhouette radii beyond the view on each side (plus two cells):
 * a body whose centre has left the view is drawn whole until it is out of sight.
 */
export const VIEW_MARGIN_RADII = 1.25;
/**
 * A split's small bodies are a few metaballs each, and a ball's term reaches 2.24 units whatever
 * the body, ~5x a nine-way body's radius: most of the rebuild would add values ~1% of the iso level
 * around bodies that never meet. From three-way splits on, each ball's term is cut at this many
 * radii of its body (the term there is < 2.5% of the iso level, never near a surface).
 */
export const SPLIT_REACH_RADII = 2.6;
/** Splits of at least this many bodies cut their balls' reach (two-way bodies are big). */
export const SPLIT_REACH_MIN_COUNT = 3;
/** The view box's grid has at least this many cells per axis (a slab that thin still holds a body's depth). */
export const VIEW_MIN_CELLS = 8;

/** A view box's grid: cells per axis and the side of a cell (the units of the extents it was fitted to). */
export interface ViewGrid {
  nx: number;
  ny: number;
  nz: number;
  cell: number;
}

/**
 * The grid of cubic cells `cell` wide that covers half extents (hx, hy, hz), two cells more per
 * axis (the outer layer is never polygonised), within `budget` cells in all: when the view needs
 * more, the cells grow until it fits (a large screen, or a grid the governor has stepped down).
 * False if even that fails.
 */
export function fitViewGrid(hx: number, hy: number, hz: number, cell: number, budget: number, out: ViewGrid): boolean {
  if (!(cell > 0) || !(budget > 0) || !(hx > 0 && hy > 0 && hz > 0)) return false;
  let size = cell;
  for (let pass = 0; pass < 6; pass++) {
    out.nx = Math.max(Math.ceil((2 * hx) / size) + 2, VIEW_MIN_CELLS);
    out.ny = Math.max(Math.ceil((2 * hy) / size) + 2, VIEW_MIN_CELLS);
    out.nz = Math.max(Math.ceil((2 * hz) / size) + 2, VIEW_MIN_CELLS);
    out.cell = size;
    const cells = out.nx * out.ny * out.nz;
    if (cells <= budget) return true;
    size *= Math.cbrt(cells / budget) * 1.01;
  }
  return false;
}

/**
 * A soft wall keeps flung bodies inside the polygonised grid: past this offset from the centre
 * (per axis, physics units) a stiff spring pushes them back. The grid ends at +4.58 at res 48
 * (+4.72 at 72) and a lone body's iso radius is ~0.22, so a body held under ~4.35 stays whole.
 */
export const FIELD_WALL_START = 4.1;
/** 1/s^2 per unit past the wall: a 10 units/s fling stops within ~0.3 units (v / sqrt(k)). */
export const FIELD_WALL_STIFFNESS = 900;

/**
 * Practice pages: the other two practices float beside the page's practice as satellites, this
 * far behind it along the line of sight (physics units at scale 1): smaller on screen than the
 * main body and with their own parallax, while still big enough in grid cells to stay smooth.
 */
export const SATELLITE_DEPTH = 1.1;
/**
 * Where the satellites sit across the line of sight: offsets along the camera's screen axes,
 * physics units at scale 1, x pointing away from the screen centre (the copy side), y up. With
 * the depth, a satellite near the screen's centre rests 2.4 from the main body, further for an
 * orb far off-centre (the line of sight leans outward there): three separate bodies on screen.
 * Two arrangements, blended by the pose: a column (beside a title) and a row (under a pill row).
 */
export const SATELLITE_COLUMN: readonly (readonly [number, number])[] = [
  [1.0, 1.88],
  [0.74, -2.0],
];
export const SATELLITE_ROW: readonly (readonly [number, number])[] = [
  [2.1, 0.32],
  [-2.11, -0.26],
];
/** A satellite's iso radius (10 bodies at strength 0.85), physics units at scale 1. */
export const SATELLITE_RADIUS = 0.68;
/**
 * Main body and satellite (iso radii ~0.82 and ~0.68 at strengths 1.3 and 0.85) neck once their
 * targets are within ~2.0 of each other (scratch p1/orb-sim.cjs: Rapier and these marching cubes
 * at 72, 56 and 48 cells). This close the neck is a soft bridge, the field between them ~1.0-1.3 x
 * the iso level (the swirl moves each cluster's centre by up to ~0.15, so one approach only
 * touches and the next joins a little deeper): where the satellites' drift brings them.
 */
export const SATELLITE_BRIDGE_DISTANCE = 1.8;

const UP = new THREE.Vector3(0, 1, 0);
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _sight = new THREE.Vector3();

/**
 * Satellite k's rest offset from the centre (physics units at scale 1), seen by a camera at `eye`
 * looking at `look`: its offset along the camera's screen axes in the arrangement `row` (0 column,
 * 1 row; x mirrored by `side`), and SATELLITE_DEPTH further along the line of sight through the
 * centre. Along that line, not along -z: off the screen's centre a -z offset pulls a satellite
 * toward the vanishing point, into the main body's silhouette. Pass the pose's camera (no pointer
 * parallax or breathing), so the satellites keep their own parallax.
 */
export function satelliteOffset(
  out: THREE.Vector3,
  k: number,
  row: number,
  side: number,
  eye: THREE.Vector3,
  look: THREE.Vector3,
  centre: THREE.Vector3,
): THREE.Vector3 {
  _forward.subVectors(look, eye);
  _right.crossVectors(_forward, UP);
  if (_right.lengthSq() > 1e-8) _right.normalize();
  else _right.set(1, 0, 0);
  _up.crossVectors(_right, _forward);
  if (_up.lengthSq() > 1e-8) _up.normalize();
  else _up.copy(UP);
  _sight.subVectors(centre, eye);
  if (_sight.lengthSq() > 1e-8) _sight.normalize();
  else _sight.set(0, 0, -1);
  const column = SATELLITE_COLUMN[k];
  const rowOffset = SATELLITE_ROW[k];
  return out
    .copy(_sight)
    .multiplyScalar(SATELLITE_DEPTH)
    .addScaledVector(_right, lerp(column[0], rowOffset[0], row) * side)
    .addScaledVector(_up, lerp(column[1], rowOffset[1], row));
}

/** World units the transmission ray travels inside the orb: today's thickness 1 x scale 5. */
export const REFRACTION_RAY = 5;

/** Beer's-law distance: 3x the ray, so the pale attenuation colour tints lightly (colour^(1/3)). */
export const ATTENUATION_DISTANCE = 3 * REFRACTION_RAY;

/** Pale blue for the transmission's Beer's-law tint (a "frosted glassy tint into the liquid"): the orb's and its droplets'. */
export const ATTENUATION_COLOUR = 0xcfe8ff;

/** Physics coordinate -> marching-cubes box coordinate (0..1) on one axis, in a box of half extent `half`. */
export function toFieldUV(physics: number, centre: number, half = FIELD_SCALE): number {
  return (physics - centre) / (2 * half) + 0.5;
}

/** Strength multiplier that keeps the surface in place in a box of half extent `half` (the term is s / d_box^2). */
export function fieldStrengthScale(half: number): number {
  const ratio = FIELD_SCALE / half;
  return ratio * ratio;
}

/**
 * Soft wall on one axis in a box of half extent `half`: past FIELD_WALL_SHARE of it a spring
 * pushes a body back, stiffer in a smaller box so a fling stops within the same share of it.
 */
export function wallAcceleration(offset: number, half: number): number {
  const excess = Math.abs(offset) - FIELD_WALL_SHARE * half;
  if (!(excess > 0)) return 0;
  // Never stiffer than at the compact box's smallest floor: the view box's slab is thinner, and a
  // spring stiffer than ~sqrt(k) x step > 2 would overshoot each 1/60 s physics step.
  return -Math.sign(offset) * FIELD_WALL_STIFFNESS * fieldStrengthScale(Math.max(half, FIELD_FLOOR_STEPS[0])) * excess;
}

/** Keeps a target offset (relative to the centre) inside the field on one axis. */
export function clampToField(offset: number): number {
  return clamp(offset, -TARGET_LIMIT, TARGET_LIMIT);
}

/**
 * A split's cells are anywhere on the page (off screen too, carried with it): its targets are
 * bounded only by this (physics units), far beyond any page, so a broken layout never sends a
 * body to infinity.
 */
export const CELL_TARGET_LIMIT = 400;
