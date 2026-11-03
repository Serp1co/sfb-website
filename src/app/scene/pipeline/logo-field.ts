/*
 * The electric logos' signed distance fields: the hero logo's (v3.2) and every partner and
 * customer mark's (v3.3), in one small atlas. The composite traces each logo's outline from its
 * field (the outline, glow, hairline and crackle), so round a logo it needs, at every pixel,
 * how far the silhouette is and which way it lies (the field's gradient); the overlay's bolts
 * (logo-arcs.ts) need the same on the CPU, to jump across a logo's gaps and never over its glyphs.
 *
 * Built once per visit, off the frame: each logo's SVG is read (cached: the page already shows it)
 * and given an explicit size equal to its viewBox, so the raster maps the viewBox exactly however
 * the file sizes itself, then its alpha silhouette is rasterised over the viewBox plus a margin,
 * an exact Euclidean distance transform (Felzenszwalb and Huttenlocher's lower envelope of
 * parabolas, one pass per column then per row) runs both ways, to the nearest covered and to the
 * nearest clear pixel, seeded by the antialiased coverage so edges land between pixels (as
 * mapbox's tiny-sdf does), and the signed distance is halved (2x2 means) into a half-float slot:
 * R16F filters in WebGL2 and keeps the gradient smooth, where 8 bits made the outline's normals
 * jitter by several degrees per texel. Units are each logo's viewBox units, negative inside a
 * glyph, row 0 at the top. The hero is built and uploaded first (its outline is its legibility),
 * the marks after it, one per idle callback. The hero tagline's field (v3.4) is built from the
 * page's own text by tagline-field.ts, with the same transform (slotFromRaster, without the outline
 * points: no bolt rides it), and put into the atlas.
 */

import { DataTexture, DataUtils, HalfFloatType, LinearFilter, RedFormat } from "three";
import { LOGO_ARCS, LOGO_FIELD, MARK_FIELD } from "./glass-config";

/** An unseeded squared distance (tiny-sdf's): huge, yet exact under the transform's subtraction. */
const INF = 1e20;

/** Each raster waits for idle time this long at most: the transform is a one-off ~5-30 ms task per logo. */
const IDLE_TIMEOUT_MS = 1500;

/** The hero's padded viewBox, in units: its field's extent. */
const PADDED_WIDTH = LOGO_FIELD.viewWidth + 2 * LOGO_FIELD.padUnits;
const PADDED_HEIGHT = LOGO_FIELD.viewHeight + 2 * LOGO_FIELD.padUnits;

/** The hero's raster size, even both ways so it halves exactly into its slot. */
export const LOGO_RASTER = {
  width: 2 * Math.round((PADDED_WIDTH * LOGO_FIELD.rasterPerUnit) / 2),
  height: 2 * Math.round((PADDED_HEIGHT * LOGO_FIELD.rasterPerUnit) / 2),
} as const;

/** Atlas rows are this wide at least (texels); slots are shelf-packed into them. */
const ATLAS_MIN_WIDTH = 1024;

/** Texels between slots, so no slot's filtering ever reads its neighbour (the shader also clamps inside its own). */
const ATLAS_GUTTER = 2;

/** What the atlas holds between slots: far outside any outline. */
const ATLAS_FAR_UNITS = 1000;

/** Outline points kept per logo at most (the hero's ~2,500-unit outline at 3.5 units apart is ~700). */
const MAX_EDGES = 1600;

/** Outline points this far apart (CSS px of the logo as designed): fine enough for bolts to land anywhere on it. */
const EDGE_SPACING_PX = 2.5;

/** The hero's CSS px per viewBox unit as designed (30rem at the widest over 601 units): its lengths in px are counted at this. */
const HERO_DESIGN_PX_PER_UNIT = 480 / LOGO_FIELD.viewWidth;

/** Two outline points face each other across a gap when both normals are within ~55 degrees of the line between them. */
const GAP_FACING = 0.57;

/** A gap's straight line must stay this far outside the silhouette (a share of the viewBox height, ~1 px at the hero). */
const GAP_CLEAR_SHARE = 0.005;

/** Points sampled along a gap's line to check it stays outside the glyphs. */
const GAP_SAMPLES = 6;

/** Gap pairs kept per logo at most. */
const MAX_GAPS = 600;

