/* ------------------------------------------------------------------ */
/*  What the orb does this frame, from the pose and the page: its two  */
/*  layouts (the pose's cells projected onto the orb's plane, so each  */
/*  body sits on its panel on screen), the panels that hold its bodies */
/*  in, the pills' droplets it dissolves into, the hovered panel's     */
/*  swell, the Services practice photos, the practice page's emphasis  */
/*  and the scroll's inertial slosh. Runs in the rig after the camera moved, */
/*  so projections use this frame's camera. Springs step on the scene  */
/*  clock (input.dt) and jump to their targets when the rig snaps.     */
/* ------------------------------------------------------------------ */

import * as THREE from "three";
import { SERVICE_SLUGS } from "../../data/site-data";
import { motion } from "../../motion/store";
import {
  clamp,
  createSpring,
  omegaForSettle,
  smoothstep,
  stepSpring,
  type Spring,
} from "../../aquaism/core/math";
import {
  GROUP_COUNT,
  MAX_CLUSTERS,
  MAX_DROPLETS,
  dominantLayout,
  type OrbControls,
  type OrbLayout,
} from "../../aquaism/core/orb-controls";
import {
  CELL_TARGET_LIMIT,
  SATELLITE_BRIDGE_DISTANCE,
  SATELLITE_COLUMN,
  clampToField,
  satelliteOffset,
  splitRadius,
} from "../../aquaism/core/orb-field";
import { clientToPlaneZ, pixelsPerUnitAt, worldToClient, type ScreenBox, type ScreenPoint } from "../../aquaism/core/projection";
import type { CellSet } from "./choreography";
import type { TechPills } from "./tech-pills";

/* -- Hover: the body of the panel under the pointer swells and brightens -- */
const HOVER_SETTLE = 0.3;
const HOVER_SWELL = 0.25;
const HOVER_BRIGHTEN = 0.4;
/** The other bodies ease back a little while one is hovered. */
const HOVER_EASE_BACK = 0.08;
const HOVER_DIM = 0.1;

/* -- Practice pages: the current practice is the big body ------------- */
const PRACTICE_SETTLE = 0.9;
const PRACTICE_MAIN_SWELL = 0.3;
/**
 * Satellites at strength 0.85 span enough marching-cubes cells (iso radius ~5 cells at 72) for
 * a smooth surface; at 0.65 they faceted. They read smaller than the main body because they float
 * behind it (orb-field SATELLITE_DEPTH), not because the grid has to draw them small.
 */
const PRACTICE_SATELLITE_SHRINK = 0.15;
/**
 * Each satellite drifts slowly in toward the main body and back out, on its own period (s): at the
 * closest they are SATELLITE_BRIDGE_DISTANCE apart, where a soft liquid bridge forms for a few
 * seconds and lets go again, so the three read as bodies of one liquid. Never closer than this
 * share of the rest offset (an orb far off-centre rests its outer satellite further away).
 * Scene clock: still while paused, and none with reduced motion.
 */
const SATELLITE_DRIFT_PERIODS: readonly [number, number] = [14, 19];
const SATELLITE_DRIFT_MIN = 0.65;
/**
 * The satellites change sides only once the orb is this far across the screen's centre line (a
 * share of the viewport height): a centred orb (phones, the call to action) sits within a pixel
 * of it, and the camera's breathing and parallax (under 1% of the height) would swing both
 * satellites across every few seconds.
 */
const SATELLITE_SIDE_DEAD_ZONE = 0.03;

/* -- Scroll slosh: the liquid lags the page -------------------------- */
/**
 * Inertial acceleration = scroll acceleration converted to world units at the orb's depth,
 * times this gain. A wheel flick (~1e4 px/s^2) then lurches the orb ~0.4 units (about 45 px at
 * the hero's depth, scratch orb-sim) and the springs pull it back. Clamped in physics units,
 * where the field's walls are: a small pose scale (the grid cap on a large screen) turns the
 * same lurch on screen into a larger one inside the field, and a hard flick must not throw the
 * bodies against its walls (45 settles ~1.5 units out against the bodies' springs).
 */
const SCROLL_INERTIA_GAIN = 0.35;
const SCROLL_INERTIA_MAX = 45;

