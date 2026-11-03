/* ------------------------------------------------------------------ */
/*  Where the partner traces run, on screen (client CSS px): from an   */
/*  orb (in slot A, in slot B, or where it is on a page without the    */
/*  slots) to every logo cell ([data-anchor="logo"]).                  */
/*  Pure layout over this frame's anchor rects; partner-nodes.tsx      */
/*  chamfers the routes, projects them onto the node plane and draws.  */
/*                                                                     */
/*  Every trace starts in a junction at the orb's rest point (the      */
/*  slot's centre, junctions.md): a point, not a block (logo-v3-2.md), */
/*  drawn behind the orb, so pushing or splashing the orb aside never  */
/*  leaves a hole in the circuit. The traces fan out of the point to   */
/*  their own heights at the fan's side and turn toward their nodes,   */
/*  the outermost node's leaving furthest from the nodes, so no two    */
/*  traces cross; a node right above or below the junction is wired   */
/*  straight down or up from the fan. Bare text between the orb and the */
/*  nodes (the Partners heading, below slot A) is routed around, never */
/*  behind: the traces run out beyond its side, down lanes beside it,  */
/*  then along buses in the open gap under it to their nodes' columns. */
/*  From slot B they fan up from the orb's flanks into the bands.      */
/*                                                                     */
/*  Both routings are laid out every frame, from slot A and from slot  */
/*  B, so partner-nodes.tsx can morph each trace from one to the other */
/*  as the orb glides (morphRoute): corner by corner role, the detour  */
/*  round the heading folding onto its node's column first, so the     */
/*  lines bend and slide, never fold or fade (owner decision and       */
/*  report 2026-11-02: the morph by sample index tied them in knots).  */
/* ------------------------------------------------------------------ */

import { ANCHORS, anchorRects, type AnchorRect } from "../../glass/contract";
import { clamp, lerp, smoothstep } from "../../aquaism/core/math";

/** Most logo cells wired at once (the site has 9). */
export const MAX_TRACES = 16;
/** Corners of a route before its chamfers (the junction, out, a lane's two ends, a bus's far end, the node), and after. */
export const MAX_CORNERS = 6;
export const MAX_POINTS = 2 * MAX_CORNERS - 2;
/** 45-degree chamfers this long on each leg (shorter where a leg is short). */
const CHAMFER_PX = 10;

/* -- Leaving the orb's junction ------------------------------------------------------------ */
/**
 * The fan round a junction: the traces that meet a body converge into its junction point over this
 * share of the body's resting radius (from its own lane, or its own exit height, to the point), so
 * the whole fan stays under the body at rest, which refracts it. Shared by every circuit that meets
 * a body: the partner traces, the service links and the cell links.
 */
export const FAN_SHARE = 0.42;
/**
 * Exit heights, as shares of the fan's reach from the centre toward the nodes: the outermost trace
 * of a side leaves at the first (past the centre, away from the nodes), the innermost at the second
 * (toward them). Each trace runs from the junction point straight to its exit at the fan's side.
 */
const EXIT_FAR = -0.55;
const EXIT_NEAR = 0.75;
/** A node within this share of the fan's reach of its centre line is wired straight down or up from the fan's top or bottom. */
const PIN_SHARE = 0.8;

/* -- Around bare text ---------------------------------------------------------------------- */
/** The innermost lane runs this far outside the text's side: clear of the guard's feather and most of its scrim. */
const LANE_GAP_PX = 48;
const LANE_PITCH_PX = 10;
/** Buses run in the open gap between the text and the band: this far from the text (its guard), this far from the band. */
const BUS_COPY_GAP_PX = 24;
const BUS_BAND_GAP_PX = 8;
const BUS_PITCH_PX = 10;
/** A trace's width plus a hair: buses squeezed into a narrow gap never merge. */
const MIN_BUS_PITCH_PX = 6;
/** Without the band's own rect: its label and padding above the first logo row, its padding below the last (sections.css). */
const BAND_HEAD_PX = 78;
const BAND_FOOT_PX = 33;

interface Wire {
  /** Index of the logo cell in DOM order (motion.pointer.anchor.index). */
  index: number;
  /** The cell's centre and vertical extent on screen. */
  x: number;
  y: number;
  top: number;
  bottom: number;
  /** -1 left of the orb's centre, 1 right of it. */
  side: number;
  /** 1 below the orb (the trace runs down to it), -1 above. */
  dir: number;
  /** Horizontal distance from the orb's centre. */
  reach: number;
}