/** One signed distance per texel, in viewBox units (negative inside a glyph), row 0 at the top. */
export interface LogoGrid {
  width: number;
  height: number;
  data: Float32Array;
}

/** One logo's field in the atlas. */
export interface LogoSlot {
  src: string;
  /** The viewBox's size (units): the logo's box on screen maps onto it. */
  viewWidth: number;
  viewHeight: number;
  /** The field's margin round the viewBox, in units. */
  pad: number;
  /** CSS px per unit at the size the logo is designed to show (its lengths in px are counted at this). */
  designPxPerUnit: number;
  /** The size its bolts are scaled to, in units: a logo's viewBox height, the tagline's line height. */
  sizeUnits: number;
  /** The halved signed distance over the padded viewBox. */
  grid: LogoGrid;
  /** The grid as half floats, made once on its first upload (a re-pack only copies rows). */
  half?: Uint16Array;
  /** The grid's first texel in the atlas (set when packed). */
  atlasX: number;
  atlasY: number;
  /** Outline points: x, y (units from the viewBox's top-left), outward normal x, y; four floats each (none on a slot no bolt rides: the tagline's). */
  edges: Float32Array;
  /** Pairs of outline points (indices into edges) facing each other across a gap or a counter. */
  gaps: Uint16Array;
}

/** What sampling a slot's field needs. */
export type LogoFieldView = Pick<LogoSlot, "grid" | "viewWidth" | "viewHeight" | "pad">;

/** What a slot is built from. */
interface SlotSpec {
  src: string;
  image: HTMLImageElement;
  viewWidth: number;
  viewHeight: number;
  pad: number;
  rasterPerUnit: number;
  designPxPerUnit: number;
  /** Coverage from this alpha up is solid (1: the antialiased coverage as it is). */
  solidAlpha: number;
}

/**
 * One line of the squared distance transform, in place: grid[offset + q * stride] for q < length
 * becomes min over r of (q - r)^2 + grid[offset + r * stride]. f, v, z: scratch of length + 1.
 */
function transformLine(grid: Float64Array, offset: number, stride: number, length: number, f: Float64Array, v: Uint16Array, z: Float64Array): void {
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  f[0] = grid[offset];
  for (let q = 1, k = 0, s = 0; q < length; q++) {
    f[q] = grid[offset + q * stride];
    const q2 = q * q;
    do {
      const r = v[k];
      s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2;
    } while (s <= z[k] && --k > -1);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < length; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k];
    const qr = q - r;
    grid[offset + q * stride] = f[r] + qr * qr;
  }
}

/** The 2D squared distance transform of a width x height grid, columns then rows. */
function transformGrid(grid: Float64Array, width: number, height: number): void {
  const longest = Math.max(width, height);
  const f = new Float64Array(longest);
  const v = new Uint16Array(longest);
  const z = new Float64Array(longest + 1);
  for (let x = 0; x < width; x++) transformLine(grid, x, width, height, f, v, z);
  for (let y = 0; y < height; y++) transformLine(grid, y * width, 1, width, f, v, z);
}

/**
 * The signed distance field of an RGBA raster's alpha (the silhouette), halved into texels, in
 * units (unitsPerPx: viewBox units per raster px). solidAlpha: coverage from this alpha up counts
 * as solid (1 keeps the coverage as it is). Exported for the verification harness.
 */
export function signedField(rgba: Uint8ClampedArray, width: number, height: number, unitsPerPx: number, solidAlpha = 1): LogoGrid {
  const size = width * height;
  const outer = new Float64Array(size);
  const inner = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const a = Math.min(rgba[4 * i + 3] / 255 / solidAlpha, 1);
    // Covered pixels seed the distance outside, clear ones the distance inside; a partly covered
    // edge pixel seeds both with how far its coverage puts the edge from its centre.
    outer[i] = a === 1 ? 0 : a === 0 ? INF : Math.max(0, 0.5 - a) ** 2;
    inner[i] = a === 1 ? INF : a === 0 ? 0 : Math.max(0, a - 0.5) ** 2;
  }
  transformGrid(outer, width, height);
  transformGrid(inner, width, height);
  const half = { width: width / 2, height: height / 2 };
  const data = new Float32Array(half.width * half.height);
  const scale = unitsPerPx / 4;
  const signed = (j: number): number => Math.sqrt(outer[j]) - Math.sqrt(inner[j]);
  for (let y = 0; y < half.height; y++) {
    for (let x = 0; x < half.width; x++) {
      const i = 2 * y * width + 2 * x;
      data[y * half.width + x] = (signed(i) + signed(i + 1) + signed(i + width) + signed(i + width + 1)) * scale;
    }
  }
  return { ...half, data };
}