/* -- The pills' droplets (v3.1) ---------------------------------------- */
/**
 * The hand-over runs over the second part of the move into the pills' pose (the pose's droplets
 * share from this to 1): the bodies have mostly reached the row when the droplets leave them, and
 * leaving, the droplets are back in the body over the first part of the move out.
 */
const HANDOVER_FROM = 0.45;
/** Meanwhile the metaballs dissolve: their strength fades over this part of the hand-over. */
const DISSOLVE_FROM = 0.15;
const DISSOLVE_TO = 0.85;

export interface OrbDirector {
  /** Per cluster of the layout the bodies are in: the hover swell. */
  hover: Spring[];
  practice: Spring;
  /** Group of the last practice page, kept while its emphasis eases out after leaving it. */
  lastPractice: number;
  /** Scene seconds of the satellites' drift. */
  drift: number;
  /** The satellites' side of the main body: 1 right, -1 left (x of their offsets). */
  side: number;
}

export function createOrbDirector(): OrbDirector {
  return {
    hover: Array.from({ length: MAX_CLUSTERS }, () => createSpring(0)),
    practice: createSpring(0),
    lastPractice: -1,
    drift: 0,
    side: 1,
  };
}

export interface DirectionInput {
  camera: THREE.Camera;
  /** The pose's camera and its target, without pointer parallax or breathing: the satellites' line of sight. */
  eye: THREE.Vector3;
  look: THREE.Vector3;
  box: ScreenBox;
  /** Scene seconds this frame (0 while paused). */
  dt: number;
  /** The target pose's cells, the next pose's and how far between (choreography's Pose). */
  cells: CellSet;
  next: CellSet;
  cellMix: number;
  /** How much of the pose is the Services split (the practice photos). */
  practices: number;
  /**
   * How much of the pose keeps a practice page's satellites (its hero: the practice's body with
   * the other two beside the title). Its cells (features, technologies, call to action) have none.
   */
  satellites: number;
  /** The blended pose's satellite arrangement: 0 column, 1 row. */
  satelliteRow: number;
  /** -1 while the rig runs a move back over one the other way (OrbControls.sweep), else 1. */
  sweep: number;
  /** The layout holds (no move between sections under way, no drag orbit): panels may hold their bodies in. */
  holding: boolean;
  /** How much of the pose is the pills' droplets (choreography Pose.droplets), and the pills this frame. */
  droplets: number;
  pills: TechPills;
  reducedMotion: boolean;
  /** The rig jumped instead of moving (reduced motion, first frame, a page change while paused). */
  snap: boolean;
}

const _hit = new THREE.Vector3();
const _screen: ScreenPoint = { x: 0, y: 0, depth: 0 };

function snapSpring(spring: Spring, value: number): number {
  spring.value = value;
  spring.velocity = 0;
  return value;
}

/**
 * Which side of the main body the satellites take (1 right, -1 left) for an orb whose centre is
 * at client x: the outer side, away from the page's copy, but `previous` while the orb is within
 * SATELLITE_SIDE_DEAD_ZONE of the centre line. The poses' copy clearance asks the same question.
 */
export function satelliteSide(x: number, box: ScreenBox, previous: number): number {
  const across = (x - (box.left + box.width / 2)) / Math.max(box.height, 1);
  return across < -SATELLITE_SIDE_DEAD_ZONE ? -1 : across > SATELLITE_SIDE_DEAD_ZONE ? 1 : previous;
}

/**
 * A pose's cells as the orb's layout: each cell's centre on screen cast onto the orb's plane
 * through this frame's camera, as an offset from the centre in physics units. One cell is the
 * merged orb at the centre itself (the pose put the centre where that cell is). Split, a cell may
 * be anywhere on the page (off screen too: its body rides there with it, the view box draws what
 * is in view), so only a merged layout keeps to the compact field.
 */
