/* ------------------------------------------------------------------ */
/*  Trace quads laid out on screen and projected onto a plane in depth: */
/*  the panel circuitry's shared writer (owner decisions 2026-11-02).   */
/*  The service circuitry (service-links.tsx) links the home page's     */
/*  three Services cards; the cell circuitry (cell-links.tsx) links a   */
/*  practice page's feature cards, its pill row and its call to action. */
/*  Routes are corners in client CSS px, chamfered like the partner     */
/*  traces, cast onto the plane through this frame's camera, each       */
/*  segment a quad carrying its arclength (the pulses run along it).    */
/*  Where traces meet a body they run into a junction at the body's     */
/*  anchored rest point (junctions.md): a point, not a block (logo-v3-2 */
/*  .md), a small round via the traces converge into, drawn here too,   */
/*  so pushing the body never leaves a hole in the circuit. The         */
/*  material is the partner traces' (additive, opaque list, its own     */
/*  fade to black), rebuilt on the CPU each visible frame.              */
/* ------------------------------------------------------------------ */

import * as THREE from "three";
import type { RootState } from "@react-three/fiber";
import type { AnchorRect } from "../../glass/contract";
import { clientToPlaneZ } from "../../aquaism/core/projection";
import { chamferRoute } from "./partner-routes";
import { JUNCTION_QUAD_PX, createNodeMaterial, type NodeUniforms } from "./world-materials";

export type LinkMaterial = THREE.ShaderMaterial & { uniforms: NodeUniforms };

export interface LinkMesh {
  mesh: THREE.Mesh<THREE.BufferGeometry, LinkMaterial>;
  positions: Float32Array;
  data: Float32Array;
  local: Float32Array;
  maxQuads: number;
}