/** Receives each route: the logo cell's index (DOM order), its node's centre, and its corners. */
export interface RouteSink {
  trace(index: number, corners: Float64Array, count: number): void;
  node(index: number, x: number, y: number): void;
}

const _wires: Wire[] = Array.from({ length: MAX_TRACES }, () => ({ index: 0, x: 0, y: 0, top: 0, bottom: 0, side: 1, dir: 1, reach: 0 }));
/** Indices into _wires of the group being routed, outermost first. */
const _group: number[] = new Array<number>(MAX_TRACES).fill(0);
/** One route's corners as x, y pairs. */
const _corners = new Float64Array(2 * MAX_CORNERS);
const _obstacle = { x0: 0, y0: 0, x1: 0, y1: 0 };
const _zone = { low: 0, high: 0 };

function laidOut(rects: AnchorRect[] | undefined): AnchorRect | null {
  if (!rects) return null;
  for (const rect of rects) if (rect.width > 0 && rect.height > 0) return rect;
  return null;
}

function setCorner(k: number, x: number, y: number): void {
  _corners[2 * k] = x;
  _corners[2 * k + 1] = y;
}

/**
 * Cuts each inner corner of `corners` (count corners, x, y pairs) by CHAMFER_PX into `out`, so a
 * right angle becomes two half-corners and a 45-degree leg. Returns the point count.
 */
export function chamferRoute(corners: Float64Array, count: number, out: Float64Array): number {
  out[0] = corners[0];
  out[1] = corners[1];
  let n = 1;
  for (let k = 1; k < count - 1; k++) {
    const px = corners[2 * k - 2];
    const py = corners[2 * k - 1];
    const cx = corners[2 * k];
    const cy = corners[2 * k + 1];
    const nx = corners[2 * k + 2];
    const ny = corners[2 * k + 3];
    const before = Math.hypot(cx - px, cy - py);
    const after = Math.hypot(nx - cx, ny - cy);
    const c = Math.min(CHAMFER_PX, before / 2, after / 2);
    if (!(c > 0.01)) {
      out[2 * n] = cx;
      out[2 * n + 1] = cy;
      n++;
      continue;
    }
    out[2 * n] = cx - ((cx - px) / before) * c;
    out[2 * n + 1] = cy - ((cy - py) / before) * c;
    out[2 * n + 2] = cx + ((nx - cx) / after) * c;
    out[2 * n + 3] = cy + ((ny - cy) / after) * c;
    n += 2;
  }
  out[2 * n] = corners[2 * count - 2];
  out[2 * n + 1] = corners[2 * count - 1];
  return n + 1;
}

/**
 * The bare-text block between the orb and the nodes it runs to in direction `dir` (the Partners
 * heading below slot A), into _obstacle: the copy rect nearest the orb that lies wholly between
 * the orb's centre and those nodes' cells and overlaps their span or the orb. False if none.
 */
function findObstacle(cx: number, cy: number, r: number, dir: number, count: number): boolean {
  // Where those nodes' cells begin (the edge nearest the orb), and the span to keep clear.
  let nodes = dir > 0 ? Infinity : -Infinity;
  let left = cx - r;
  let right = cx + r;
  let any = false;
  for (let i = 0; i < count; i++) {
    const w = _wires[i];
    if (w.dir !== dir) continue;
    nodes = dir > 0 ? Math.min(nodes, w.top) : Math.max(nodes, w.bottom);
    left = Math.min(left, w.x);
    right = Math.max(right, w.x);
    any = true;
  }
  if (!any) return false;
  let best = Infinity;
  for (const rect of anchorRects.get(ANCHORS.copy) ?? []) {
    if (!(rect.width > 0 && rect.height > 0)) continue;
    const y0 = rect.y;
    const y1 = rect.y + rect.height;
    if (rect.x >= right || rect.x + rect.width <= left) continue;
    // Past the orb's centre along `dir`, and ended before the nodes begin.
    const from = dir > 0 ? y0 - cy : cy - y1;
    const until = dir > 0 ? nodes - y1 : y0 - nodes;
    if (!(from >= 0) || !(until >= 0) || from >= best) continue;
    best = from;
    _obstacle.x0 = rect.x;
    _obstacle.x1 = rect.x + rect.width;
    _obstacle.y0 = y0;
    _obstacle.y1 = y1;
  }
  return best < Infinity;
}

/**
 * The open gap the buses run in, between the obstacle and the band its nodes sit in, into _zone
 * (low then high y). The band's edge is the partners band's own rect when it lies in that gap,
 * else estimated from the logo rows (BAND_HEAD_PX, BAND_FOOT_PX).
 */
