/*
 * Marching cubes for the orb, vendored from three.js r186 (examples/jsm/objects/MarchingCubes.js,
 * itself a port of http://webglsamples.org/blob/blob.html; the lookup tables are Paul Bourke's,
 * http://paulbourke.net/geometry/polygonise/, who got them from Cory Gene Bloyd) and trimmed to
 * what the orb uses: metaballs with vertex colours. No uvs, planes, blur or flat shading.
 *
 * Why a copy: the production minifier inlined three's single-use polygonize() and posnormtriv()
 * into update()'s innermost loop as immediately invoked functions, so each of the ~330k grid cells
 * allocated a closure: about 22 MB of garbage per rebuild at resolution 72 (review C4). Here every
 * per-cell and per-triangle call is a method call through `this`, which no minifier inlines.
 *
 * The output matches three's version (checked against it on random fields; the field sums now
 * round differently in the last bits, far below any visible difference), but costs less:
 * - update() loops over integer cell coordinates, tests a cell's eight corners inline and calls
 *   polygonize() only for the cells the surface crosses, which derives the positions from the
 *   integers. Nothing is boxed or allocated per cell.
 * - Only the box the balls touched since the last reset is cleared and polygonised: a field of
 *   zeros holds no surface.
 * - addBall() evaluates only each row's chord through the ball, and only the field. The colour
 *   palette is summed lazily, per grid corner, for the corners of the cells the surface crosses
 *   (the only ones a vertex colour reads), from the balls recorded since the reset: the same sums
 *   in the same order, so the colours are three's. A ball's colour used to cost more than its
 *   field across every cell it touched (the rebuild was ~2.4x slower at 72, scratch W/mcbench),
 *   and the orb's field box now shrinks while it is big on screen, which multiplies those cells.
 * - init() resizes the grid live (the orb steps its resolution down on slow CPUs) and keeps the
 *   vertex buffers, the isolation and the bounds. Only the triangle capacity is fixed.
 * - setGrid() reshapes the grid within what init() allocated: nx x ny x nz cubic cells, `unit` of
 *   them to a box unit, so the orb's split can cover the view with a slab of small cells instead of
 *   a cube (choreography v3). The local box spans +-n / unit on each axis (+-1 on a cube).
 * - addBall() takes an optional reach cut: a ball's term is dropped beyond it (the orb's small split
 *   bodies, where three's reach is ~5 body radii of values far below the iso level).
 *
 * Copyright (c) 2010-2026 three.js authors. Used under the MIT License:
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 * and associated documentation files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or
 * substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
 * NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 * DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as THREE from "three";

/** Smallest grid the class accepts: the outer layer of cells is never polygonised. */
const MIN_RESOLUTION = 4;
/** Numbers recorded per ball for the lazy palette (see MarchingCubes.balls). */
const BALL_STRIDE = 19;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class MarchingCubes extends THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
  /** Iso level of the surface. Not touched by init(). */
  isolation = 80;
  /** Vertices the last update() wrote (3 per triangle), never more than the buffers hold. */
  vertexCount = 0;
  /** Cells per axis of the cube init() allocated (the grid's resolution; setGrid() reshapes within it). */
  resolution = 0;

  /** Cells per axis of the current grid, and the strides of a row (y) and a slice (z). */
  private nx = 0;
  private ny = 0;
  private nz = 0;
  private strideY = 0;
  private strideZ = 0;
  /** Cells per box unit: ball positions and radii are in box units (a cube grid's side is 1). */
  private unit = 0;
  /** Cells the arrays hold. */
  private capacity = 0;
  /** A cell's side in local units (2 / unit). */
  private delta = 0;
  private field = new Float32Array(0);
  /** x, y, z gradient per cell; x == 0 marks "not computed yet" (as in three). */
  private normalCache = new Float32Array(0);
  /** Summed ball colour per cell, valid where paletteStamp holds the current stamp. */
  private palette = new Float32Array(0);
  private paletteStamp = new Uint32Array(0);
  /** Bumped by every reset(): a palette entry from an earlier field is stale without clearing it. */
  private stamp = 1;

  /**
   * The balls added since the last reset, for the lazy palette: per ball its centre in box units
   * and in cells, its colour radius in cells, strength, subtract, colour, the cell box addBall()
   * wrote (min inclusive, max exclusive per axis) and its squared reach cut in box units (Infinity
   * for none), BALL_STRIDE numbers each.
   */
  private balls = new Float64Array(BALL_STRIDE * 64);
  private ballCount = 0;

  private readonly positionArray: Float32Array;
  private readonly normalArray: Float32Array;
  private readonly colorArray: Float32Array | null;

  /** One cell's scratch: position, normal and colour at each of its 12 edge crossings. */
  private readonly vlist = new Float32Array(12 * 3);
  private readonly nlist = new Float32Array(12 * 3);
  private readonly clist = new Float32Array(12 * 3);

  /** Cells the balls wrote since the last reset, [min, max) per axis (empty when min >= max). */
  private boxMinX = 0;
  private boxMaxX = 0;
  private boxMinY = 0;
  private boxMaxY = 0;
  private boxMinZ = 0;
  private boxMaxZ = 0;

  constructor(resolution: number, material: THREE.Material, enableColors: boolean, maxPolyCount: number) {
    super(new THREE.BufferGeometry(), material);
    const geometry = this.geometry;
    const maxVertexCount = Math.max(1, Math.floor(maxPolyCount)) * 3;

    this.positionArray = new Float32Array(maxVertexCount * 3);
    const position = new THREE.BufferAttribute(this.positionArray, 3);
    position.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", position);

    this.normalArray = new Float32Array(maxVertexCount * 3);
    const normal = new THREE.BufferAttribute(this.normalArray, 3);
    normal.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("normal", normal);

    if (enableColors) {
      this.colorArray = new Float32Array(maxVertexCount * 3);
      const color = new THREE.BufferAttribute(this.colorArray, 3);
      color.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute("color", color);
    } else {
      this.colorArray = null;
    }

    // The field spans [-1, 1] on each local axis: a sphere through the box corners. (three's
    // default radius 1 misses the corners, where the orb's split bodies can sit.)
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.sqrt(3));
    this.init(resolution);
  }

  /**
   * (Re)allocates the grid as a cube of `resolution` cells per axis. The vertex buffers, isolation
   * and bounds stay.
   */
  init(resolution: number): void {
    const size = Math.max(MIN_RESOLUTION, Math.floor(resolution));
    this.resolution = size;
    const cells = size * size * size;
    this.capacity = cells;
    this.field = new Float32Array(cells);
    this.normalCache = new Float32Array(cells * 3);
    this.palette = new Float32Array(cells * 3);
    this.paletteStamp = new Uint32Array(cells);
    this.stamp = 1;
    this.ballCount = 0;
    this.vertexCount = 0;
    this.geometry.setDrawRange(0, 0);
    this.shape(size, size, size, size);
  }

  /** Cells the grid may hold in all (what init() allocated): setGrid()'s budget. */
  get cellCapacity(): number {
    return this.capacity;
  }

  /**
   * Reshapes the grid to nx x ny x nz cubic cells, `unit` cells to a box unit, within the cells
   * init() allocated. Clears the field first (it is a reset()), so call it in place of reset()
   * before adding the balls. Returns false, and keeps the shape it had, when the cells do not fit.
   */
  setGrid(nx: number, ny: number, nz: number, unit: number): boolean {
    this.reset();
    const x = Math.max(MIN_RESOLUTION, Math.floor(nx));
    const y = Math.max(MIN_RESOLUTION, Math.floor(ny));
    const z = Math.max(MIN_RESOLUTION, Math.floor(nz));
    if (x * y * z > this.capacity || !(unit > 0)) return false;
    if (x !== this.nx || y !== this.ny || z !== this.nz || unit !== this.unit) this.shape(x, y, z, unit);
    return true;
  }

  /** Sets the grid's shape and strides. The field must be all zero (fresh, or just reset). */
  private shape(nx: number, ny: number, nz: number, unit: number): void {
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    this.strideY = nx;
    this.strideZ = nx * ny;
    this.unit = unit;
    this.delta = 2 / unit;
    this.emptyBox();
  }

  private emptyBox(): void {
    this.boxMinX = this.nx;
    this.boxMinY = this.ny;
    this.boxMinZ = this.nz;
    this.boxMaxX = this.boxMaxY = this.boxMaxZ = 0;
  }

  /**
   * Adds a reciprocal ball (three's metaball: strength / d^2 - subtract, cut off where that
   * reaches zero, or at `cut` box units when that is nearer), in box coordinates (0..n / unit per
   * axis: 0..1 on a cube grid), with a linear colour.
   */
  addBall(
    ballx: number,
    bally: number,
    ballz: number,
    strength: number,
    subtract: number,
    r: number,
    g: number,
    b: number,
    cut = 0,
  ): void {
    const unit = this.unit;
    const strideY = this.strideY;
    const strideZ = this.strideZ;
    const sign = Math.sign(strength);
    strength = Math.abs(strength);
    if (!(strength > 0) || !(subtract > 0)) return;

    // strength / radius^2 = subtract: the radius (in cells) where the ball's term reaches zero.
    const radius = unit * Math.sqrt(strength / subtract);
    // The reach this ball writes (squared box units): the zero, or the cut inside it.
    const zero2 = strength / subtract;
    const cutting = cut > 0 && cut * cut < zero2;
    const reach = cutting ? cut * cut : zero2;
    const extent = cutting ? unit * cut : radius;
    const zs = ballz * unit;
    const ys = bally * unit;
    const xs = ballx * unit;

    // Don't polygonize in the outer layer because normals aren't well-defined there (three).
    let minZ = Math.floor(zs - extent);
    if (minZ < 1) minZ = 1;
    let maxZ = Math.floor(zs + extent);
    if (maxZ > this.nz - 1) maxZ = this.nz - 1;
    let minY = Math.floor(ys - extent);
    if (minY < 1) minY = 1;
    let maxY = Math.floor(ys + extent);
    if (maxY > this.ny - 1) maxY = this.ny - 1;
    let minX = Math.floor(xs - extent);
    if (minX < 1) minX = 1;
    let maxX = Math.floor(xs + extent);
    if (maxX > this.nx - 1) maxX = this.nx - 1;
    if (!(minX < maxX && minY < maxY && minZ < maxZ)) return;

    if (minX < this.boxMinX) this.boxMinX = minX;
    if (maxX > this.boxMaxX) this.boxMaxX = maxX;
    if (minY < this.boxMinY) this.boxMinY = minY;
    if (maxY > this.boxMaxY) this.boxMaxY = maxY;
    if (minZ < this.boxMinZ) this.boxMinZ = minZ;
    if (maxZ > this.boxMaxZ) this.boxMaxZ = maxZ;

    // Recorded for the lazy palette (paletteAt), with everything its test needs.
    if ((this.ballCount + 1) * BALL_STRIDE > this.balls.length) {
      const grown = new Float64Array(this.balls.length * 2);
      grown.set(this.balls);
      this.balls = grown;
    }
    const o = this.ballCount++ * BALL_STRIDE;
    const balls = this.balls;
    balls[o] = ballx;
    balls[o + 1] = bally;
    balls[o + 2] = ballz;
    balls[o + 3] = xs;
    balls[o + 4] = ys;
    balls[o + 5] = zs;
    balls[o + 6] = radius;
    balls[o + 7] = strength;
    balls[o + 8] = subtract;
    balls[o + 9] = r;
    balls[o + 10] = g;
    balls[o + 11] = b;
    balls[o + 12] = minX;
    balls[o + 13] = maxX;
    balls[o + 14] = minY;
    balls[o + 15] = maxY;
    balls[o + 16] = minZ;
    balls[o + 17] = maxZ;
    balls[o + 18] = cutting ? reach : Infinity;

    const field = this.field;
    const invUnit = 1 / unit;
    // The term is positive only where fx^2 + fy^2 + fz^2 (+ 1e-6) < strength / subtract, so each
    // row is walked along its chord through the ball, with a cell of margin on both sides so that
    // rounding never drops a cell. The test below still decides, as three's full loop does. A cut
    // ball's chord is exact instead (its sphere is the cut, well inside the zero).

    for (let z = minZ; z < maxZ; z++) {
      const zOffset = strideZ * z;
      const fz = z * invUnit - ballz;
      const fz2 = fz * fz;

      for (let y = minY; y < maxY; y++) {
        const fy = y * invUnit - bally;
        const fy2 = fy * fy;
        const rest = reach - fy2 - fz2;
        if (rest <= 0) continue;
        const half = Math.sqrt(rest) * unit;
        let x0 = cutting ? Math.ceil(xs - half) : Math.floor(xs - half) - 1;
        if (x0 < minX) x0 = minX;
        let x1 = cutting ? Math.floor(xs + half) + 1 : Math.ceil(xs + half) + 1;
        if (x1 > maxX) x1 = maxX;

        const yOffset = zOffset + strideY * y;
        // The row's constant part of the distance once, and a multiply for the cell's offset: this
        // loop is the rebuild's whole cost (a ball reaches 16 to 28 cells at 72).
        const rowBase = 0.000001 + fy2 + fz2;
        for (let x = x0; x < x1; x++) {
          const fx = x * invUnit - ballx;
          const val = strength / (rowBase + fx * fx) - subtract;
          if (val > 0.0) field[yOffset + x] += val * sign;
        }
      }
    }
  }

  /**
   * Three's palette entry at a grid corner, summed on first use after a reset: every recorded ball
   * whose box holds the corner and whose term is positive there adds its colour, falling off
   * smoothly to the cut-off (http://www.geisswerks.com/ryan/BLOBS/blobs.html), in the order the
   * balls were added.
   */
  private paletteAt(cell: number): void {
    if (this.paletteStamp[cell] === this.stamp) return;
    this.paletteStamp[cell] = this.stamp;
    const unit = this.unit;
    const strideY = this.strideY;
    const strideZ = this.strideZ;
    const z = Math.floor(cell / strideZ);
    const y = Math.floor((cell - z * strideZ) / strideY);
    const x = cell - z * strideZ - y * strideY;
    const palette = this.palette;
    const p = cell * 3;
    palette[p] = 0;
    palette[p + 1] = 0;
    palette[p + 2] = 0;
    const balls = this.balls;
    for (let k = 0; k < this.ballCount; k++) {
      const o = k * BALL_STRIDE;
      if (x < balls[o + 12] || x >= balls[o + 13] || y < balls[o + 14] || y >= balls[o + 15]) continue;
      if (z < balls[o + 16] || z >= balls[o + 17]) continue;
      const fx = x / unit - balls[o];
      const fy = y / unit - balls[o + 1];
      const fz = z / unit - balls[o + 2];
      const d2 = fx * fx + fy * fy + fz * fz;
      // Beyond a cut ball's reach its term was never added, nor is its colour.
      if (d2 >= balls[o + 18]) continue;
      const val = balls[o + 7] / (0.000001 + d2) - balls[o + 8];
      if (!(val > 0.0)) continue;
      const dx = x - balls[o + 3];
      const dy = y - balls[o + 4];
      const dz = z - balls[o + 5];
      const ratio = Math.sqrt(dx * dx + dy * dy + dz * dz) / balls[o + 6];
      const contrib = 1 - ratio * ratio * ratio * (ratio * (ratio * 6 - 15) + 10);
      palette[p] += balls[o + 9] * contrib;
      palette[p + 1] += balls[o + 10] * contrib;
      palette[p + 2] += balls[o + 11] * contrib;
    }
  }

  /** Clears the field for the next set of balls. */
  reset(): void {
    if (this.boxMinX < this.boxMaxX && this.boxMinY < this.boxMaxY && this.boxMinZ < this.boxMaxZ) {
      const strideY = this.strideY;
      const strideZ = this.strideZ;
      // The balls wrote inside the box; normals are cached up to one cell beyond it.
      const x0 = Math.max(0, this.boxMinX - 1);
      const x1 = Math.min(this.nx, this.boxMaxX + 1);
      const y0 = Math.max(0, this.boxMinY - 1);
      const y1 = Math.min(this.ny, this.boxMaxY + 1);
      const z0 = Math.max(0, this.boxMinZ - 1);
      const z1 = Math.min(this.nz, this.boxMaxZ + 1);
      const field = this.field;
      const normalCache = this.normalCache;
      for (let z = z0; z < z1; z++) {
        for (let y = y0; y < y1; y++) {
          const row = strideZ * z + strideY * y;
          field.fill(0, row + x0, row + x1);
          normalCache.fill(0, (row + x0) * 3, (row + x1) * 3);
        }
      }
    }
    this.emptyBox();
    this.ballCount = 0;
    // The palette is stamped, not cleared; on the (theoretical) wrap every stamp starts over.
    this.stamp = (this.stamp + 1) >>> 0;
    if (this.stamp === 0) {
      this.paletteStamp.fill(0);
      this.stamp = 1;
    }
  }

  /** Triangulates the field into the vertex buffers and sets the draw range. */
  update(): void {
    this.vertexCount = 0;
    const strideY = this.strideY;
    const strideZ = this.strideZ;
    const field = this.field;
    const isol = this.isolation;
    // three walks cells 1 .. size - 3 (a cell at x spans the corners x and x + 1).
    let x0 = 1;
    let x1 = this.nx - 2;
    let y0 = 1;
    let y1 = this.ny - 2;
    let z0 = 1;
    let z1 = this.nz - 2;
    if (isol > 0) {
      // Outside the balls' box the field is 0, below the iso level: no surface there. A cell
      // whose corners reach the box starts one cell before it.
      x0 = Math.max(x0, this.boxMinX - 1);
      x1 = Math.min(x1, this.boxMaxX);
      y0 = Math.max(y0, this.boxMinY - 1);
      y1 = Math.min(y1, this.boxMaxY);
      z0 = Math.max(z0, this.boxMinZ - 1);
      z1 = Math.min(z1, this.boxMaxZ);
    }

    for (let z = z0; z < z1; z++) {
      const zOffset = strideZ * z;
      for (let y = y0; y < y1; y++) {
        const yOffset = zOffset + strideY * y;
        for (let x = x0; x < x1; x++) {
          const q = yOffset + x;
          let cubeindex = 0;
          if (field[q] < isol) cubeindex |= 1;
          if (field[q + 1] < isol) cubeindex |= 2;
          if (field[q + strideY] < isol) cubeindex |= 8;
          if (field[q + 1 + strideY] < isol) cubeindex |= 4;
          if (field[q + strideZ] < isol) cubeindex |= 16;
          if (field[q + 1 + strideZ] < isol) cubeindex |= 32;
          if (field[q + strideY + strideZ] < isol) cubeindex |= 128;
          if (field[q + 1 + strideY + strideZ] < isol) cubeindex |= 64;
          // Entirely inside or outside the surface (edge mask 0): nothing to draw.
          if (cubeindex !== 0 && cubeindex !== 255) this.polygonize(x, y, z, q, cubeindex, isol);
        }
      }
    }

    const geometry = this.geometry;
    geometry.setDrawRange(0, this.vertexCount);
    geometry.getAttribute("position").needsUpdate = true;
    geometry.getAttribute("normal").needsUpdate = true;
    if (this.colorArray) geometry.getAttribute("color").needsUpdate = true;
  }

  /* -- Polygonisation (three's, through `this`) ------------------------- */

  private polygonize(x: number, y: number, z: number, q: number, cubeindex: number, isol: number): void {
    const bits = EDGE_TABLE[cubeindex];
    if (bits === 0) return;

    const yd = this.strideY;
    const zd = this.strideZ;
    const field = this.field;
    const q1 = q + 1;
    const qy = q + yd;
    const qz = q + zd;
    const q1y = q1 + yd;
    const q1z = q1 + zd;
    const qyz = q + yd + zd;
    const q1yz = q1 + yd + zd;
    const field0 = field[q];
    const field1 = field[q1];
    const field2 = field[qy];
    const field3 = field[q1y];
    const field4 = field[qz];
    const field5 = field[q1z];
    const field6 = field[qyz];
    const field7 = field[q1yz];

    // Local coordinates of the cell (centred, +-n / unit per axis), from the integers only now
    // that it holds surface. On a cube grid this is three's (x - halfsize) / halfsize.
    const d = this.delta;
    const unit = this.unit;
    const fx = (2 * x - this.nx) / unit;
    const fy = (2 * y - this.ny) / unit;
    const fz = (2 * z - this.nz) / unit;
    const fx2 = fx + d;
    const fy2 = fy + d;
    const fz2 = fz + d;

    // Top of the cube.
    if (bits & 1) {
      this.compNorm(q);
      this.compNorm(q1);
      this.vIntX(q * 3, 0, isol, fx, fy, fz, field0, field1, q, q1);
    }
    if (bits & 2) {
      this.compNorm(q1);
      this.compNorm(q1y);
      this.vIntY(q1 * 3, 3, isol, fx2, fy, fz, field1, field3, q1, q1y);
    }
    if (bits & 4) {
      this.compNorm(qy);
      this.compNorm(q1y);
      this.vIntX(qy * 3, 6, isol, fx, fy2, fz, field2, field3, qy, q1y);
    }
    if (bits & 8) {
      this.compNorm(q);
      this.compNorm(qy);
      this.vIntY(q * 3, 9, isol, fx, fy, fz, field0, field2, q, qy);
    }
    // Bottom of the cube.
    if (bits & 16) {
      this.compNorm(qz);
      this.compNorm(q1z);
      this.vIntX(qz * 3, 12, isol, fx, fy, fz2, field4, field5, qz, q1z);
    }
    if (bits & 32) {
      this.compNorm(q1z);
      this.compNorm(q1yz);
      this.vIntY(q1z * 3, 15, isol, fx2, fy, fz2, field5, field7, q1z, q1yz);
    }
    if (bits & 64) {
      this.compNorm(qyz);
      this.compNorm(q1yz);
      this.vIntX(qyz * 3, 18, isol, fx, fy2, fz2, field6, field7, qyz, q1yz);
    }
    if (bits & 128) {
      this.compNorm(qz);
      this.compNorm(qyz);
      this.vIntY(qz * 3, 21, isol, fx, fy, fz2, field4, field6, qz, qyz);
    }
    // Vertical edges of the cube.
    if (bits & 256) {
      this.compNorm(q);
      this.compNorm(qz);
      this.vIntZ(q * 3, 24, isol, fx, fy, fz, field0, field4, q, qz);
    }
    if (bits & 512) {
      this.compNorm(q1);
      this.compNorm(q1z);
      this.vIntZ(q1 * 3, 27, isol, fx2, fy, fz, field1, field5, q1, q1z);
    }
    if (bits & 1024) {
      this.compNorm(q1y);
      this.compNorm(q1yz);
      this.vIntZ(q1y * 3, 30, isol, fx2, fy2, fz, field3, field7, q1y, q1yz);
    }
    if (bits & 2048) {
      this.compNorm(qy);
      this.compNorm(qyz);
      this.vIntZ(qy * 3, 33, isol, fx, fy2, fz, field2, field6, qy, qyz);
    }

    // Re-purpose the corner mask as an offset into the triangle table.
    const base = cubeindex << 4;
    for (let i = 0; TRI_TABLE[base + i] !== -1; i += 3) {
      const o1 = base + i;
      this.posnormtriv(3 * TRI_TABLE[o1], 3 * TRI_TABLE[o1 + 1], 3 * TRI_TABLE[o1 + 2]);
    }
  }

  private compNorm(q: number): void {
    const normalCache = this.normalCache;
    const q3 = q * 3;
    if (normalCache[q3] === 0.0) {
      const field = this.field;
      const yd = this.strideY;
      const zd = this.strideZ;
      normalCache[q3] = field[q - 1] - field[q + 1];
      normalCache[q3 + 1] = field[q - yd] - field[q + yd];
      normalCache[q3 + 2] = field[q - zd] - field[q + zd];
    }
  }

  private vIntX(
    q: number,
    offset: number,
    isol: number,
    x: number,
    y: number,
    z: number,
    valp1: number,
    valp2: number,
    cOffset1: number,
    cOffset2: number,
  ): void {
    const mu = (isol - valp1) / (valp2 - valp1);
    const nc = this.normalCache;
    this.vlist[offset] = x + mu * this.delta;
    this.vlist[offset + 1] = y;
    this.vlist[offset + 2] = z;
    this.nlist[offset] = lerp(nc[q], nc[q + 3], mu);
    this.nlist[offset + 1] = lerp(nc[q + 1], nc[q + 4], mu);
    this.nlist[offset + 2] = lerp(nc[q + 2], nc[q + 5], mu);
    this.edgeColour(offset, cOffset1, cOffset2, mu);
  }

  private vIntY(
    q: number,
    offset: number,
    isol: number,
    x: number,
    y: number,
    z: number,
    valp1: number,
    valp2: number,
    cOffset1: number,
    cOffset2: number,
  ): void {
    const mu = (isol - valp1) / (valp2 - valp1);
    const nc = this.normalCache;
    this.vlist[offset] = x;
    this.vlist[offset + 1] = y + mu * this.delta;
    this.vlist[offset + 2] = z;
    const q2 = q + this.strideY * 3;
    this.nlist[offset] = lerp(nc[q], nc[q2], mu);
    this.nlist[offset + 1] = lerp(nc[q + 1], nc[q2 + 1], mu);
    this.nlist[offset + 2] = lerp(nc[q + 2], nc[q2 + 2], mu);
    this.edgeColour(offset, cOffset1, cOffset2, mu);
  }

  private vIntZ(
    q: number,
    offset: number,
    isol: number,
    x: number,
    y: number,
    z: number,
    valp1: number,
    valp2: number,
    cOffset1: number,
    cOffset2: number,
  ): void {
    const mu = (isol - valp1) / (valp2 - valp1);
    const nc = this.normalCache;
    this.vlist[offset] = x;
    this.vlist[offset + 1] = y;
    this.vlist[offset + 2] = z + mu * this.delta;
    const q2 = q + this.strideZ * 3;
    this.nlist[offset] = lerp(nc[q], nc[q2], mu);
    this.nlist[offset + 1] = lerp(nc[q + 1], nc[q2 + 1], mu);
    this.nlist[offset + 2] = lerp(nc[q + 2], nc[q2 + 2], mu);
    this.edgeColour(offset, cOffset1, cOffset2, mu);
  }

  private edgeColour(offset: number, cOffset1: number, cOffset2: number, mu: number): void {
    if (!this.colorArray) return;
    this.paletteAt(cOffset1);
    this.paletteAt(cOffset2);
    const palette = this.palette;
    const a = cOffset1 * 3;
    const b = cOffset2 * 3;
    this.clist[offset] = lerp(palette[a], palette[b], mu);
    this.clist[offset + 1] = lerp(palette[a + 1], palette[b + 1], mu);
    this.clist[offset + 2] = lerp(palette[a + 2], palette[b + 2], mu);
  }

  /** Appends one triangle from the cell scratch; a full buffer drops it (three wrote past the end). */
  private posnormtriv(o1: number, o2: number, o3: number): void {
    const c = this.vertexCount * 3;
    const positions = this.positionArray;
    if (c + 9 > positions.length) return;
    const vlist = this.vlist;
    const nlist = this.nlist;
    const normals = this.normalArray;

    positions[c] = vlist[o1];
    positions[c + 1] = vlist[o1 + 1];
    positions[c + 2] = vlist[o1 + 2];
    positions[c + 3] = vlist[o2];
    positions[c + 4] = vlist[o2 + 1];
    positions[c + 5] = vlist[o2 + 2];
    positions[c + 6] = vlist[o3];
    positions[c + 7] = vlist[o3 + 1];
    positions[c + 8] = vlist[o3 + 2];

    normals[c] = nlist[o1];
    normals[c + 1] = nlist[o1 + 1];
    normals[c + 2] = nlist[o1 + 2];
    normals[c + 3] = nlist[o2];
    normals[c + 4] = nlist[o2 + 1];
    normals[c + 5] = nlist[o2 + 2];
    normals[c + 6] = nlist[o3];
    normals[c + 7] = nlist[o3 + 1];
    normals[c + 8] = nlist[o3 + 2];

    const colors = this.colorArray;
    if (colors) {
      const clist = this.clist;
      colors[c] = clist[o1];
      colors[c + 1] = clist[o1 + 1];
      colors[c + 2] = clist[o1 + 2];
      colors[c + 3] = clist[o2];
      colors[c + 4] = clist[o2 + 1];
      colors[c + 5] = clist[o2 + 2];
      colors[c + 6] = clist[o3];
      colors[c + 7] = clist[o3 + 1];
      colors[c + 8] = clist[o3 + 2];
    }

    this.vertexCount += 3;
  }
}