/** A spec's raster size: the padded viewBox at rasterPerUnit, even both ways. */
function rasterSize(spec: Pick<SlotSpec, "viewWidth" | "viewHeight" | "pad" | "rasterPerUnit">): { width: number; height: number } {
  return {
    width: 2 * Math.max(Math.round(((spec.viewWidth + 2 * spec.pad) * spec.rasterPerUnit) / 2), 2),
    height: 2 * Math.max(Math.round(((spec.viewHeight + 2 * spec.pad) * spec.rasterPerUnit) / 2), 2),
  };
}

/** A logo's silhouette over its padded viewBox (null without a 2D canvas). */
function rasterize(spec: Pick<SlotSpec, "image" | "viewWidth" | "viewHeight" | "pad" | "rasterPerUnit">): ImageData | null {
  const { width, height } = rasterSize(spec);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  const sx = width / (spec.viewWidth + 2 * spec.pad);
  const sy = height / (spec.viewHeight + 2 * spec.pad);
  // An SVG drawn at a size re-rasterises at it: a crisp silhouette, not a scaled bitmap.
  context.drawImage(spec.image, spec.pad * sx, spec.pad * sy, spec.viewWidth * sx, spec.viewHeight * sy);
  return context.getImageData(0, 0, width, height);
}

/** Viewbox units per raster px: sx and sy differ by a fraction of a percent, so one isotropic scale. */
function unitsPerRasterPx(spec: Pick<SlotSpec, "viewWidth" | "viewHeight" | "pad" | "rasterPerUnit">): number {
  const { width, height } = rasterSize(spec);
  return 1 / Math.sqrt((width / (spec.viewWidth + 2 * spec.pad)) * (height / (spec.viewHeight + 2 * spec.pad)));
}

const HERO_SPEC = {
  viewWidth: LOGO_FIELD.viewWidth,
  viewHeight: LOGO_FIELD.viewHeight,
  pad: LOGO_FIELD.padUnits,
  rasterPerUnit: LOGO_FIELD.rasterPerUnit,
} as const;

/** The hero logo's silhouette over its padded viewBox, at LOGO_RASTER (null without a 2D canvas). */
export function rasterizeLogo(image: HTMLImageElement): ImageData | null {
  return rasterize({ ...HERO_SPEC, image });
}

/** The hero's whole build from its decoded image (exported for the verification harness). */
export function buildLogoGrid(image: HTMLImageElement): LogoGrid | null {
  const raster = rasterizeLogo(image);
  if (!raster) return null;
  return signedField(raster.data, raster.width, raster.height, unitsPerRasterPx(HERO_SPEC));
}

/** The grid's value at fractional texel (tx, ty), bilinear, clamped to the grid. */
function gridAt(grid: LogoGrid, tx: number, ty: number): number {
  const x = Math.min(Math.max(tx, 0), grid.width - 1);
  const y = Math.min(Math.max(ty, 0), grid.height - 1);
  const x0 = Math.min(Math.floor(x), grid.width - 2);
  const y0 = Math.min(Math.floor(y), grid.height - 2);
  const fx = x - x0;
  const fy = y - y0;
  const d = grid.data;
  const i = y0 * grid.width + x0;
  const top = d[i] + (d[i + 1] - d[i]) * fx;
  const bottom = d[i + grid.width] + (d[i + grid.width + 1] - d[i + grid.width]) * fx;
  return top + (bottom - top) * fy;
}

/**
 * The signed distance (units, negative inside a glyph) at (ux, uy), units from the viewBox's
 * top-left, as the composite reads it: past the padded field it adds the distance to the field's
 * box, an upper bound that keeps growing smoothly.
 */
