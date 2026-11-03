"use client";

/*
 * Partners and customers on lit circuit nodes: each logo cell ([data-anchor="logo"]) gets a node
 * on a plane behind the bands, exactly behind the cell on screen, wired to the orb by a Manhattan
 * trace with 45-degree chamfers that carries pulses outward. Visible in the partners pose (fading
 * with its weight). Same additive opaque-list material as the boards, so the orb refracts the
 * traces it sits on.
 *
 * The hovered logo's node and its trace flare with its mark's charge as the pipeline publishes it
 * (v3.4: motion.charge.marks, by logo-mark index, which is the cell's index): the composite's own
 * envelope, built under the pointer from geometry (inside the mark's rect, near its silhouette),
 * discharged after it, full at once on a click or a tap (touch has no hover). So the node lights
 * exactly when and as fast as its mark does, never over the logo's name alone, with no timings of
 * its own. A click or tap that bursts the mark also flashes the node past full flare. Paused or
 * with reduced motion there is no flash, and the node follows the charge as published.
 *
 * The routes are laid out on screen, where the page's rects are (partner-routes.ts): from slot A
 * around the Partners heading, from slot B fanning up into the bands, both every frame. Each trace
 * is morphed between its two routings corner by corner (morphRoute) by where the orb is between the
 * slots (world.traceMorph), so as it glides the lines bend and slide from the upper layout to the
 * lower one, never folding and never fading out (owner decision and report 2026-11-02). Without
 * slots: one routing from the orb's current position. Then projected onto the node plane point by
 * point: a projection keeps straight segments straight. Widths and sizes are CSS px converted at
 * the plane's depth, so the circuitry keeps one weight on every screen. While a trace reshapes, its
 * pulses keep their place at its node end (the junction end, under the orb, takes up the change), so
 * they march on at their own pace instead of racing with the trace's length.
 *
 * Every trace starts in a junction at the orb's rest point (the slot's centre, morphing from A's
 * to B's with the traces; junctions.md): a point, not a block (logo-v3-2.md), a small round via the
 * traces fan out of, drawn behind the orb: pushing or splashing the orb aside shows the junction and
 * the traces whole under it, never a hole. The rig carries the liquid with its glide between the
 * slots, so the orb rides the junction all the way. Once the orb leaves the slots for the contact
 * cards the circuit fades with the pose, its junction riding the orb as drawn (motion.orb, published
 * this frame: this runs at FRAME_ORDER.circuit, after the orb).
 *
 * First appearance: the orb takes its place first; once it has docked in its slot the junction
 * appears and the traces draw in from it outward, along their length, a spark at each tip, each
 * node lighting as its trace reaches it; then the pulses start. Gone again (out of the partners
 * pose), it replays the next time. Paused or with reduced motion it stands fully drawn.
 *
 * The geometry is rebuilt on the CPU each visible frame: at most MAX_TRACES x MAX_POINTS quads
 * and the junction.
 */

import { useEffect, useState, type JSX } from "react";
import * as THREE from "three";
import { useFrame, type RootState } from "@react-three/fiber";
import { ANCHORS, anchorRects, type AnchorRect } from "../../glass/contract";
import { motion } from "../../motion/store";
import { FRAME_ORDER } from "../../aquaism/core/frame-order";
import { clamp } from "../../aquaism/core/math";
import { ORB_RADIUS } from "../../aquaism/core/orb-field";
import { clientToPlaneZ, pixelsPerUnitAt, worldToClient, type ScreenBox, type ScreenPoint } from "../../aquaism/core/projection";
import { SILHOUETTE } from "./choreography";
import { NODE_PLANE_Z } from "./layers";
import {
  MAX_CORNERS,
  MAX_POINTS,
  MAX_TRACES,
  chamferRoute,
  morphRoute,
  routeTraces,
  type RouteSink,
} from "./partner-routes";
import { JUNCTION_QUAD_PX, TRACE_PULSE_PERIOD, createNodeMaterial, powerSeconds, type NodeUniforms } from "./world-materials";
import type { WorldState } from "./world-state";

/** A trace is at most MAX_POINTS - 1 straight pieces, plus its node; and the one junction. */
const QUADS = MAX_TRACES * MAX_POINTS + 1;