function busZone(dir: number, count: number): void {
  let edge = dir > 0 ? Infinity : -Infinity;
  for (let i = 0; i < count; i++) {
    const w = _wires[i];
    if (w.dir !== dir) continue;
    edge = dir > 0 ? Math.min(edge, w.top - BAND_HEAD_PX) : Math.max(edge, w.bottom + BAND_FOOT_PX);
  }
  const band = laidOut(anchorRects.get(ANCHORS.partnersBand));
  if (band && dir > 0 && band.y > _obstacle.y1 && band.y < edge + BAND_HEAD_PX) edge = band.y;
  if (dir > 0) {
    _zone.low = _obstacle.y1 + BUS_COPY_GAP_PX;
    _zone.high = Math.max(edge - BUS_BAND_GAP_PX, _zone.low);
  } else {
    _zone.high = _obstacle.y0 - BUS_COPY_GAP_PX;
    _zone.low = Math.min(edge + BUS_BAND_GAP_PX, _zone.high);
  }
}

/** Collects the wires going `dir` on `side` into _group, outermost first. Returns the count. */
function collectGroup(dir: number, side: number, count: number): number {
  let n = 0;
  for (let i = 0; i < count; i++) {
    const w = _wires[i];
    if (w.dir !== dir || w.side !== side) continue;
    // Insertion by reach, descending: at most MAX_TRACES entries.
    let j = n++;
    while (j > 0 && _wires[_group[j - 1]].reach < w.reach) {
      _group[j] = _group[j - 1];
      j--;
    }
    _group[j] = i;
  }
  return n;
}

/**
 * Routes one group (one side of the orb, one direction) of `n` wires in _group, outermost first.
 * Exits step from far to near, so an outer trace always runs beyond an inner one. With an obstacle,
 * nodes whose columns clear its side go straight past it; the rest take lanes beside it, the
 * outermost the outer lane and the bus furthest from the text, so lanes and buses nest.
 */
function routeGroup(sink: RouteSink, n: number, cx: number, cy: number, r: number, dir: number, side: number, obstacle: boolean): void {
  if (n === 0) return;
  // The fan out of the junction point at (cx, cy): every trace starts there.
  const fan = FAN_SHARE * r;
  // Obstacle: the nodes that need a lane, counted from the innermost: a node is inside while its
  // column is not yet clear of the lane it would get (each lane one pitch further out), so every
  // inside node's bus runs inward from its lane and every other column is clear of all the lanes.
  const edge = side < 0 ? _obstacle.x0 : _obstacle.x1;
  let inside = 0;
  if (obstacle) {
    for (let k = n - 1; k >= 0; k--) {
      const w = _wires[_group[k]];
      if (side * (w.x - edge) >= LANE_GAP_PX + inside * LANE_PITCH_PX) break;
      inside++;
    }
  }
  // Pins: nodes over the junction's own column, wired straight down or up to them (never through text).
  let pins = 0;
  if (!obstacle) {
    for (let k = n - 1; k >= 0 && _wires[_group[k]].reach < PIN_SHARE * fan; k--) pins++;
  }
  const runs = n - pins;
  // A narrow gap squeezes the buses, never onto one line.
  const busPitch = inside > 1 ? Math.max(MIN_BUS_PITCH_PX, Math.min(BUS_PITCH_PX, (_zone.high - _zone.low) / (inside - 1))) : 0;
  const outside = n - inside;

  for (let k = 0; k < n; k++) {
    const w = _wires[_group[k]];
    // Every trace starts in the junction point.
    setCorner(0, cx, cy);
    if (k >= runs) {
      // A pin: from the point to the fan's top or bottom in the node's column, then straight to it.
      setCorner(1, w.x, cy + dir * fan);
      setCorner(2, w.x, w.y);
      sink.trace(w.index, _corners, 3);
      continue;
    }
    const share = runs > 1 ? lerp(EXIT_FAR, EXIT_NEAR, k / (runs - 1)) : EXIT_NEAR;
    let exit = cy + dir * fan * share;
    // Never into the text: the exits stay in the open gap before it (an orb gliding up close).
    if (obstacle) exit = dir > 0 ? Math.min(exit, _obstacle.y0 - BUS_COPY_GAP_PX) : Math.max(exit, _obstacle.y1 + BUS_COPY_GAP_PX);
    // From the point to its exit at the fan's side (a node within the fan's span: in its column).
    const startX = cx + side * Math.min(fan, w.reach);
    if (!obstacle || k < outside) {
      // Out at its height, then straight to its node (past the obstacle's side, if any).
      setCorner(1, startX, exit);
      setCorner(2, w.x, exit);
      setCorner(3, w.x, w.y);
      sink.trace(w.index, _corners, 4);
      continue;
    }
    // Around the obstacle: out to its lane, along it past the text, along its bus, to the node.
    const j = k - outside;
    const lane = edge + side * (LANE_GAP_PX + (inside - 1 - j) * LANE_PITCH_PX);
    const bus = dir > 0 ? _zone.high - j * busPitch : _zone.low + j * busPitch;
    setCorner(1, startX, exit);
    setCorner(2, lane, exit);
    setCorner(3, lane, bus);
    setCorner(4, w.x, bus);
    setCorner(5, w.x, w.y);
    sink.trace(w.index, _corners, 6);
  }
}