export function slotDistance(slot: LogoFieldView, ux: number, uy: number): number {
  const grid = slot.grid;
  const unitX = (slot.viewWidth + 2 * slot.pad) / grid.width;
  const unitY = (slot.viewHeight + 2 * slot.pad) / grid.height;
  const tx = (ux + slot.pad) / unitX - 0.5;
  const ty = (uy + slot.pad) / unitY - 0.5;
  const cx = Math.min(Math.max(tx, 0), grid.width - 1);
  const cy = Math.min(Math.max(ty, 0), grid.height - 1);
  return gridAt(grid, cx, cy) + Math.hypot((tx - cx) * unitX, (ty - cy) * unitY);
}

/** The outward unit normal of the field at (ux, uy) (units), into out; (0, -1) where it is flat. */
export function slotNormal(slot: LogoFieldView, ux: number, uy: number, out: { x: number; y: number }): void {
  const hx = (slot.viewWidth + 2 * slot.pad) / slot.grid.width;
  const hy = (slot.viewHeight + 2 * slot.pad) / slot.grid.height;
  const gx = (slotDistance(slot, ux + hx, uy) - slotDistance(slot, ux - hx, uy)) / (2 * hx);
  const gy = (slotDistance(slot, ux, uy + hy) - slotDistance(slot, ux, uy - hy)) / (2 * hy);
  const length = Math.hypot(gx, gy);
  if (length > 1e-6) {
    out.x = gx / length;
    out.y = gy / length;
  } else {
    out.x = 0;
    out.y = -1;
  }
}

/** The outline: every zero crossing between neighbouring texels, thinned to one per spacing cell, with its normal. */
function traceOutline(slot: LogoFieldView, spacing: number, maxEdges: number): Float32Array {
  const { width, height, data } = slot.grid;
  const unitX = (slot.viewWidth + 2 * slot.pad) / width;
  const unitY = (slot.viewHeight + 2 * slot.pad) / height;
  const cellsAcross = Math.ceil((slot.viewWidth + 2 * slot.pad) / spacing) + 2;
  const taken = new Set<number>();
  const points: number[] = [];
  const normal = { x: 0, y: 0 };
  const keep = (tx: number, ty: number): void => {
    if (points.length >= 4 * maxEdges) return;
    const x = (tx + 0.5) * unitX - slot.pad;
    const y = (ty + 0.5) * unitY - slot.pad;
    const key = Math.floor((y + slot.pad) / spacing) * cellsAcross + Math.floor((x + slot.pad) / spacing);
    if (taken.has(key)) return;
    taken.add(key);
    slotNormal(slot, x, y, normal);
    points.push(x, y, normal.x, normal.y);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[y * width + x];
      if (x + 1 < width) {
        const b = data[y * width + x + 1];
        if (a < 0 !== b < 0) keep(x + a / (a - b), y);
      }
      if (y + 1 < height) {
        const c = data[(y + 1) * width + x];
        if (a < 0 !== c < 0) keep(x, y + a / (a - c));
      }
    }
  }
  return Float32Array.from(points);
}

/** Where a logo's bolts may jump: a gap's length range and clearance (units), and how many pairs to keep. */
export interface GapRule {
  min: number;
  max: number;
  /** The straight line between the two points stays this far outside the silhouette. */
  clear: number;
  maxPairs: number;
}

/**
 * Pairs of outline points facing each other across a gap or a counter: for each point, the nearest
 * other one within the rule's range whose normal looks back at it, with the straight line between
 * them clear of the glyphs. These are where the bolts jump (the hero's S-F and F-B gaps, the B's
 * counters, a mark's). The points are bucketed in cells as wide as the longest gap, so each looks
 * only at its own and the eight cells round it.
 */