/** Fine copper, on every screen. */
const TRACE_WIDTH_PX = 3.5;
/** A node's half size: well inside the clearer frost disc round its logo cell (the composite's). */
const NODE_HALF_PX = 16;
/** At full flare a node grows this share; a burst's flash past full only brightens it, so it stays inside its frost disc. */
const NODE_FLARE_GROWTH = 0.6;

/* -- Flare: the mark's charge (v3.4: motion.charge.marks) ----------------- */
/** A click or tap that bursts the mark flashes its node and trace this far past full flare... */
const BURST_FLARE = 0.6;
/** ...the flash dying over this long (squared: it drops fast, then trails off). */
const BURST_S = 0.3;
/**
 * A press on a mark flashes its node once the published charge shows the burst: at least this
 * (a burst publishes a full charge, less one frame's discharge without hover), within this long (ms)
 * of the press (it lands a frame later: the composite sees the press after the world). A press the
 * composite does not burst (no field for that mark yet) never flashes the node on its own.
 */
const BURST_CONFIRM = 0.75;
const BURST_CONFIRM_MS = 150;

/** Below this pose weight nothing is drawn, and the first appearance is armed again. */
const MIN_WEIGHT = 0.003;

/* -- First appearance ---------------------------------------------------- */
/** It starts once the partners pose is this far in and the orb this docked in its slot. */
const GROW_AFTER_WEIGHT = 0.5;
const GROW_AFTER_DOCK = 0.9;
/**
 * The traces draw in at this many CSS px per second: the short fans from slot B (~650 px at the
 * longest) in under a second, the long ones round the heading from slot A (~1170 px) in ~1.2 s.
 */
const GROW_PX_PER_S = 1000;
/** ...each node lighting over this many px past its trace's end... */
const NODE_LIGHT_PX = 70;
/** ...the tip's spark this long (CSS px) behind the tip... */
const TIP_SPARK_PX = 26;
/** ...and the pulses easing in over this long once every trace is drawn. */
const PULSE_IN_S = 0.6;
/** The junction comes up over the first this-many CSS px the traces grow: it appears with the first trace. */
const JUNCTION_APPEAR_PX = 40;

type NodeMaterial = THREE.ShaderMaterial & { uniforms: NodeUniforms };

interface NodeMesh {
  mesh: THREE.Mesh<THREE.BufferGeometry, NodeMaterial>;
  positions: Float32Array;
  data: Float32Array;
  local: Float32Array;
  /**
   * Per logo (DOM order): a press on its mark waiting for the published charge to show the burst
   * (performance.now() ms, 0 = none), its burst's flash (1 when it fires, to 0)...
   */
  pending: Float64Array;
  burst: Float32Array;
  /** ...and the flare its node and trace get this frame: the published charge, above 1 during a flash. */
  flare: Float32Array;
  /**
   * Per logo: added to its trace's pulse coordinate so the pulses keep their place at the node end
   * while the trace's length changes (node-plane units, within one TRACE_PULSE_PERIOD), and that
   * length last frame (NaN: not drawn then, so nothing to keep in step with).
   */
  pulseShift: Float64Array;
  pulseLength: Float64Array;
}

function createNodeMesh(): NodeMesh {
  const positions = new Float32Array(QUADS * 4 * 3);
  const data = new Float32Array(QUADS * 4 * 4);
  const local = new Float32Array(QUADS * 4 * 2);
  const index = new Uint16Array(QUADS * 6);
  for (let q = 0; q < QUADS; q++) {
    const v = q * 4;
    index.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], q * 6);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  for (const [name, array, size] of [
    ["position", positions, 3],
    ["aData", data, 4],
    ["aLocal", local, 2],
  ] as const) {
    const attribute = new THREE.BufferAttribute(array, size);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name, attribute);
  }
  geometry.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(geometry, createNodeMaterial());
  // Rebuilt in place every frame; bounds would always be stale.
  mesh.frustumCulled = false;
  return {
    mesh,
    positions,
    data,
    local,
    pending: new Float64Array(MAX_TRACES),
    burst: new Float32Array(MAX_TRACES),
    flare: new Float32Array(MAX_TRACES),
    pulseShift: new Float64Array(MAX_TRACES),
    pulseLength: new Float64Array(MAX_TRACES).fill(NaN),
  };
}