/**
 * Routes a trace from the junction of an orb resting at (cx, cy), `r` px in silhouette radius (the
 * fan's reach is FAN_SHARE of it), to every laid-out logo cell this frame, then reports every node.
 * Returns how many cells are wired.
 */
export function routeTraces(cx: number, cy: number, r: number, sink: RouteSink): number {
  const cells = anchorRects.get(ANCHORS.logo);
  if (!cells) return 0;
  let count = 0;
  for (let i = 0; i < cells.length && count < MAX_TRACES; i++) {
    const cell = cells[i];
    if (!(cell.width > 0 && cell.height > 0)) continue;
    const w = _wires[count++];
    w.index = i;
    w.x = cell.x + cell.width / 2;
    w.y = cell.y + cell.height / 2;
    w.top = cell.y;
    w.bottom = cell.y + cell.height;
    w.side = w.x < cx ? -1 : 1;
    w.dir = w.y >= cy ? 1 : -1;
    w.reach = Math.abs(w.x - cx);
  }
  for (let d = 0; d < 2; d++) {
    const dir = d === 0 ? 1 : -1;
    const obstacle = findObstacle(cx, cy, r, dir, count);
    if (obstacle) busZone(dir, count);
    routeGroup(sink, collectGroup(dir, -1, count), cx, cy, r, dir, -1, obstacle);
    routeGroup(sink, collectGroup(dir, 1, count), cx, cy, r, dir, 1, obstacle);
  }
  for (let i = 0; i < count; i++) sink.node(_wires[i].index, _wires[i].x, _wires[i].y);
  return count;
}

/* -- Morphing a trace from one routing to the other ---------------------------------------- */
/*
 * Every route plays six corner roles with fixed leg directions: the junction, the exit at the fan's
 * side, the lane's top and bottom, the bus's end in the node's column, the node (fan, across, down,
 * across, down). routeGroup lays out three shapes, and the shorter ones collapse onto those roles:
 * a run [junction, exit, turn, node] keeps its turn as the lane and the bus, a pin [junction, turn,
 * node] its turn as the exit too. Corner k of one routing then morphs into corner k of the other.
 */

/**
 * A detour (a lane beside the heading) slides its lane onto its node's column over the first part
 * of the morph, in this share of the morph the exit, travelling with the junction, takes to reach
 * the detour's bus (so the lane is on the column before the exit passes the bus: otherwise the trace
 * loops through its own node leg), and within these bounds of the morph...
 */
const DETOUR_LEAD = 0.8;
const DETOUR_MIN = 0.05;
const DETOUR_MAX = 0.25;
/** ...then its bus rides onto the exit over this much more of it, on the node's column, where the move is invisible. */
const BUS_HANDOVER = 0.02;
/**
 * Corners this close (CSS px) are one, and a corner this close to the line between its neighbours
 * lies on it: well under the trace's width, so a centre-column pin whose exit is clamped onto the
 * junction (half a px off its column) runs straight from the point, with no hook.
 */
const MERGE_PX = 1;

/** The corner (of `count`: 3, 4 or 6) that plays role k (0 junction ... 5 node). */
function roleCorner(count: number, k: number): number {
  if (count === MAX_CORNERS) return k;
  if (count === 4) return k <= 1 ? k : k === 5 ? 3 : 2;
  return k === 0 ? 0 : k === 5 ? 2 : 1;
}

/** The share of the morph over which `route`'s detour (if it is one) leaves the heading, toward `other`. */
function detourWindow(route: Float64Array, count: number, other: Float64Array, otherCount: number): number {
  if (count !== MAX_CORNERS) return 0;
  const exit = route[3];
  const span = other[2 * roleCorner(otherCount, 1) + 1] - exit;
  const share = Math.abs(span) > 1 ? (route[7] - exit) / span : DETOUR_MAX;
  return clamp(DETOUR_LEAD * share, DETOUR_MIN, DETOUR_MAX);
}