function toLayout(out: OrbLayout, cells: CellSet, controls: OrbControls, input: DirectionInput): void {
  out.count = clamp(Math.round(cells.count), 1, MAX_CLUSTERS);
  const centre = controls.centre;
  const scale = controls.scale > 0 ? controls.scale : 1;
  const split = controls.field.view.split;
  for (let k = 0; k < MAX_CLUSTERS; k++) {
    const cluster = out.clusters[k];
    if (out.count === 1 || k >= out.count) {
      cluster.set(0, 0, 0);
      continue;
    }
    if (!clientToPlaneZ(_hit, input.camera, input.box, cells.x[k], cells.y[k], centre.z)) continue;
    const x = (_hit.x - centre.x) / scale;
    const y = (_hit.y - centre.y) / scale;
    if (split) cluster.set(clamp(x, -CELL_TARGET_LIMIT, CELL_TARGET_LIMIT), clamp(y, -CELL_TARGET_LIMIT, CELL_TARGET_LIMIT), 0);
    else cluster.set(clampToField(x), clampToField(y), 0);
  }
}

/** The body (cluster) whose panel the pointer is over, in the cells the bodies are in, or -1. */
function hoveredCell(cells: CellSet): number {
  const pointer = motion.pointer;
  if (!pointer.inside || pointer.x < -9000 || cells.count < 2) return -1;
  for (let k = 0; k < cells.count; k++) {
    const o = 4 * k;
    const p = cells.panels;
    if (p[o + 2] <= p[o] || p[o + 3] <= p[o + 1]) continue;
    if (pointer.x >= p[o] && pointer.x <= p[o + 2] && pointer.y >= p[o + 1] && pointer.y <= p[o + 3]) return k;
  }
  return -1;
}

/**
 * The panels that hold the bodies in: while the layout holds a set of panels (not a move between
 * sections, not the hero's orb or a slot's), each body's panel as laid out this frame.
 */
function containIn(controls: OrbControls, input: DirectionInput): void {
  const contain = controls.contain;
  const cells = input.cells;
  contain.active = input.holding && input.cellMix <= 0 && cells.walled && !input.reducedMotion;
  contain.count = clamp(Math.round(cells.count), 1, MAX_CLUSTERS);
  if (contain.active) contain.panels.set(cells.panels);
}

/**
 * The pills' droplets: each one's rest point and room (its pill's bead window), its radius there
 * (tech-pills.ts), its pill's rect, and how far the liquid has gone into them (none without pills:
 * the body must not dissolve into nothing).
 */
function directDroplets(controls: OrbControls, input: DirectionInput): void {
  const pills = input.pills;
  const out = controls.droplets;
  out.count = Math.min(pills.count, MAX_DROPLETS);
  for (let k = 0; k < out.count; k++) {
    out.x[k] = pills.bx[k];
    out.y[k] = pills.by[k];
    out.hw[k] = pills.bw[k];
    out.hh[k] = pills.bh[k];
    out.radius[k] = pills.radius[k];
    out.pill[4 * k] = pills.cx[k] - pills.hw[k];
    out.pill[4 * k + 1] = pills.cy[k] - pills.hh[k];
    out.pill[4 * k + 2] = pills.cx[k] + pills.hw[k];
    out.pill[4 * k + 3] = pills.cy[k] + pills.hh[k];
  }
  out.handover = out.count > 0 ? smoothstep(HANDOVER_FROM, 1, clamp(input.droplets, 0, 1)) : 0;
  controls.dissolve = smoothstep(DISSOLVE_FROM, DISSOLVE_TO, out.handover);
}

function practiceGroupOf(slug: string): number {
  for (let g = 0; g < GROUP_COUNT; g++) if (SERVICE_SLUGS[g] === slug) return g;
  return -1;
}