function findGaps(slot: LogoFieldView & { edges: Float32Array }, rule: GapRule): Uint16Array {
  const e = slot.edges;
  const count = e.length / 4;
  const minD = rule.min;
  const maxD = rule.max;
  if (count === 0 || !(maxD > minD)) return new Uint16Array(0);
  const across = Math.max(1, Math.ceil((slot.viewWidth + 2 * slot.pad) / maxD) + 1);
  const down = Math.max(1, Math.ceil((slot.viewHeight + 2 * slot.pad) / maxD) + 1);
  const cellX = (x: number): number => Math.min(Math.max(Math.floor((x + slot.pad) / maxD), 0), across - 1);
  const cellY = (y: number): number => Math.min(Math.max(Math.floor((y + slot.pad) / maxD), 0), down - 1);
  // Each cell's points as a linked list: heads[cell] is its first, next[point] the one after.
  const heads = new Int32Array(across * down).fill(-1);
  const next = new Int32Array(count).fill(-1);
  for (let i = 0; i < count; i++) {
    const c = cellY(e[4 * i + 1]) * across + cellX(e[4 * i]);
    next[i] = heads[c];
    heads[c] = i;
  }
  const seen = new Set<number>();
  const pairs: number[] = [];
  for (let i = 0; i < count; i++) {
    const xi = e[4 * i];
    const yi = e[4 * i + 1];
    const nxi = e[4 * i + 2];
    const nyi = e[4 * i + 3];
    const cx = cellX(xi);
    const cy = cellY(yi);
    let best = -1;
    let bestD = maxD;
    for (let gy = Math.max(cy - 1, 0); gy <= Math.min(cy + 1, down - 1); gy++) {
      for (let gx = Math.max(cx - 1, 0); gx <= Math.min(cx + 1, across - 1); gx++) {
        for (let j = heads[gy * across + gx]; j >= 0; j = next[j]) {
          if (j === i) continue;
          const dx = e[4 * j] - xi;
          const dy = e[4 * j + 1] - yi;
          const d2 = dx * dx + dy * dy;
          if (d2 < minD * minD || d2 >= bestD * bestD) continue;
          const d = Math.sqrt(d2);
          if ((nxi * dx + nyi * dy) / d < GAP_FACING) continue;
          if (-(e[4 * j + 2] * dx + e[4 * j + 3] * dy) / d < GAP_FACING) continue;
          let open = true;
          for (let k = 1; k < GAP_SAMPLES && open; k++) {
            const t = k / GAP_SAMPLES;
            open = slotDistance(slot, xi + dx * t, yi + dy * t) > rule.clear;
          }
          if (!open) continue;
          best = j;
          bestD = d;
        }
      }
    }
    if (best < 0) continue;
    const key = Math.min(i, best) * 65536 + Math.max(i, best);
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push(i, best);
  }
  // Too many: keep every k-th, so they still spread over the whole logo.
  const stride = Math.max(1, Math.ceil(pairs.length / 2 / rule.maxPairs));
  const kept: number[] = [];
  for (let p = 0; p < pairs.length / 2; p += stride) kept.push(pairs[2 * p], pairs[2 * p + 1]);
  return Uint16Array.from(kept);
}

/** What a slot is made of besides its raster (exported for the tagline's build, tagline-field.ts). */
export interface SlotShape {
  src: string;
  viewWidth: number;
  viewHeight: number;
  pad: number;
  designPxPerUnit: number;
  sizeUnits: number;
  /** Coverage from this alpha up is solid (1: the antialiased coverage as it is). */
  solidAlpha: number;
  /** Units per raster px (the raster covers the padded viewBox). */
  unitsPerPx: number;
  /**
   * Outline points this far apart (units), how many at most, and the gaps between them: where the
   * overlay's bolts land. null for a slot no bolt rides (the tagline's, v3.4: its border has no
   * arcs or sparks), which then skips the trace and the gap search.
   */
  outline: { edgeSpacing: number; maxEdges: number; gaps: GapRule } | null;
}

/** A slot from its silhouette's raster over the padded viewBox: the signed field, and its outline and gaps when bolts ride it. */
export function slotFromRaster(raster: ImageData, shape: SlotShape): LogoSlot {
  const grid = signedField(raster.data, raster.width, raster.height, shape.unitsPerPx, shape.solidAlpha);
  const base = {
    src: shape.src,
    viewWidth: shape.viewWidth,
    viewHeight: shape.viewHeight,
    pad: shape.pad,
    designPxPerUnit: shape.designPxPerUnit,
    sizeUnits: shape.sizeUnits,
    grid,
    atlasX: 0,
    atlasY: 0,
  };
  if (!shape.outline) return { ...base, edges: new Float32Array(0), gaps: new Uint16Array(0) };
  const edges = traceOutline(base, shape.outline.edgeSpacing, shape.outline.maxEdges);
  const withEdges = { ...base, edges };
  return { ...withEdges, gaps: findGaps(withEdges, shape.outline.gaps) };
}