/**
 * Drops each corner within MERGE_PX of the one before it, and each lying on the straight line
 * between its neighbours, in place; returns the count left. A leg shrinking to nothing then hands
 * its chamfer over smoothly (no 10 px pop), and an at-rest route keeps exactly its own corners.
 */
function mergeCorners(c: Float64Array, count: number): number {
  let n = 1;
  for (let k = 1; k < count; k++) {
    const px = c[2 * k];
    const py = c[2 * k + 1];
    if (Math.hypot(px - c[2 * n - 2], py - c[2 * n - 1]) <= MERGE_PX) continue;
    if (n >= 2) {
      const ox = c[2 * n - 4];
      const oy = c[2 * n - 3];
      const qx = c[2 * n - 2] - ox;
      const qy = c[2 * n - 1] - oy;
      const lx = px - ox;
      const ly = py - oy;
      const length2 = lx * lx + ly * ly;
      const along = length2 > 0 ? (qx * lx + qy * ly) / length2 : 0;
      if (Math.abs(qx * ly - qy * lx) <= MERGE_PX * Math.sqrt(length2) && along > 0 && along < 1) n--;
    }
    c[2 * n] = px;
    c[2 * n + 1] = py;
    n++;
  }
  return n;
}

const _morphed = new Float64Array(2 * MAX_CORNERS);

/**
 * Trace corners `a` (routing A, `aCount` of them) morphed by `t` (0 = A, 1 = B) into `b`'s, the
 * same logo cell's in routing B, chamfered into `out` (at most MAX_POINTS points). Returns the point
 * count, or -1 for a shape routeGroup never lays out. At 0 and 1 it is exactly that routing's trace.
 * The junction and the exit travel together; a detour folds its lane onto the node's column early
 * (detourWindow), so no leg ever turns back on itself or crosses its own trace.
 */
export function morphRoute(a: Float64Array, aCount: number, b: Float64Array, bCount: number, t: number, out: Float64Array): number {
  const shape = (n: number) => n === 3 || n === 4 || n === MAX_CORNERS;
  if (!shape(aCount) || !shape(bCount)) return -1;
  const u = clamp(t, 0, 1);
  const ax = (k: number) => a[2 * roleCorner(aCount, k)];
  const ay = (k: number) => a[2 * roleCorner(aCount, k) + 1];
  const bx = (k: number) => b[2 * roleCorner(bCount, k)];
  const by = (k: number) => b[2 * roleCorner(bCount, k) + 1];
  const junctionY = lerp(ay(0), by(0), u);
  const exitX = lerp(ax(1), bx(1), u);
  // The node: the same cell in both routings.
  const nodeX = ax(5);
  const nodeY = ay(5);
  let exitY = lerp(ay(1), by(1), u);
  // Leaving in its node's column (a pin), a trace keeps its exit between the junction and the node:
  // the two routings leave on opposite sides of the junction, and mid-morph the trace would run
  // out and straight back over itself.
  if (Math.abs(exitX - nodeX) <= MERGE_PX) exitY = clamp(exitY, Math.min(junctionY, nodeY), Math.max(junctionY, nodeY));
  const detourA = aCount === MAX_CORNERS;
  const detourB = bCount === MAX_CORNERS;
  const tA = detourWindow(a, aCount, b, bCount);
  const tB = detourWindow(b, bCount, a, aCount);
  const laneA = detourA ? 1 - smoothstep(0, tA, u) : 0;
  const laneB = detourB ? smoothstep(1 - tB, 1, u) : 0;
  const lane = nodeX + (ax(2) - nodeX) * laneA + (bx(2) - nodeX) * laneB;
  const busA = detourA ? 1 - smoothstep(tA, tA + BUS_HANDOVER, u) : 0;
  const busB = detourB ? smoothstep(1 - tB - BUS_HANDOVER, 1 - tB, u) : 0;
  const bus = exitY + (ay(3) - exitY) * busA + (by(3) - exitY) * busB;
  const c = _morphed;
  c[0] = lerp(ax(0), bx(0), u);
  c[1] = junctionY;
  c[2] = exitX;
  c[3] = exitY;
  c[4] = lane;
  c[5] = exitY;
  c[6] = lane;
  c[7] = bus;
  c[8] = nodeX;
  c[9] = bus;
  c[10] = nodeX;
  c[11] = nodeY;
  return chamferRoute(c, mergeCorners(c, MAX_CORNERS), out);
}