/* -- Lookup tables (three.js r186, from Paul Bourke's page) ------------- */

/** Per corner mask: which of the 12 cube edges the surface crosses. */
const EDGE_TABLE = new Int32Array([
  0x0, 0x109, 0x203, 0x30a, 0x406, 0x50f, 0x605, 0x70c, 0x80c, 0x905, 0xa0f, 0xb06, 0xc0a, 0xd03, 0xe09, 0xf00,
  0x190, 0x99, 0x393, 0x29a, 0x596, 0x49f, 0x795, 0x69c, 0x99c, 0x895, 0xb9f, 0xa96, 0xd9a, 0xc93, 0xf99, 0xe90,
  0x230, 0x339, 0x33, 0x13a, 0x636, 0x73f, 0x435, 0x53c, 0xa3c, 0xb35, 0x83f, 0x936, 0xe3a, 0xf33, 0xc39, 0xd30,
  0x3a0, 0x2a9, 0x1a3, 0xaa, 0x7a6, 0x6af, 0x5a5, 0x4ac, 0xbac, 0xaa5, 0x9af, 0x8a6, 0xfaa, 0xea3, 0xda9, 0xca0,
  0x460, 0x569, 0x663, 0x76a, 0x66, 0x16f, 0x265, 0x36c, 0xc6c, 0xd65, 0xe6f, 0xf66, 0x86a, 0x963, 0xa69, 0xb60,
  0x5f0, 0x4f9, 0x7f3, 0x6fa, 0x1f6, 0xff, 0x3f5, 0x2fc, 0xdfc, 0xcf5, 0xfff, 0xef6, 0x9fa, 0x8f3, 0xbf9, 0xaf0,
  0x650, 0x759, 0x453, 0x55a, 0x256, 0x35f, 0x55, 0x15c, 0xe5c, 0xf55, 0xc5f, 0xd56, 0xa5a, 0xb53, 0x859, 0x950,
  0x7c0, 0x6c9, 0x5c3, 0x4ca, 0x3c6, 0x2cf, 0x1c5, 0xcc, 0xfcc, 0xec5, 0xdcf, 0xcc6, 0xbca, 0xac3, 0x9c9, 0x8c0,
  0x8c0, 0x9c9, 0xac3, 0xbca, 0xcc6, 0xdcf, 0xec5, 0xfcc, 0xcc, 0x1c5, 0x2cf, 0x3c6, 0x4ca, 0x5c3, 0x6c9, 0x7c0,
  0x950, 0x859, 0xb53, 0xa5a, 0xd56, 0xc5f, 0xf55, 0xe5c, 0x15c, 0x55, 0x35f, 0x256, 0x55a, 0x453, 0x759, 0x650,
  0xaf0, 0xbf9, 0x8f3, 0x9fa, 0xef6, 0xfff, 0xcf5, 0xdfc, 0x2fc, 0x3f5, 0xff, 0x1f6, 0x6fa, 0x7f3, 0x4f9, 0x5f0,
  0xb60, 0xa69, 0x963, 0x86a, 0xf66, 0xe6f, 0xd65, 0xc6c, 0x36c, 0x265, 0x16f, 0x66, 0x76a, 0x663, 0x569, 0x460,
  0xca0, 0xda9, 0xea3, 0xfaa, 0x8a6, 0x9af, 0xaa5, 0xbac, 0x4ac, 0x5a5, 0x6af, 0x7a6, 0xaa, 0x1a3, 0x2a9, 0x3a0,
  0xd30, 0xc39, 0xf33, 0xe3a, 0x936, 0x83f, 0xb35, 0xa3c, 0x53c, 0x435, 0x73f, 0x636, 0x13a, 0x33, 0x339, 0x230,
  0xe90, 0xf99, 0xc93, 0xd9a, 0xa96, 0xb9f, 0x895, 0x99c, 0x69c, 0x795, 0x49f, 0x596, 0x29a, 0x393, 0x99, 0x190,
  0xf00, 0xe09, 0xd03, 0xc0a, 0xb06, 0xa0f, 0x905, 0x80c, 0x70c, 0x605, 0x50f, 0x406, 0x30a, 0x203, 0x109, 0x0,
]);