function buildSlot(spec: SlotSpec): LogoSlot | null {
  const raster = rasterize(spec);
  if (!raster) return null;
  return slotFromRaster(raster, {
    src: spec.src,
    viewWidth: spec.viewWidth,
    viewHeight: spec.viewHeight,
    pad: spec.pad,
    designPxPerUnit: spec.designPxPerUnit,
    sizeUnits: spec.viewHeight,
    solidAlpha: spec.solidAlpha,
    unitsPerPx: unitsPerRasterPx(spec),
    outline: {
      edgeSpacing: EDGE_SPACING_PX / spec.designPxPerUnit,
      maxEdges: MAX_EDGES,
      gaps: {
        min: LOGO_ARCS.gapRange[0] * spec.viewHeight,
        max: LOGO_ARCS.gapRange[1] * spec.viewHeight,
        clear: GAP_CLEAR_SHARE * spec.viewHeight,
        maxPairs: MAX_GAPS,
      },
    },
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`could not decode ${src}`));
    image.src = src;
  });
}

/** The viewBox's size from an svg root: viewBox, else its width and height in user units. */
function viewBoxSize(root: Element): { width: number; height: number } | null {
  const box = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (box.length === 4 && box[2] > 0 && box[3] > 0) return { width: box[2], height: box[3] };
  const width = Number.parseFloat(root.getAttribute("width") ?? "");
  const height = Number.parseFloat(root.getAttribute("height") ?? "");
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * A logo's file, read and given an explicit size equal to its viewBox (a file sized 100% or not at
 * all would otherwise raster at the browser's default 300 x 150 object size), decoded from a data
 * URL (same origin: the canvas is never tainted).
 */
async function loadSpec(src: string): Promise<SlotSpec> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`${src}: ${response.status}`);
  const text = await response.text();
  const root = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
  if (root.nodeName.toLowerCase() !== "svg") throw new Error(`${src}: not an SVG`);
  const view = viewBoxSize(root);
  if (!view) throw new Error(`${src}: no viewBox`);
  root.setAttribute("width", String(view.width));
  root.setAttribute("height", String(view.height));
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(root))}`);
  if (src === LOGO_FIELD.src) {
    return { src, image, ...HERO_SPEC, designPxPerUnit: HERO_DESIGN_PX_PER_UNIT, solidAlpha: 1 };
  }
  // A mark: contained in its box as the .logo-box shows it; its field at texelsPerPx of that.
  const designPxPerUnit = Math.min(MARK_FIELD.boxPx[0] / view.width, MARK_FIELD.boxPx[1] / view.height);
  return {
    src,
    image,
    viewWidth: view.width,
    viewHeight: view.height,
    pad: MARK_FIELD.padPx / designPxPerUnit,
    rasterPerUnit: 2 * MARK_FIELD.texelsPerPx * designPxPerUnit,
    designPxPerUnit,
    solidAlpha: MARK_FIELD.solidAlpha,
  };
}

function whenIdle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(() => resolve(), { timeout: IDLE_TIMEOUT_MS });
    else setTimeout(resolve, 0);
  });
}

/** Shelf-packs the slots (tallest first) into rows ATLAS_MIN_WIDTH wide or more; returns the atlas size. */
function pack(slots: LogoSlot[]): { width: number; height: number } {
  const width = Math.max(ATLAS_MIN_WIDTH, ...slots.map((slot) => slot.grid.width + ATLAS_GUTTER));
  const order = [...slots].sort((a, b) => b.grid.height - a.grid.height);
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const slot of order) {
    if (x + slot.grid.width > width) {
      x = 0;
      y += shelf + ATLAS_GUTTER;
      shelf = 0;
    }
    slot.atlasX = x;
    slot.atlasY = y;
    x += slot.grid.width + ATLAS_GUTTER;
    shelf = Math.max(shelf, slot.grid.height);
  }
  return { width, height: y + shelf };
}

/** A grid's values as half floats (once per slot: a re-pack, as each tagline rebuild makes, only copies rows). */
function halfOf(slot: LogoSlot): Uint16Array {
  if (slot.half) return slot.half;
  const data = slot.grid.data;
  const half = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i++) half[i] = DataUtils.toHalfFloat(data[i]);
  slot.half = half;
  return half;
}

function atlasTexture(slots: LogoSlot[], width: number, height: number): DataTexture {
  const half = new Uint16Array(width * height).fill(DataUtils.toHalfFloat(ATLAS_FAR_UNITS));
  for (const slot of slots) {
    const { grid } = slot;
    const values = halfOf(slot);
    for (let y = 0; y < grid.height; y++) half.set(values.subarray(y * grid.width, (y + 1) * grid.width), (slot.atlasY + y) * width + slot.atlasX);
  }
  const texture = new DataTexture(half, width, height, RedFormat, HalfFloatType);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  // Rows of 2-byte texels need not be 4-byte aligned for every atlas size.
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The atlas, built on request (the first frame a page has a logo) and kept for the visit; a later
 * page's new marks are added and the atlas re-packed. Until the hero is in, and for good if its
 * build fails, the composite draws nothing for it and its CSS drop-shadow stays (html[data-logo-
 * energy] stays unset); a mark whose build fails just stays a plain mark.
 */
export class LogoAtlas {
  private readonly slots = new Map<string, LogoSlot>();
  private readonly failed = new Set<string>();
  private readonly wanted: string[] = [];
  /** The sources in the uploaded texture (a slot's atlas place is valid only for these). */
  private packed = new Set<string>();
  private atlas: DataTexture | null = null;
  private building = false;
  private disposed = false;
  width = 1;
  height = 1;

  /** The atlas once a logo is built (R: signed distance in each slot's viewBox units), else null. */
  get texture(): DataTexture | null {
    return this.atlas;
  }

  /** The hero's grid as built (v3.2's texture layout, Float32), for the verification harness's band measure. */
  get hero(): LogoGrid | null {
    return this.slots.get(LOGO_FIELD.src)?.grid ?? null;
  }

  /** A logo's slot once it is in the uploaded atlas, else null. */
  slot(src: string): LogoSlot | null {
    return this.packed.has(src) ? (this.slots.get(src) ?? null) : null;
  }

  /**
   * Puts a slot built elsewhere (the tagline's, from the page's text) under its src, replacing the
   * one there, and uploads the atlas with it at once (its build already ran in idle time). null
   * takes it out (it is dropped from the texture with the next upload: an unused slot costs nothing).
   */
  put(src: string, slot: LogoSlot | null): void {
    if (this.disposed) return;
    if (!slot) {
      this.slots.delete(src);
      this.packed.delete(src);
      return;
    }
    this.slots.set(src, slot);
    this.upload();
  }

  /** Asks for these logos (any order; repeats are free). New ones are built in idle time. */
  request(sources: readonly string[]): void {
    if (this.disposed || typeof document === "undefined") return;
    let added = false;
    for (const src of sources) {
      if (!src || this.wanted.includes(src)) continue;
      // The hero first: its halo is the logo's legibility.
      if (src === LOGO_FIELD.src) this.wanted.unshift(src);
      else this.wanted.push(src);
      added = true;
    }
    if (added && !this.building) void this.build();
  }

  private pending(): string | undefined {
    return this.wanted.find((src) => !this.slots.has(src) && !this.failed.has(src));
  }

  private async build(): Promise<void> {
    this.building = true;
    try {
      for (let next = this.pending(); next !== undefined; next = this.pending()) {
        try {
          const spec = await loadSpec(next);
          await whenIdle();
          if (this.disposed) return;
          const slot = buildSlot(spec);
          if (!slot) throw new Error("no 2D canvas");
          this.slots.set(next, slot);
        } catch (error: unknown) {
          this.failed.add(next);
          console.warn(
            next === LOGO_FIELD.src
              ? "[scene] The hero logo's electric outline is off (its CSS drop-shadow stays):"
              : "[scene] A logo mark's electric outline is off:",
            error,
          );
        }
        if (this.disposed) return;
        // Upload once the hero is in (its halo is the legibility), then once the rest are.
        if (next === LOGO_FIELD.src || this.pending() === undefined) this.upload();
      }
    } finally {
      this.building = false;
    }
  }

  private upload(): void {
    const slots = [...this.slots.values()];
    if (slots.length === 0) return;
    const size = pack(slots);
    this.atlas?.dispose();
    this.atlas = atlasTexture(slots, size.width, size.height);
    this.width = size.width;
    this.height = size.height;
    this.packed = new Set(this.slots.keys());
  }

  dispose(): void {
    this.disposed = true;
    this.atlas?.dispose();
    this.atlas = null;
    this.packed.clear();
  }
}