export function directOrb(director: OrbDirector, controls: OrbControls, input: DirectionInput): void {
  const { dt, reducedMotion, snap } = input;

  // The two layouts the bodies move between, as this frame's camera sees the cells. Held while the
  // clock is stopped (paused: the orb stays put like everything else as the page scrolls), except
  // on a jump, where the orb settles into the new pose at once.
  if (dt > 0 || snap) {
    toLayout(controls.from, input.cells, controls, input);
    if (input.cellMix > 0) toLayout(controls.to, input.next, controls, input);
    else toLayout(controls.to, input.cells, controls, input);
    controls.mix = clamp(input.cellMix, 0, 1);
    controls.sweep = input.sweep < 0 ? -1 : 1;
    controls.practiceMix = clamp(input.practices, 0, 1);
    containIn(controls, input);
    directDroplets(controls, input);
  }

  // Practice page emphasis (kept while easing out, so leaving a practice page re-merges smoothly).
  const practice = practiceGroupOf(motion.story.practice);
  if (practice >= 0) director.lastPractice = practice;
  const practiceTarget = practice >= 0 ? 1 : 0;
  const emphasis = snap
    ? snapSpring(director.practice, practiceTarget)
    : stepSpring(director.practice, practiceTarget, omegaForSettle(PRACTICE_SETTLE), dt);
  controls.practiceGroup = practice >= 0 ? practice : emphasis > 0.002 ? director.lastPractice : -1;
  // Only the practice hero keeps satellites: the page's cells take one body each (v3).
  controls.satellite = controls.practiceGroup >= 0 ? clamp(emphasis * clamp(input.satellites, 0, 1), 0, 1) : 0;
  controls.bodyRadius = splitRadius(dominantLayout(controls).count);
  if (!reducedMotion) director.drift += dt;
  if (controls.practiceGroup >= 0) {
    // Satellites go to the outer side of the main body, away from the page's copy.
    if (worldToClient(_screen, input.camera, input.box, controls.centre)) {
      director.side = satelliteSide(_screen.x, input.box, director.side);
    }
    const side = director.side;
    const arrangement = clamp(input.satelliteRow, 0, 1);
    for (let k = 0; k < SATELLITE_COLUMN.length; k++) {
      const offset = satelliteOffset(controls.satellites[k], k, arrangement, side, input.eye, input.look, controls.centre);
      if (reducedMotion) continue;
      // Inward only, from the rest offset to the bridge and back, so the pose's copy clearance
      // (which counts the satellites at rest) still holds.
      const length = offset.length();
      const closest = length > SATELLITE_BRIDGE_DISTANCE ? Math.max(SATELLITE_BRIDGE_DISTANCE / length, SATELLITE_DRIFT_MIN) : 1;
      const inward = 0.5 - 0.5 * Math.cos((2 * Math.PI * director.drift) / SATELLITE_DRIFT_PERIODS[k]);
      offset.multiplyScalar(1 - (1 - closest) * inward);
    }
  }
  for (let g = 0; g < GROUP_COUNT; g++) {
    let strength = 1;
    if (controls.practiceGroup >= 0) {
      strength = g === controls.practiceGroup
        ? 1 + PRACTICE_MAIN_SWELL * controls.satellite
        : 1 - PRACTICE_SATELLITE_SHRINK * controls.satellite;
    }
    controls.strength[g] = strength;
    controls.brightness[g] = 1;
  }

  // Hover swell: the body inside the panel under the pointer.
  const inCells = dominantLayout(controls) === controls.to && input.cellMix > 0 ? input.next : input.cells;
  const hovered = reducedMotion ? -1 : hoveredCell(inCells);
  let peak = 0;
  for (let k = 0; k < MAX_CLUSTERS; k++) {
    const target = k === hovered ? 1 : 0;
    const h = snap
      ? snapSpring(director.hover[k], target)
      : stepSpring(director.hover[k], target, omegaForSettle(HOVER_SETTLE), dt);
    peak = Math.max(peak, h);
  }
  for (let k = 0; k < MAX_CLUSTERS; k++) {
    const h = director.hover[k].value;
    const others = Math.max(peak - h, 0);
    controls.swell[k] = 1 + HOVER_SWELL * h - HOVER_EASE_BACK * others;
    controls.glow[k] = 1 + HOVER_BRIGHTEN * h - HOVER_DIM * others;
  }

  // Scroll slosh: the view accelerating down the page leaves the liquid behind, so it lurches up.
  if (reducedMotion || !(dt > 0) || !worldToClient(_screen, input.camera, input.box, controls.centre)) {
    controls.inertia.set(0, 0, 0);
  } else {
    const unitPx = pixelsPerUnitAt(input.camera, input.box, _screen.depth);
    const scale = controls.scale > 0 ? controls.scale : 1;
    const scroll = Number.isFinite(motion.scroll.acceleration) ? motion.scroll.acceleration : 0;
    const acceleration = unitPx > 0 ? (scroll / unitPx) * SCROLL_INERTIA_GAIN : 0;
    controls.inertia.set(0, clamp(acceleration / scale, -SCROLL_INERTIA_MAX, SCROLL_INERTIA_MAX), 0);
  }

  controls.pointerEnabled = !reducedMotion;
}