/** Per corner mask (x16): up to five triangles as edge-index triples, -1 terminated. */
const TRI_TABLE = new Int32Array([
  -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  0, 8, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  0, 1, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  1, 8, 3, 9, 8, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  1, 2, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  0, 8, 3, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  9, 2, 10, 0, 2, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  2, 8, 3, 2, 10, 8, 10, 9, 8, -1, -1, -1, -1, -1, -1, -1,
  3, 11, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  0, 11, 2, 8, 11, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  1, 9, 0, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  1, 11, 2, 1, 9, 11, 9, 8, 11, -1, -1, -1, -1, -1, -1, -1,
  3, 10, 1, 11, 10, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  0, 10, 1, 0, 8, 10, 8, 11, 10, -1, -1, -1, -1, -1, -1, -1,
  3, 9, 0, 3, 11, 9, 11, 10, 9, -1, -1, -1, -1, -1, -1, -1,
  9, 8, 10, 10, 8, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  4, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  4, 3, 0, 7, 3, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  0, 1, 9, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  4, 1, 9, 4, 7, 1, 7, 3, 1, -1, -1, -1, -1, -1, -1, -1,
  1, 2, 10, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  3, 4, 7, 3, 0, 4, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1,
  9, 2, 10, 9, 0, 2, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1,
  2, 10, 9, 2, 9, 7, 2, 7, 3, 7, 9, 4, -1, -1, -1, -1,
  8, 4, 7, 3, 11, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  11, 4, 7, 11, 2, 4, 2, 0, 4, -1, -1, -1, -1, -1, -1, -1,
  9, 0, 1, 8, 4, 7, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1,
  4, 7, 11, 9, 4, 11, 9, 11, 2, 9, 2, 1, -1, -1, -1, -1,
  3, 10, 1, 3, 11, 10, 7, 8, 4, -1, -1, -1, -1, -1, -1, -1,
  1, 11, 10, 1, 4, 11, 1, 0, 4, 7, 11, 4, -1, -1, -1, -1,
  4, 7, 8, 9, 0, 11, 9, 11, 10, 11, 0, 3, -1, -1, -1, -1,
  4, 7, 11, 4, 11, 9, 9, 11, 10, -1, -1, -1, -1, -1, -1, -1,
  9, 5, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  9, 5, 4, 0, 8, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  0, 5, 4, 1, 5, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  8, 5, 4, 8, 3, 5, 3, 1, 5, -1, -1, -1, -1, -1, -1, -1,
  1, 2, 10, 9, 5, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  3, 0, 8, 1, 2, 10, 4, 9, 5, -1, -1, -1, -1, -1, -1, -1,
  5, 2, 10, 5, 4, 2, 4, 0, 2, -1, -1, -1, -1, -1, -1, -1,
  2, 10, 5, 3, 2, 5, 3, 5, 4, 3, 4, 8, -1, -1, -1, -1,
  9, 5, 4, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  0, 11, 2, 0, 8, 11, 4, 9, 5, -1, -1, -1, -1, -1, -1, -1,
  0, 5, 4, 0, 1, 5, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1,
  2, 1, 5, 2, 5, 8, 2, 8, 11, 4, 8, 5, -1, -1, -1, -1,
  10, 3, 11, 10, 1, 3, 9, 5, 4, -1, -1, -1, -1, -1, -1, -1,
  4, 9, 5, 0, 8, 1, 8, 10, 1, 8, 11, 10, -1, -1, -1, -1,
  5, 4, 0, 5, 0, 11, 5, 11, 10, 11, 0, 3, -1, -1, -1, -1,
  5, 4, 8, 5, 8, 10, 10, 8, 11, -1, -1, -1, -1, -1, -1, -1,
  9, 7, 8, 5, 7, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  9, 3, 0, 9, 5, 3, 5, 7, 3, -1, -1, -1, -1, -1, -1, -1,
  0, 7, 8, 0, 1, 7, 1, 5, 7, -1, -1, -1, -1, -1, -1, -1,
  1, 5, 3, 3, 5, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  9, 7, 8, 9, 5, 7, 10, 1, 2, -1, -1, -1, -1, -1, -1, -1,
  10, 1, 2, 9, 5, 0, 5, 3, 0, 5, 7, 3, -1, -1, -1, -1,
  8, 0, 2, 8, 2, 5, 8, 5, 7, 10, 5, 2, -1, -1, -1, -1,
  2, 10, 5, 2, 5, 3, 3, 5, 7, -1, -1, -1, -1, -1, -1, -1,
  7, 9, 5, 7, 8, 9, 3, 11, 2, -1, -1, -1, -1, -1, -1, -1,
  9, 5, 7, 9, 7, 2, 9, 2, 0, 2, 7, 11, -1, -1, -1, -1,
  2, 3, 11, 0, 1, 8, 1, 7, 8, 1, 5, 7, -1, -1, -1, -1,
  11, 2, 1, 11, 1, 7, 7, 1, 5, -1, -1, -1, -1, -1, -1, -1,
  9, 5, 8, 8, 5, 7, 10, 1, 3, 10, 3, 11, -1, -1, -1, -1,
  5, 7, 0, 5, 0, 9, 7, 11, 0, 1, 0, 10, 11, 10, 0, -1,
  11, 10, 0, 11, 0, 3, 10, 5, 0, 8, 0, 7, 5, 7, 0, -1,
  11, 10, 5, 7, 11, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  10, 6, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  0, 8, 3, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  9, 0, 1, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  1, 8, 3, 1, 9, 8, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1,
  1, 6, 5, 2, 6, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  1, 6, 5, 1, 2, 6, 3, 0, 8, -1, -1, -1, -1, -1, -1, -1,
  9, 6, 5, 9, 0, 6, 0, 2, 6, -1, -1, -1, -1, -1, -1, -1,
  5, 9, 8, 5, 8, 2, 5, 2, 6, 3, 2, 8, -1, -1, -1, -1,
  2, 3, 11, 10, 6, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  11, 0, 8, 11, 2, 0, 10, 6, 5, -1, -1, -1, -1, -1, -1, -1,
  0, 1, 9, 2, 3, 11, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1,
  5, 10, 6, 1, 9, 2, 9, 11, 2, 9, 8, 11, -1, -1, -1, -1,
  6, 3, 11, 6, 5, 3, 5, 1, 3, -1, -1, -1, -1, -1, -1, -1,
  0, 8, 11, 0, 11, 5, 0, 5, 1, 5, 11, 6, -1, -1, -1, -1,
  3, 11, 6, 0, 3, 6, 0, 6, 5, 0, 5, 9, -1, -1, -1, -1,
  6, 5, 9, 6, 9, 11, 11, 9, 8, -1, -1, -1, -1, -1, -1, -1,
  5, 10, 6, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  4, 3, 0, 4, 7, 3, 6, 5, 10, -1, -1, -1, -1, -1, -1, -1,
  1, 9, 0, 5, 10, 6, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1,
  10, 6, 5, 1, 9, 7, 1, 7, 3, 7, 9, 4, -1, -1, -1, -1,
  6, 1, 2, 6, 5, 1, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1,
  1, 2, 5, 5, 2, 6, 3, 0, 4, 3, 4, 7, -1, -1, -1, -1,
  8, 4, 7, 9, 0, 5, 0, 6, 5, 0, 2, 6, -1, -1, -1, -1,
  7, 3, 9, 7, 9, 4, 3, 2, 9, 5, 9, 6, 2, 6, 9, -1,
  3, 11, 2, 7, 8, 4, 10, 6, 5, -1, -1, -1, -1, -1, -1, -1,
  5, 10, 6, 4, 7, 2, 4, 2, 0, 2, 7, 11, -1, -1, -1, -1,
  0, 1, 9, 4, 7, 8, 2, 3, 11, 5, 10, 6, -1, -1, -1, -1,
  9, 2, 1, 9, 11, 2, 9, 4, 11, 7, 11, 4, 5, 10, 6, -1,
  8, 4, 7, 3, 11, 5, 3, 5, 1, 5, 11, 6, -1, -1, -1, -1,
  5, 1, 11, 5, 11, 6, 1, 0, 11, 7, 11, 4, 0, 4, 11, -1,
  0, 5, 9, 0, 6, 5, 0, 3, 6, 11, 6, 3, 8, 4, 7, -1,
  6, 5, 9, 6, 9, 11, 4, 7, 9, 7, 11, 9, -1, -1, -1, -1,
  10, 4, 9, 6, 4, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  4, 10, 6, 4, 9, 10, 0, 8, 3, -1, -1, -1, -1, -1, -1, -1,
  10, 0, 1, 10, 6, 0, 6, 4, 0, -1, -1, -1, -1, -1, -1, -1,
  8, 3, 1, 8, 1, 6, 8, 6, 4, 6, 1, 10, -1, -1, -1, -1,
  1, 4, 9, 1, 2, 4, 2, 6, 4, -1, -1, -1, -1, -1, -1, -1,
  3, 0, 8, 1, 2, 9, 2, 4, 9, 2, 6, 4, -1, -1, -1, -1,
  0, 2, 4, 4, 2, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  8, 3, 2, 8, 2, 4, 4, 2, 6, -1, -1, -1, -1, -1, -1, -1,
  10, 4, 9, 10, 6, 4, 11, 2, 3, -1, -1, -1, -1, -1, -1, -1,
  0, 8, 2, 2, 8, 11, 4, 9, 10, 4, 10, 6, -1, -1, -1, -1,
  3, 11, 2, 0, 1, 6, 0, 6, 4, 6, 1, 10, -1, -1, -1, -1,
  6, 4, 1, 6, 1, 10, 4, 8, 1, 2, 1, 11, 8, 11, 1, -1,
  9, 6, 4, 9, 3, 6, 9, 1, 3, 11, 6, 3, -1, -1, -1, -1,
  8, 11, 1, 8, 1, 0, 11, 6, 1, 9, 1, 4, 6, 4, 1, -1,
  3, 11, 6, 3, 6, 0, 0, 6, 4, -1, -1, -1, -1, -1, -1, -1,
  6, 4, 8, 11, 6, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  7, 10, 6, 7, 8, 10, 8, 9, 10, -1, -1, -1, -1, -1, -1, -1,
  0, 7, 3, 0, 10, 7, 0, 9, 10, 6, 7, 10, -1, -1, -1, -1,
  10, 6, 7, 1, 10, 7, 1, 7, 8, 1, 8, 0, -1, -1, -1, -1,
  10, 6, 7, 10, 7, 1, 1, 7, 3, -1, -1, -1, -1, -1, -1, -1,
  1, 2, 6, 1, 6, 8, 1, 8, 9, 8, 6, 7, -1, -1, -1, -1,
  2, 6, 9, 2, 9, 1, 6, 7, 9, 0, 9, 3, 7, 3, 9, -1,
  7, 8, 0, 7, 0, 6, 6, 0, 2, -1, -1, -1, -1, -1, -1, -1,
  7, 3, 2, 6, 7, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  2, 3, 11, 10, 6, 8, 10, 8, 9, 8, 6, 7, -1, -1, -1, -1,
  2, 0, 7, 2, 7, 11, 0, 9, 7, 6, 7, 10, 9, 10, 7, -1,
  1, 8, 0, 1, 7, 8, 1, 10, 7, 6, 7, 10, 2, 3, 11, -1,
  11, 2, 1, 11, 1, 7, 10, 6, 1, 6, 7, 1, -1, -1, -1, -1,
  8, 9, 6, 8, 6, 7, 9, 1, 6, 11, 6, 3, 1, 3, 6, -1,
  0, 9, 1, 11, 6, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  7, 8, 0, 7, 0, 6, 3, 11, 0, 11, 6, 0, -1, -1, -1, -1,
  7, 11, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  7, 6, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  3, 0, 8, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  0, 1, 9, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  8, 1, 9, 8, 3, 1, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1,
  10, 1, 2, 6, 11, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  1, 2, 10, 3, 0, 8, 6, 11, 7, -1, -1, -1, -1, -1, -1, -1,
  2, 9, 0, 2, 10, 9, 6, 11, 7, -1, -1, -1, -1, -1, -1, -1,
  6, 11, 7, 2, 10, 3, 10, 8, 3, 10, 9, 8, -1, -1, -1, -1,
  7, 2, 3, 6, 2, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  7, 0, 8, 7, 6, 0, 6, 2, 0, -1, -1, -1, -1, -1, -1, -1,
  2, 7, 6, 2, 3, 7, 0, 1, 9, -1, -1, -1, -1, -1, -1, -1,
  1, 6, 2, 1, 8, 6, 1, 9, 8, 8, 7, 6, -1, -1, -1, -1,
  10, 7, 6, 10, 1, 7, 1, 3, 7, -1, -1, -1, -1, -1, -1, -1,
  10, 7, 6, 1, 7, 10, 1, 8, 7, 1, 0, 8, -1, -1, -1, -1,
  0, 3, 7, 0, 7, 10, 0, 10, 9, 6, 10, 7, -1, -1, -1, -1,
  7, 6, 10, 7, 10, 8, 8, 10, 9, -1, -1, -1, -1, -1, -1, -1,
  6, 8, 4, 11, 8, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  3, 6, 11, 3, 0, 6, 0, 4, 6, -1, -1, -1, -1, -1, -1, -1,
  8, 6, 11, 8, 4, 6, 9, 0, 1, -1, -1, -1, -1, -1, -1, -1,
  9, 4, 6, 9, 6, 3, 9, 3, 1, 11, 3, 6, -1, -1, -1, -1,
  6, 8, 4, 6, 11, 8, 2, 10, 1, -1, -1, -1, -1, -1, -1, -1,
  1, 2, 10, 3, 0, 11, 0, 6, 11, 0, 4, 6, -1, -1, -1, -1,
  4, 11, 8, 4, 6, 11, 0, 2, 9, 2, 10, 9, -1, -1, -1, -1,
  10, 9, 3, 10, 3, 2, 9, 4, 3, 11, 3, 6, 4, 6, 3, -1,
  8, 2, 3, 8, 4, 2, 4, 6, 2, -1, -1, -1, -1, -1, -1, -1,
  0, 4, 2, 4, 6, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  1, 9, 0, 2, 3, 4, 2, 4, 6, 4, 3, 8, -1, -1, -1, -1,
  1, 9, 4, 1, 4, 2, 2, 4, 6, -1, -1, -1, -1, -1, -1, -1,
  8, 1, 3, 8, 6, 1, 8, 4, 6, 6, 10, 1, -1, -1, -1, -1,
  10, 1, 0, 10, 0, 6, 6, 0, 4, -1, -1, -1, -1, -1, -1, -1,
  4, 6, 3, 4, 3, 8, 6, 10, 3, 0, 3, 9, 10, 9, 3, -1,
  10, 9, 4, 6, 10, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  4, 9, 5, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  0, 8, 3, 4, 9, 5, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1,
  5, 0, 1, 5, 4, 0, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1,
  11, 7, 6, 8, 3, 4, 3, 5, 4, 3, 1, 5, -1, -1, -1, -1,
  9, 5, 4, 10, 1, 2, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1,
  6, 11, 7, 1, 2, 10, 0, 8, 3, 4, 9, 5, -1, -1, -1, -1,
  7, 6, 11, 5, 4, 10, 4, 2, 10, 4, 0, 2, -1, -1, -1, -1,
  3, 4, 8, 3, 5, 4, 3, 2, 5, 10, 5, 2, 11, 7, 6, -1,
  7, 2, 3, 7, 6, 2, 5, 4, 9, -1, -1, -1, -1, -1, -1, -1,
  9, 5, 4, 0, 8, 6, 0, 6, 2, 6, 8, 7, -1, -1, -1, -1,
  3, 6, 2, 3, 7, 6, 1, 5, 0, 5, 4, 0, -1, -1, -1, -1,
  6, 2, 8, 6, 8, 7, 2, 1, 8, 4, 8, 5, 1, 5, 8, -1,
  9, 5, 4, 10, 1, 6, 1, 7, 6, 1, 3, 7, -1, -1, -1, -1,
  1, 6, 10, 1, 7, 6, 1, 0, 7, 8, 7, 0, 9, 5, 4, -1,
  4, 0, 10, 4, 10, 5, 0, 3, 10, 6, 10, 7, 3, 7, 10, -1,
  7, 6, 10, 7, 10, 8, 5, 4, 10, 4, 8, 10, -1, -1, -1, -1,
  6, 9, 5, 6, 11, 9, 11, 8, 9, -1, -1, -1, -1, -1, -1, -1,
  3, 6, 11, 0, 6, 3, 0, 5, 6, 0, 9, 5, -1, -1, -1, -1,
  0, 11, 8, 0, 5, 11, 0, 1, 5, 5, 6, 11, -1, -1, -1, -1,
  6, 11, 3, 6, 3, 5, 5, 3, 1, -1, -1, -1, -1, -1, -1, -1,
  1, 2, 10, 9, 5, 11, 9, 11, 8, 11, 5, 6, -1, -1, -1, -1,
  0, 11, 3, 0, 6, 11, 0, 9, 6, 5, 6, 9, 1, 2, 10, -1,
  11, 8, 5, 11, 5, 6, 8, 0, 5, 10, 5, 2, 0, 2, 5, -1,
  6, 11, 3, 6, 3, 5, 2, 10, 3, 10, 5, 3, -1, -1, -1, -1,
  5, 8, 9, 5, 2, 8, 5, 6, 2, 3, 8, 2, -1, -1, -1, -1,
  9, 5, 6, 9, 6, 0, 0, 6, 2, -1, -1, -1, -1, -1, -1, -1,
  1, 5, 8, 1, 8, 0, 5, 6, 8, 3, 8, 2, 6, 2, 8, -1,
  1, 5, 6, 2, 1, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  1, 3, 6, 1, 6, 10, 3, 8, 6, 5, 6, 9, 8, 9, 6, -1,
  10, 1, 0, 10, 0, 6, 9, 5, 0, 5, 6, 0, -1, -1, -1, -1,
  0, 3, 8, 5, 6, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  10, 5, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  11, 5, 10, 7, 5, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  11, 5, 10, 11, 7, 5, 8, 3, 0, -1, -1, -1, -1, -1, -1, -1,
  5, 11, 7, 5, 10, 11, 1, 9, 0, -1, -1, -1, -1, -1, -1, -1,
  10, 7, 5, 10, 11, 7, 9, 8, 1, 8, 3, 1, -1, -1, -1, -1,
  11, 1, 2, 11, 7, 1, 7, 5, 1, -1, -1, -1, -1, -1, -1, -1,
  0, 8, 3, 1, 2, 7, 1, 7, 5, 7, 2, 11, -1, -1, -1, -1,
  9, 7, 5, 9, 2, 7, 9, 0, 2, 2, 11, 7, -1, -1, -1, -1,
  7, 5, 2, 7, 2, 11, 5, 9, 2, 3, 2, 8, 9, 8, 2, -1,
  2, 5, 10, 2, 3, 5, 3, 7, 5, -1, -1, -1, -1, -1, -1, -1,
  8, 2, 0, 8, 5, 2, 8, 7, 5, 10, 2, 5, -1, -1, -1, -1,
  9, 0, 1, 5, 10, 3, 5, 3, 7, 3, 10, 2, -1, -1, -1, -1,
  9, 8, 2, 9, 2, 1, 8, 7, 2, 10, 2, 5, 7, 5, 2, -1,
  1, 3, 5, 3, 7, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  0, 8, 7, 0, 7, 1, 1, 7, 5, -1, -1, -1, -1, -1, -1, -1,
  9, 0, 3, 9, 3, 5, 5, 3, 7, -1, -1, -1, -1, -1, -1, -1,
  9, 8, 7, 5, 9, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  5, 8, 4, 5, 10, 8, 10, 11, 8, -1, -1, -1, -1, -1, -1, -1,
  5, 0, 4, 5, 11, 0, 5, 10, 11, 11, 3, 0, -1, -1, -1, -1,
  0, 1, 9, 8, 4, 10, 8, 10, 11, 10, 4, 5, -1, -1, -1, -1,
  10, 11, 4, 10, 4, 5, 11, 3, 4, 9, 4, 1, 3, 1, 4, -1,
  2, 5, 1, 2, 8, 5, 2, 11, 8, 4, 5, 8, -1, -1, -1, -1,
  0, 4, 11, 0, 11, 3, 4, 5, 11, 2, 11, 1, 5, 1, 11, -1,
  0, 2, 5, 0, 5, 9, 2, 11, 5, 4, 5, 8, 11, 8, 5, -1,
  9, 4, 5, 2, 11, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  2, 5, 10, 3, 5, 2, 3, 4, 5, 3, 8, 4, -1, -1, -1, -1,
  5, 10, 2, 5, 2, 4, 4, 2, 0, -1, -1, -1, -1, -1, -1, -1,
  3, 10, 2, 3, 5, 10, 3, 8, 5, 4, 5, 8, 0, 1, 9, -1,
  5, 10, 2, 5, 2, 4, 1, 9, 2, 9, 4, 2, -1, -1, -1, -1,
  8, 4, 5, 8, 5, 3, 3, 5, 1, -1, -1, -1, -1, -1, -1, -1,
  0, 4, 5, 1, 0, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  8, 4, 5, 8, 5, 3, 9, 0, 5, 0, 3, 5, -1, -1, -1, -1,
  9, 4, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  4, 11, 7, 4, 9, 11, 9, 10, 11, -1, -1, -1, -1, -1, -1, -1,
  0, 8, 3, 4, 9, 7, 9, 11, 7, 9, 10, 11, -1, -1, -1, -1,
  1, 10, 11, 1, 11, 4, 1, 4, 0, 7, 4, 11, -1, -1, -1, -1,
  3, 1, 4, 3, 4, 8, 1, 10, 4, 7, 4, 11, 10, 11, 4, -1,
  4, 11, 7, 9, 11, 4, 9, 2, 11, 9, 1, 2, -1, -1, -1, -1,
  9, 7, 4, 9, 11, 7, 9, 1, 11, 2, 11, 1, 0, 8, 3, -1,
  11, 7, 4, 11, 4, 2, 2, 4, 0, -1, -1, -1, -1, -1, -1, -1,
  11, 7, 4, 11, 4, 2, 8, 3, 4, 3, 2, 4, -1, -1, -1, -1,
  2, 9, 10, 2, 7, 9, 2, 3, 7, 7, 4, 9, -1, -1, -1, -1,
  9, 10, 7, 9, 7, 4, 10, 2, 7, 8, 7, 0, 2, 0, 7, -1,
  3, 7, 10, 3, 10, 2, 7, 4, 10, 1, 10, 0, 4, 0, 10, -1,
  1, 10, 2, 8, 7, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  4, 9, 1, 4, 1, 7, 7, 1, 3, -1, -1, -1, -1, -1, -1, -1,
  4, 9, 1, 4, 1, 7, 0, 8, 1, 8, 7, 1, -1, -1, -1, -1,
  4, 0, 3, 7, 4, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  4, 8, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  9, 10, 8, 10, 11, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  3, 0, 9, 3, 9, 11, 11, 9, 10, -1, -1, -1, -1, -1, -1, -1,
  0, 1, 10, 0, 10, 8, 8, 10, 11, -1, -1, -1, -1, -1, -1, -1,
  3, 1, 10, 11, 3, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  1, 2, 11, 1, 11, 9, 9, 11, 8, -1, -1, -1, -1, -1, -1, -1,
  3, 0, 9, 3, 9, 11, 1, 2, 9, 2, 11, 9, -1, -1, -1, -1,
  0, 2, 11, 8, 0, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  3, 2, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  2, 3, 8, 2, 8, 10, 10, 8, 9, -1, -1, -1, -1, -1, -1, -1,
  9, 10, 2, 0, 9, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  2, 3, 8, 2, 8, 10, 0, 1, 8, 1, 10, 8, -1, -1, -1, -1,
  1, 10, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  1, 3, 8, 9, 1, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  0, 9, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  0, 3, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
]);