/**
 * The logo whose mark a click or tap lands on this tick, or -1: inside the mark's rect, where the
 * composite bursts a mark. A touch's press arrives as it lifts as a tap, so touch, which has no
 * hover, gets the burst alone. Only arms the node's flash: the published charge confirms it.
 */
function pressedLogo(): number {
  let rects: AnchorRect[] | undefined;
  for (const impulse of motion.impulses) {
    if (impulse.kind !== "press" || !impulse.onScene) continue;
    rects ??= anchorRects.get(ANCHORS.logoMark);
    if (!rects) return -1;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (r.visible && impulse.x >= r.x && impulse.x < r.x + r.width && impulse.y >= r.y && impulse.y < r.y + r.height) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Steps every logo's flare: its mark's charge as the pipeline published it (motion.charge.marks,
 * 0..1, already eased there), plus a burst's flash, armed by a press on the mark (`pressed`) and
 * fired once that charge shows the burst. Paused or with reduced motion, no flash (nothing may
 * flash there): the flare is the published charge alone, as static as the pipeline keeps it.
 */
function stepFlares(m: NodeMesh, pressed: number, nowMs: number, dt: number): void {
  const still = motion.paused || motion.capabilities.reducedMotion;
  const marks = motion.charge.marks;
  for (let i = 0; i < MAX_TRACES; i++) {
    const published = i < marks.length ? marks[i] : 0;
    const charge = Number.isFinite(published) ? clamp(published, 0, 1) : 0;
    if (still) {
      m.pending[i] = 0;
      m.burst[i] = 0;
    } else {
      if (i === pressed) m.pending[i] = nowMs;
      m.burst[i] = Math.max(0, m.burst[i] - dt / BURST_S);
      if (m.pending[i] > 0 && charge >= BURST_CONFIRM) {
        m.burst[i] = 1;
        m.pending[i] = 0;
      } else if (m.pending[i] > 0 && nowMs - m.pending[i] > BURST_CONFIRM_MS) {
        m.pending[i] = 0;
      }
    }
    const b = m.burst[i];
    m.flare[i] = charge + BURST_FLARE * b * b;
  }
}

/** Writes one quad: a, b, c, d corners with their data. Returns the next quad index. */
function writeQuad(
  m: NodeMesh,
  quad: number,
  corners: readonly (readonly [number, number])[],
  data: readonly (readonly [number, number, number, number])[],
  local: readonly (readonly [number, number])[],
): number {
  if (quad >= QUADS) return quad;
  for (let k = 0; k < 4; k++) {
    const v = quad * 4 + k;
    m.positions[v * 3] = corners[k][0];
    m.positions[v * 3 + 1] = corners[k][1];
    m.positions[v * 3 + 2] = NODE_PLANE_Z;
    m.data.set(data[k], v * 4);
    m.local[v * 2] = local[k][0];
    m.local[v * 2 + 1] = local[k][1];
  }
  return quad + 1;
}

/** One straight piece of trace from a to b, its arclength from s0, its tip spark from sparkA to sparkB. */
function writeSegment(
  m: NodeMesh,
  quad: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  s0: number,
  flare: number,
  width: number,
  sparkA: number,
  sparkB: number,
): number {
  const length = Math.hypot(bx - ax, by - ay);
  if (length < 1e-5) return quad;
  const nx = (-(by - ay) / length) * (width / 2);
  const ny = ((bx - ax) / length) * (width / 2);
  const s1 = s0 + length;
  return writeQuad(
    m,
    quad,
    [
      [ax + nx, ay + ny],
      [ax - nx, ay - ny],
      [bx + nx, by + ny],
      [bx - nx, by - ny],
    ],
    [
      [s0, 0, flare, 1],
      [s0, 0, flare, -1],
      [s1, 0, flare, 1],
      [s1, 0, flare, -1],
    ],
    [
      [sparkA, 0],
      [sparkA, 0],
      [sparkB, 0],
      [sparkB, 0],
    ],
  );
}

/**
 * One routing's traces as laid out (their corners on screen, before the chamfers, per logo cell)
 * and the nodes' centres, by logo index (DOM order).
 */
class RouteCollector implements RouteSink {
  readonly corners = new Float64Array(MAX_TRACES * 2 * MAX_CORNERS);
  /** Each logo's corners, as a view into `corners` (made once: no allocation per frame). */
  readonly route: Float64Array[] = Array.from({ length: MAX_TRACES }, (_, i) =>
    this.corners.subarray(i * 2 * MAX_CORNERS, (i + 1) * 2 * MAX_CORNERS),
  );
  readonly count = new Uint8Array(MAX_TRACES);
  readonly has = new Uint8Array(MAX_TRACES);
  readonly nodes = new Float64Array(MAX_TRACES * 2);
  readonly hasNode = new Uint8Array(MAX_TRACES);

  clear(): void {
    this.has.fill(0);
    this.hasNode.fill(0);
  }

  trace(index: number, corners: Float64Array, count: number): void {
    if (index < 0 || index >= MAX_TRACES || count < 2 || count > MAX_CORNERS) return;
    const route = this.route[index];
    for (let k = 0; k < 2 * count; k++) route[k] = corners[k];
    this.count[index] = count;
    this.has[index] = 1;
  }

  node(index: number, x: number, y: number): void {
    if (index < 0 || index >= MAX_TRACES) return;
    this.nodes[2 * index] = x;
    this.nodes[2 * index + 1] = y;
    this.hasNode[index] = 1;
  }
}

const _orbScreen: ScreenPoint = { x: 0, y: 0, depth: 0 };
const _nodeScreen: ScreenPoint = { x: 0, y: 0, depth: 0 };
const _onPlane = new THREE.Vector3();
/** A morphed route on screen (x, y pairs), its arclength there, and on the node plane. */
const _screenRoute = new Float64Array(2 * MAX_POINTS);
const _screenAlong = new Float64Array(MAX_POINTS);
const _plane = new Float64Array(2 * MAX_POINTS);

interface Appearance {
  /** CSS px of trace drawn so far (Infinity: fully drawn). */
  grown: number;
  /** 0..1: the pulses. */
  pulse: number;
  /** The longest trace drawn this frame (CSS px), to know when the drawing is done. */
  longest: number;
}

/** The growing tip's spark at `along` px of a trace `length` px long, drawn to `grown` px: 1 at the tip. */
function tipSpark(along: number, grown: number, length: number): number {
  return grown < length ? clamp(1 - (grown - along) / TIP_SPARK_PX, 0, 1) : 0;
}

/** Writes this frame's morphed traces and their nodes as quads on the node plane. */
class NodeWriter {
  quad = 0;
  /** Trace width on the node plane (world units). */
  width = 0;
  /** CSS px the junction, and so every trace's first corner, sits off the routes' own start this frame. */
  shiftX = 0;
  shiftY = 0;
  camera: THREE.Camera = new THREE.Camera();
  box: ScreenBox = { width: 1, height: 1, left: 0, top: 0 };
  private readonly m: NodeMesh;

  constructor(m: NodeMesh) {
    this.m = m;
  }

  /**
   * Trace `index` morphed from routing a to b by `t` (either alone if only one has it), cut at
   * `grown` px from the orb with a spark at the tip; then its node, lit once the trace reaches it.
   * Returns the trace's full length on screen (CSS px), or 0.
   */
  write(index: number, a: RouteCollector, b: RouteCollector, t: number, grown: number): number {
    const inA = a.has[index] === 1;
    const inB = b.has[index] === 1;
    // Its length last frame; until it is drawn this frame, none (its pulses would start afresh).
    const before = this.m.pulseLength[index];
    this.m.pulseLength[index] = NaN;
    if (!inA && !inB) return 0;
    const wa = inA && inB ? 1 - t : inA ? 1 : 0;
    const wb = 1 - wa;
    // Both routings: corner by corner (morphRoute); in one only (or a shape it does not know), that one.
    let count = inA && inB ? morphRoute(a.route[index], a.count[index], b.route[index], b.count[index], t, _screenRoute) : -1;
    if (count < 0) {
      const only = wa >= 0.5 ? a : b;
      count = chamferRoute(only.route[index], only.count[index], _screenRoute);
    }
    // It starts in the junction, wherever the camera's sway puts it (buildWires).
    _screenRoute[0] += this.shiftX;
    _screenRoute[1] += this.shiftY;
    let length = 0;
    _screenAlong[0] = 0;
    for (let j = 1; j < count; j++) {
      length += Math.hypot(_screenRoute[2 * j] - _screenRoute[2 * j - 2], _screenRoute[2 * j + 1] - _screenRoute[2 * j - 1]);
      _screenAlong[j] = length;
    }
    let planeLength = 0;
    for (let j = 0; j < count; j++) {
      if (!clientToPlaneZ(_onPlane, this.camera, this.box, _screenRoute[2 * j], _screenRoute[2 * j + 1], NODE_PLANE_Z)) return 0;
      _plane[2 * j] = _onPlane.x;
      _plane[2 * j + 1] = _onPlane.y;
      if (j > 0) planeLength += Math.hypot(_plane[2 * j] - _plane[2 * j - 2], _plane[2 * j + 1] - _plane[2 * j - 1]);
    }
    // The pulses keep their place at the node end: the shift takes up the change of length.
    const m = this.m;
    m.pulseShift[index] = Number.isFinite(before) ? (m.pulseShift[index] - (planeLength - before)) % TRACE_PULSE_PERIOD : 0;
    m.pulseLength[index] = planeLength;
    const flare = m.flare[index];
    let s = m.pulseShift[index];
    for (let j = 1; j < count; j++) {
      const from = _screenAlong[j - 1];
      if (from >= grown) break;
      const to = _screenAlong[j];
      const ax = _plane[2 * j - 2];
      const ay = _plane[2 * j - 1];
      let bx = _plane[2 * j];
      let by = _plane[2 * j + 1];
      // The growing tip cuts its piece short (a projection keeps the cut on the piece).
      const cut = to > grown && to > from ? (grown - from) / (to - from) : 1;
      if (cut < 1) {
        bx = ax + (bx - ax) * cut;
        by = ay + (by - ay) * cut;
      }
      const sparkA = tipSpark(from, grown, length);
      const sparkB = tipSpark(Math.min(to, grown), grown, length);
      this.quad = writeSegment(this.m, this.quad, ax, ay, bx, by, s, flare, this.width, sparkA, sparkB);
      s += Math.hypot(bx - ax, by - ay);
    }
    const nodeX = a.hasNode[index] && b.hasNode[index] ? a.nodes[2 * index] * wa + b.nodes[2 * index] * wb : (inA ? a : b).nodes[2 * index];
    const nodeY = a.hasNode[index] && b.hasNode[index] ? a.nodes[2 * index + 1] * wa + b.nodes[2 * index + 1] * wb : (inA ? a : b).nodes[2 * index + 1];
    this.node(index, nodeX, nodeY, clamp((grown - length) / NODE_LIGHT_PX, 0, 1));
    return length;
  }

  /**
   * The junction the traces start in: a small round via (shaders.ts) centred on client (x, y),
   * JUNCTION_QUAD_PX of quad at the node plane's depth, at `presence` (0..1).
   */
  junction(x: number, y: number, presence: number): void {
    if (!(presence > 0)) return;
    if (!clientToPlaneZ(_onPlane, this.camera, this.box, x, y, NODE_PLANE_Z)) return;
    if (!worldToClient(_nodeScreen, this.camera, this.box, _onPlane)) return;
    const unitPx = pixelsPerUnitAt(this.camera, this.box, _nodeScreen.depth);
    if (!(unitPx > 0)) return;
    const h = JUNCTION_QUAD_PX / unitPx;
    const px = _onPlane.x;
    const py = _onPlane.y;
    this.quad = writeQuad(
      this.m,
      this.quad,
      [
        [px - h, py - h],
        [px + h, py - h],
        [px - h, py + h],
        [px + h, py + h],
      ],
      [
        [0, 2, 0, presence],
        [0, 2, 0, presence],
        [0, 2, 0, presence],
        [0, 2, 0, presence],
      ],
      [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ],
    );
  }

  /** The node's quad, NODE_HALF_PX on screen at its own depth, at `presence` (0..1). */
  private node(index: number, x: number, y: number, presence: number): void {
    if (!(presence > 0)) return;
    if (!clientToPlaneZ(_onPlane, this.camera, this.box, x, y, NODE_PLANE_Z)) return;
    if (!worldToClient(_nodeScreen, this.camera, this.box, _onPlane)) return;
    const unitPx = pixelsPerUnitAt(this.camera, this.box, _nodeScreen.depth);
    if (!(unitPx > 0)) return;
    const flare = this.m.flare[index];
    const h = (NODE_HALF_PX / unitPx) * (1 + NODE_FLARE_GROWTH * Math.min(flare, 1));
    const px = _onPlane.x;
    const py = _onPlane.y;
    const phase = index * 1.7;
    this.quad = writeQuad(
      this.m,
      this.quad,
      [
        [px - h, py - h],
        [px + h, py - h],
        [px - h, py + h],
        [px + h, py + h],
      ],
      [
        [phase, 1, flare, presence],
        [phase, 1, flare, presence],
        [phase, 1, flare, presence],
        [phase, 1, flare, presence],
      ],
      [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ],
    );
  }
}

/**
 * Where the orb as drawn this frame (motion.orb) is between the slots, 0..1, as the rig's
 * traceMorph counts it; `fallback` while it is off screen.
 */
function drawnMorph(world: WorldState, fallback: number): number {
  const drawn = motion.orb;
  const a = world.slotA;
  const dx = world.slotB.x - a.x;
  const dy = world.slotB.y - a.y;
  const length2 = dx * dx + dy * dy;
  if (!drawn.visible || !Number.isFinite(drawn.x) || !Number.isFinite(drawn.y) || !(length2 > 1)) return fallback;
  return clamp(((drawn.x - a.x) * dx + (drawn.y - a.y) * dy) / length2, 0, 1);
}

/**
 * Lays out this frame's routings and writes the morphed traces; returns the quads written.
 * With both slots laid out, the routings from A and from B; otherwise one, from the orb itself.
 */
function buildWires(
  writer: NodeWriter,
  routes: [RouteCollector, RouteCollector],
  appearance: Appearance,
  state: RootState,
  world: WorldState,
): number {
  const camera = state.camera;
  const box = state.size;
  if (!worldToClient(_orbScreen, camera, box, world.orb.centre)) return 0;
  // CSS px to node-plane units, at the depth of the plane behind the orb.
  if (!clientToPlaneZ(_onPlane, camera, box, _orbScreen.x, _orbScreen.y, NODE_PLANE_Z)) return 0;
  if (!worldToClient(_nodeScreen, camera, box, _onPlane)) return 0;
  const planePx = pixelsPerUnitAt(camera, box, _nodeScreen.depth);
  if (!(planePx > 0)) return 0;
  writer.camera = camera;
  writer.box = box;
  writer.width = TRACE_WIDTH_PX / planePx;
  writer.quad = 0;

  const [a, b] = routes;
  a.clear();
  b.clear();
  let morph = 0;
  // The junction at the orb's rest point: the slots' centres, morphed with the traces (each starts
  // at its routing's centre, so the morphed traces meet in the morphed point). Leaving the slots
  // for the contact cards, where the orb as drawn is between them instead.
  let junctionX: number;
  let junctionY: number;
  writer.shiftX = 0;
  writer.shiftY = 0;
  if (world.slotA.valid && world.slotB.valid) {
    routeTraces(world.slotA.x, world.slotA.y, world.slotA.radius, a);
    routeTraces(world.slotB.x, world.slotB.y, world.slotB.radius, b);
    morph = clamp(world.traceFollowsOrb ? drawnMorph(world, world.traceMorph) : world.traceMorph, 0, 1);
    // The camera's breathing and parallax move the orb a few px off the routes' path: the junction
    // and the traces' first corner go with it, so the point stays under the orb's centre.
    if (!world.traceFollowsOrb) {
      writer.shiftX = world.junctionShift.x;
      writer.shiftY = world.junctionShift.y;
    }
    junctionX = world.slotA.x + (world.slotB.x - world.slotA.x) * morph + writer.shiftX;
    junctionY = world.slotA.y + (world.slotB.y - world.slotA.y) * morph + writer.shiftY;
  } else {
    // The orb's silhouette on screen, as the poses count it.
    const r = ORB_RADIUS * world.orb.scale * pixelsPerUnitAt(camera, box, _orbScreen.depth) * SILHOUETTE;
    routeTraces(_orbScreen.x, _orbScreen.y, r, a);
    junctionX = _orbScreen.x;
    junctionY = _orbScreen.y;
  }
  writer.junction(junctionX, junctionY, clamp(appearance.grown / JUNCTION_APPEAR_PX, 0, 1));
  appearance.longest = 0;
  for (let i = 0; i < MAX_TRACES; i++) {
    appearance.longest = Math.max(appearance.longest, writer.write(i, a, b, morph, appearance.grown));
  }
  return writer.quad;
}

/**
 * Advances the first appearance: armed while the partners pose is out, it draws the traces in
 * once the orb has docked, then eases the pulses in. Still (fully drawn) while paused or with
 * reduced motion, where nothing should crawl in.
 */
function advanceAppearance(appearance: Appearance, world: WorldState, dt: number): void {
  if (world.nodes <= MIN_WEIGHT) {
    appearance.grown = 0;
    appearance.pulse = 0;
    return;
  }
  if (motion.paused || motion.capabilities.reducedMotion) {
    appearance.grown = Infinity;
    appearance.pulse = 1;
    return;
  }
  if (appearance.grown === 0 && !(world.nodes >= GROW_AFTER_WEIGHT && world.dock >= GROW_AFTER_DOCK)) return;
  if (Number.isFinite(appearance.grown)) {
    appearance.grown += GROW_PX_PER_S * dt;
    // Done once every trace and its node are lit: from then on nothing is cut.
    if (appearance.longest > 0 && appearance.grown >= appearance.longest + NODE_LIGHT_PX) appearance.grown = Infinity;
    return;
  }
  appearance.pulse = Math.min(1, appearance.pulse + dt / PULSE_IN_S);
}

export default function PartnerNodes({ world }: { world: WorldState }): JSX.Element {
  const [nodes] = useState(createNodeMesh);
  const [writer] = useState(() => new NodeWriter(nodes));
  const [routes] = useState<[RouteCollector, RouteCollector]>(() => [new RouteCollector(), new RouteCollector()]);
  const [appearance] = useState<Appearance>(() => ({ grown: 0, pulse: 0, longest: 0 }));

  useEffect(() => {
    const { mesh } = nodes;
    return () => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    };
  }, [nodes]);

  useFrame((state) => {
    const dt = motion.time.sceneDelta;
    stepFlares(nodes, pressedLogo(), motion.time.now * 1000, dt);

    advanceAppearance(appearance, world, dt);
    const u = nodes.mesh.material.uniforms;
    u.uWeight.value = world.nodes;
    u.uTraceWeight.value = world.nodes;
    u.uPulse.value = appearance.pulse;
    const visible = world.nodes > MIN_WEIGHT && world.powerStartMs > 0;
    nodes.mesh.visible = visible;
    if (!visible) {
      nodes.pulseLength.fill(NaN);
      return;
    }

    u.uTime.value = world.time;
    u.uPowerT.value = powerSeconds(world.powerStartMs, motion.time.now);
    u.uPowerOrigin.value.copy(world.powerOrigin);

    const quads = buildWires(writer, routes, appearance, state, world);
    const geometry = nodes.mesh.geometry;
    geometry.setDrawRange(0, quads * 6);
    if (quads === 0) return;
    for (const [name, size] of [
      ["position", 3],
      ["aData", 4],
      ["aLocal", 2],
    ] as const) {
      const attribute = geometry.getAttribute(name);
      if (!(attribute instanceof THREE.BufferAttribute)) continue;
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, quads * 4 * size);
      attribute.needsUpdate = true;
    }
  }, FRAME_ORDER.circuit);

  return <primitive object={nodes.mesh} />;
}
