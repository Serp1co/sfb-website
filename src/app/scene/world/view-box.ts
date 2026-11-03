/* ------------------------------------------------------------------ */
/*  The view box (orb-field.ts, choreography v3): while the orb is      */
/*  split into cells, its field covers the camera's visible region at   */
/*  the bodies' depth instead of the bodies' spread, so the cells' size */
/*  on screen no longer grows with how far apart the panels are. The    */
/*  rig measures it here every frame, after the camera has moved; the   */
/*  orb turns it into its grid (orb.tsx, fitViewGrid).                  */
/* ------------------------------------------------------------------ */

import * as THREE from "three";
import type { OrbBody } from "../../motion/store";
import type { OrbControls, ViewBox } from "../../aquaism/core/orb-controls";
import {
  SPLIT_REACH_MIN_COUNT,
  SPLIT_REACH_RADII,
  VIEW_DEPTH_ROOM,
  VIEW_MARGIN_RADII,
  splitRadius,
} from "../../aquaism/core/orb-field";
import { clientToPlaneZ, pixelsPerUnitAt, worldToClient, type ScreenBox, type ScreenPoint } from "../../aquaism/core/projection";
import type { Pose } from "./choreography";

const _centre: ScreenPoint = { x: 0, y: 0, depth: 0 };
const _corner = new THREE.Vector3();
/** The view box's region on screen this frame (client px): x0, y0, x1, y1. */
const _region = new Float64Array(4);

/** Grows the client-px region in _region to hold a disc. */
function holdDisc(x: number, y: number, r: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r)) return;
  _region[0] = Math.min(_region[0], x - r);
  _region[1] = Math.min(_region[1], y - r);
  _region[2] = Math.max(_region[2], x + r);
  _region[3] = Math.max(_region[3], y + r);
}

/**
 * The view box for this frame (world units, into `view`): the camera's visible region on the
 * bodies' plane (the orb's centre depth), narrowed to where the bodies will be (both layouts'
 * cells) and are (the first `count` of `bodies`: the orb's own, drawn last frame; the pills'
 * droplets after them are no part of the field), each with VIEW_MARGIN_RADII of its radius around
 * it; as deep as the bodies need; its cells `cellPx` on screen at that depth. Split counts as soon
 * as either layout in play has two or more cells. Keeps the last box when the plane is not in view.
 */
export function measureViewBox(
  view: ViewBox,
  orb: OrbControls,
  camera: THREE.Camera,
  box: ScreenBox,
  target: Pose,
  cellPx: number,
  bodies: readonly OrbBody[],
  count: number,
): void {
  const cells = target.cells;
  const next = target.cellMix > 0 ? target.next : target.cells;
  const most = Math.max(cells.count, next.count);
  const least = Math.min(cells.count, next.count);
  view.split = most >= 2;
  // The biggest bodies in play decide whether their reach may be cut (orb-field.ts).
  view.reach = least >= SPLIT_REACH_MIN_COUNT ? SPLIT_REACH_RADII * splitRadius(least) : 0;
  if (!worldToClient(_centre, camera, box, orb.centre)) return;
  const unitPx = pixelsPerUnitAt(camera, box, _centre.depth);
  if (!(unitPx > 0)) return;

  const radius = Math.max(cells.radius, next.radius, 1);
  const reach = VIEW_MARGIN_RADII * radius;
  _region[0] = _region[1] = Infinity;
  _region[2] = _region[3] = -Infinity;
  for (let k = 0; k < cells.count; k++) holdDisc(cells.x[k], cells.y[k], reach);
  for (let k = 0; k < next.count; k++) holdDisc(next.x[k], next.y[k], reach);
  for (let k = 0; k < Math.min(count, bodies.length); k++) holdDisc(bodies[k].x, bodies[k].y, VIEW_MARGIN_RADII * bodies[k].radius);
  // Within the view, grown by the same margin (and two cells: the grid's outer layer is not drawn).
  const margin = reach + 2 * cellPx;
  const left = box.left - margin;
  const top = box.top - margin;
  const right = box.left + box.width + margin;
  const bottom = box.top + box.height + margin;
  let x0 = Math.max(_region[0], left);
  let y0 = Math.max(_region[1], top);
  let x1 = Math.min(_region[2], right);
  let y1 = Math.min(_region[3], bottom);
  if (!(x1 > x0 && y1 > y0)) {
    // Nothing in view: a small box at the view's centre (no body is drawn, nothing is wasted).
    x0 = x1 = box.left + box.width / 2;
    y0 = y1 = box.top + box.height / 2;
    x0 -= margin;
    x1 += margin;
    y0 -= margin;
    y1 += margin;
  }

  // The region's corners on the plane (the camera is near frontal: their bounding box).
  let wx0 = Infinity;
  let wy0 = Infinity;
  let wx1 = -Infinity;
  let wy1 = -Infinity;
  const z = orb.centre.z;
  for (let k = 0; k < 4; k++) {
    const cx = k & 1 ? x1 : x0;
    const cy = k & 2 ? y1 : y0;
    if (!clientToPlaneZ(_corner, camera, box, cx, cy, z)) return;
    wx0 = Math.min(wx0, _corner.x);
    wy0 = Math.min(wy0, _corner.y);
    wx1 = Math.max(wx1, _corner.x);
    wy1 = Math.max(wy1, _corner.y);
  }
  view.centre.set((wx0 + wx1) / 2, (wy0 + wy1) / 2, z);
  view.half.set((wx1 - wx0) / 2, (wy1 - wy0) / 2, (splitRadius(least) + VIEW_DEPTH_ROOM) * Math.max(orb.scale, 0.05));
  view.cell = cellPx / unitPx;
}