/** A mesh of up to `maxQuads` trace quads, its draw range empty until a writer fills it. */
export function createLinkMesh(maxQuads: number): LinkMesh {
  const positions = new Float32Array(maxQuads * 4 * 3);
  const data = new Float32Array(maxQuads * 4 * 4);
  const local = new Float32Array(maxQuads * 4 * 2);
  const index = new Uint16Array(maxQuads * 6);
  for (let q = 0; q < maxQuads; q++) {
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
  const material = createNodeMaterial();
  // Nodes never drawn here; the pulses run from the start.
  material.uniforms.uPulse.value = 1;
  const mesh = new THREE.Mesh(geometry, material);
  // Rebuilt in place every frame; bounds would always be stale.
  mesh.frustumCulled = false;
  return { mesh, positions, data, local, maxQuads };
}

/** Uploads the first `quads` quads a writer wrote and sets the draw range. */
export function uploadLinks(m: LinkMesh, quads: number): void {
  const geometry = m.mesh.geometry;
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
}

/** Most corners a route may have (before chamfering). */
export const MAX_ROUTE_CORNERS = 6;

const _onPlane = new THREE.Vector3();
const _chamfered = new Float64Array(2 * (2 * MAX_ROUTE_CORNERS - 2));
const _offset = new Float64Array(2 * MAX_ROUTE_CORNERS);
/** A double's centre line between its junctions, and that line shifted to one side. */
const _inner = new Float64Array(2 * MAX_ROUTE_CORNERS);
const _shifted = new Float64Array(2 * MAX_ROUTE_CORNERS);

/**
 * The route `count` corners long (client px, x and y interleaved) shifted `d` px to its left (as
 * walked from its first corner; screen y points down), into `out`: each leg moved along its normal,
 * each corner where the moved legs meet (a mitre), so parallel traces stay parallel round the turns.
 * Returns the corner count.
 */
export function offsetRoute(corners: Float64Array, count: number, d: number, out: Float64Array): number {
  const n = Math.min(count, MAX_ROUTE_CORNERS);
  for (let k = 0; k < n; k++) {
    // The normals of the legs before and after this corner (the ends have one leg).
    let ax = 0;
    let ay = 0;
    let bx = 0;
    let by = 0;
    if (k > 0) {
      const dx = corners[2 * k] - corners[2 * k - 2];
      const dy = corners[2 * k + 1] - corners[2 * k - 1];
      const length = Math.hypot(dx, dy) || 1;
      ax = dy / length;
      ay = -dx / length;
    }
    if (k + 1 < n) {
      const dx = corners[2 * k + 2] - corners[2 * k];
      const dy = corners[2 * k + 3] - corners[2 * k + 1];
      const length = Math.hypot(dx, dy) || 1;
      bx = dy / length;
      by = -dx / length;
    }
    if (k === 0) {
      ax = bx;
      ay = by;
    } else if (k + 1 === n) {
      bx = ax;
      by = ay;
    }
    // Mitre: the sum of the two normals, scaled so each leg keeps its distance d.
    const mx = ax + bx;
    const my = ay + by;
    const dot = ax * bx + ay * by;
    const scale = d / Math.max(1 + dot, 0.2);
    out[2 * k] = corners[2 * k] + mx * scale;
    out[2 * k + 1] = corners[2 * k + 1] + my * scale;
  }
  return n;
}

/** Writes routes as quads into a link mesh, as the page lays out its panels this frame. */
export class LinkWriter {
  quad = 0;
  /** Trace width on the plane, world units. */
  width = 0;
  /** World units on the plane per CSS px (as measured where the caller measured the width). */
  unit = 0;
  /** The plane the routes are cast onto (world z). */
  planeZ = 0;
  camera: THREE.Camera = new THREE.Camera();
  box: RootState["size"] = { width: 1, height: 1, left: 0, top: 0 };
  private readonly m: LinkMesh;

  constructor(m: LinkMesh) {
    this.m = m;
  }

  /**
   * Starts a frame: the camera and box to cast through, the plane, and how many CSS px a world unit
   * spans on it (`planePx`); traces are `widthPx` wide.
   */
  begin(camera: THREE.Camera, box: RootState["size"], planeZ: number, planePx: number, widthPx: number): void {
    this.camera = camera;
    this.box = box;
    this.planeZ = planeZ;
    this.unit = 1 / planePx;
    this.width = widthPx * this.unit;
    this.quad = 0;
  }

  /**
   * Two parallel traces `pitch` px apart between two junctions: the route's first and last corners
   * are the junction points, its inner corners (at least two) the pair's centre line. Each trace
   * runs `pitch / 2` to one side of that line through the inner corners and converges into the
   * junction point at either end (the leg from its first or last inner corner: a short fan), so
   * both meet in the point. The second runs the other way, so pulses travel both ways along the pair.
   */
  double(corners: Float64Array, count: number, pitch: number): void {
    const n = Math.min(count, MAX_ROUTE_CORNERS);
    if (n < 4) return;
    const inner = n - 2;
    for (let k = 0; k < 2 * inner; k++) _inner[k] = corners[k + 2];
    for (let side = 0; side < 2; side++) {
      offsetRoute(_inner, inner, side === 0 ? pitch / 2 : -pitch / 2, _shifted);
      _offset[0] = corners[0];
      _offset[1] = corners[1];
      for (let k = 0; k < 2 * inner; k++) _offset[k + 2] = _shifted[k];
      _offset[2 * n - 2] = corners[2 * n - 2];
      _offset[2 * n - 1] = corners[2 * n - 1];
      this.route(_offset, n, side === 1);
    }
  }

  /**
   * A junction (shaders.ts: a small round via, JUNCTION_QUAD_PX of quad) centred on client (x, y),
   * at `presence` 0..1; `phase` staggers its breathing from its neighbours'.
   */
  junction(x: number, y: number, presence: number, phase: number): void {
    if (!(presence > 0) || this.quad >= this.m.maxQuads) return;
    if (!clientToPlaneZ(_onPlane, this.camera, this.box, x, y, this.planeZ)) return;
    const h = JUNCTION_QUAD_PX * this.unit;
    const m = this.m;
    for (let k = 0; k < 4; k++) {
      const sx = k & 1 ? 1 : -1;
      const sy = k & 2 ? 1 : -1;
      const v = this.quad * 4 + k;
      m.positions[v * 3] = _onPlane.x + sx * h;
      m.positions[v * 3 + 1] = _onPlane.y + sy * h;
      m.positions[v * 3 + 2] = this.planeZ;
      m.data[v * 4] = phase;
      m.data[v * 4 + 1] = 2;
      m.data[v * 4 + 2] = 0;
      m.data[v * 4 + 3] = presence;
      m.local[v * 2] = sx;
      m.local[v * 2 + 1] = sy;
    }
    this.quad++;
  }

  /**
   * One route of `count` corners (client px, x and y interleaved in `corners`), chamfered, cast
   * onto the plane, its arclength from its first point (`reverse`: from its last, so the pulses
   * run the other way).
   */
  route(corners: Float64Array, count: number, reverse: boolean): void {
    const n = Math.min(count, MAX_ROUTE_CORNERS);
    if (n < 2) return;
    if (reverse) {
      for (let k = 0; k < n >> 1; k++) {
        const j = n - 1 - k;
        const x = corners[2 * k];
        const y = corners[2 * k + 1];
        corners[2 * k] = corners[2 * j];
        corners[2 * k + 1] = corners[2 * j + 1];
        corners[2 * j] = x;
        corners[2 * j + 1] = y;
      }
    }
    const points = chamferRoute(corners, n, _chamfered);
    let s = 0;
    let ax = 0;
    let ay = 0;
    for (let k = 0; k < points; k++) {
      if (!clientToPlaneZ(_onPlane, this.camera, this.box, _chamfered[2 * k], _chamfered[2 * k + 1], this.planeZ)) return;
      const bx = _onPlane.x;
      const by = _onPlane.y;
      if (k > 0) {
        this.segment(ax, ay, bx, by, s);
        s += Math.hypot(bx - ax, by - ay);
      }
      ax = bx;
      ay = by;
    }
  }

  private segment(ax: number, ay: number, bx: number, by: number, s0: number): void {
    const length = Math.hypot(bx - ax, by - ay);
    if (length < 1e-5 || this.quad >= this.m.maxQuads) return;
    const nx = (-(by - ay) / length) * (this.width / 2);
    const ny = ((bx - ax) / length) * (this.width / 2);
    this.vertex(0, ax + nx, ay + ny, s0, 1);
    this.vertex(1, ax - nx, ay - ny, s0, -1);
    this.vertex(2, bx + nx, by + ny, s0 + length, 1);
    this.vertex(3, bx - nx, by - ny, s0 + length, -1);
    this.quad++;
  }

  /** Corner k of the current quad: its plane position, arclength and side across the trace. */
  private vertex(k: number, x: number, y: number, along: number, across: number): void {
    const m = this.m;
    const v = this.quad * 4 + k;
    m.positions[v * 3] = x;
    m.positions[v * 3 + 1] = y;
    m.positions[v * 3 + 2] = this.planeZ;
    m.data[v * 4] = along;
    m.data[v * 4 + 1] = 0;
    m.data[v * 4 + 2] = 0;
    m.data[v * 4 + 3] = across;
    m.local[v * 2] = 0;
    m.local[v * 2 + 1] = 0;
  }
}

/** The first laid-out rect of an anchor's, or null. */
export function laidOut(rects: AnchorRect[] | undefined): AnchorRect | null {
  if (!rects) return null;
  for (const rect of rects) if (rect.width > 0 && rect.height > 0) return rect;
  return null;
}
