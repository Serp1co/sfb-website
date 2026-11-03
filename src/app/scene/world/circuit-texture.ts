/* ------------------------------------------------------------------ */
/*  The circuit board, painted once on a 2D canvas from a fixed seed:  */
/*  chips with pins, Manhattan buses with 45-degree chamfers, pads,    */
/*  vias. The channels are data, not colour (NoColorSpace):            */
/*    R  trace coverage, 0..1 (traces only, so pulses never run on     */
/*       pads or chip bodies)                                          */
/*    G  pulse phase x R. Canvas anti-aliasing scales every channel by */
/*       coverage, so the shader recovers phase = G / max(R, 1/255).   */
/*       The phase repeats every PHASE_PERIOD px of trace: 8-bit steps */
/*       then stay under a texel, so pulses glide instead of stepping. */
/*    B  nodes: pads, vias, pins (1) and chip bodies (dim); they       */
/*       breathe in the shader.                                        */
/*  The tile wraps: anything that crosses an edge is drawn again on    */
/*  the other side, so the floor repeats without seams.                */
/* ------------------------------------------------------------------ */

import { createRandom } from "../../aquaism/core/math";

/** Layout space; the canvas is painted at any size by scaling this. */
const DESIGN = 2048;
/** Occupancy grid cell (design px): keeps buses from crossing or touching. */
const CELL = 8;
const GRID = DESIGN / CELL;

/** Design px of trace per pulse cycle (<= 192 texels at 2048, so 8-bit phase steps < 1 texel). */
export const PHASE_PERIOD = 160;

const PITCH = 16;
const TRACE_WIDTH = 3;
/** Free cells kept around every bus (design px), on top of its own half width. */
const CLEARANCE = 10;

const CHIP_ATTEMPTS = 220;
const CHIP_COUNT = 11;
const CHIP_MIN = 112;
const CHIP_MAX = 272;
const PIN_LENGTH = 14;
const CHIP_MARGIN = PIN_LENGTH + 2 * CELL;
/** Share of a chip side's pin runs that leave as buses (the rest stay bare pins). */
const CHIP_BUS_CHANCE = 0.7;

const FREE_BUSES = 52;
const FREE_BUS_ATTEMPTS = 400;
const SEGMENT_MIN = 4 * CELL;
const SEGMENT_MAX = 30 * CELL;
const TURNS_MAX = 4;
/** Chamfer along the diagonal: long enough that the innermost trace of a wide bus keeps a corner. */
const CHAMFER_BASE = 24;
const CHAMFER_PER_TRACE = 8;
/** Pulse phase offset between neighbouring traces of a bus: the pulses run as a diagonal wave. */
const PHASE_STAGGER = 0.06;

const VIA_RADIUS = 4.5;
const VIA_RING = 2;
const PAD_SIZE = 9;
const VIA_ARRAYS = 14;
const LONE_VIAS = 120;

/** 8 compass directions, y down (canvas), index * 45 degrees from east. */
const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [Math.SQRT1_2, Math.SQRT1_2],
  [0, 1],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [-1, 0],
  [-Math.SQRT1_2, -Math.SQRT1_2],
  [0, -1],
  [Math.SQRT1_2, -Math.SQRT1_2],
];

type Point = [number, number];

interface Painter {
  ctx: CanvasRenderingContext2D;
  random: () => number;
  occupied: Uint8Array;
}

/* -- Occupancy (toroidal, like the tile) -------------------------------- */

function cellIndex(x: number, y: number): number {
  const cx = ((Math.floor(x / CELL) % GRID) + GRID) % GRID;
  const cy = ((Math.floor(y / CELL) % GRID) + GRID) % GRID;
  return cy * GRID + cx;
}

function discFree(p: Painter, x: number, y: number, radius: number): boolean {
  const r = Math.ceil(radius / CELL);
  for (let j = -r; j <= r; j++) {
    for (let i = -r; i <= r; i++) {
      if ((i * i + j * j) * CELL * CELL > radius * radius + CELL * CELL) continue;
      if (p.occupied[cellIndex(x + i * CELL, y + j * CELL)]) return false;
    }
  }
  return true;
}

function markDisc(p: Painter, x: number, y: number, radius: number): void {
  const r = Math.ceil(radius / CELL);
  for (let j = -r; j <= r; j++) {
    for (let i = -r; i <= r; i++) {
      if ((i * i + j * j) * CELL * CELL > radius * radius + CELL * CELL) continue;
      p.occupied[cellIndex(x + i * CELL, y + j * CELL)] = 1;
    }
  }
}

function markRect(p: Painter, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y += CELL) for (let x = x0; x <= x1; x += CELL) p.occupied[cellIndex(x, y)] = 1;
}

function rectFree(p: Painter, x0: number, y0: number, x1: number, y1: number): boolean {
  for (let y = y0; y <= y1; y += CELL) for (let x = x0; x <= x1; x += CELL) if (p.occupied[cellIndex(x, y)]) return false;
  return true;
}

/* -- Wrapped drawing ------------------------------------------------------- */

/** Runs draw() once per tile copy the bounding box touches, so edge-crossing shapes wrap. */
function wrapped(p: Painter, x0: number, y0: number, x1: number, y1: number, draw: () => void): void {
  for (let oy = -DESIGN; oy <= DESIGN; oy += DESIGN) {
    if (y1 + oy < 0 || y0 + oy > DESIGN) continue;
    for (let ox = -DESIGN; ox <= DESIGN; ox += DESIGN) {
      if (x1 + ox < 0 || x0 + ox > DESIGN) continue;
      p.ctx.save();
      p.ctx.translate(ox, oy);
      draw();
      p.ctx.restore();
    }
  }
}

function phaseColour(phase: number): string {
  return `rgb(255,${Math.round(Math.min(Math.max(phase, 0), 1) * 255)},0)`;
}

/** One straight piece of trace whose G channel ramps with arclength (a sawtooth, wrapping each period). */
function strokeSegment(ctx: CanvasRenderingContext2D, a: Point, b: Point, phase: number): void {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (length < 0.5) return;
  const end = phase + length / PHASE_PERIOD;
  const gradient = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
  gradient.addColorStop(0, phaseColour(phase - Math.floor(phase)));
  for (let k = Math.floor(phase) + 1; k < end; k++) {
    const t = ((k - phase) * PHASE_PERIOD) / length;
    if (t <= 0 || t >= 1) continue;
    gradient.addColorStop(t, phaseColour(1));
    gradient.addColorStop(t, phaseColour(0));
  }
  const tail = end - Math.floor(end);
  gradient.addColorStop(1, phaseColour(tail < 1e-6 ? 1 : tail));
  ctx.strokeStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

function drawTrace(p: Painter, points: Point[], phase: number): void {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const pad = TRACE_WIDTH;
  wrapped(p, x0 - pad, y0 - pad, x1 + pad, y1 + pad, () => {
    const ctx = p.ctx;
    ctx.lineWidth = TRACE_WIDTH;
    ctx.lineCap = "round";
    let travelled = phase;
    for (let i = 1; i < points.length; i++) {
      strokeSegment(ctx, points[i - 1], points[i], travelled);
      travelled += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]) / PHASE_PERIOD;
    }
  });
}

function drawVia(p: Painter, x: number, y: number): void {
  wrapped(p, x - VIA_RADIUS - 2, y - VIA_RADIUS - 2, x + VIA_RADIUS + 2, y + VIA_RADIUS + 2, () => {
    const ctx = p.ctx;
    ctx.strokeStyle = "rgb(0,0,255)";
    ctx.lineWidth = VIA_RING;
    ctx.beginPath();
    ctx.arc(x, y, VIA_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function drawPad(p: Painter, x: number, y: number, size = PAD_SIZE): void {
  const h = size / 2;
  wrapped(p, x - h, y - h, x + h, y + h, () => {
    p.ctx.fillStyle = "rgb(0,0,255)";
    p.ctx.beginPath();
    p.ctx.roundRect(x - h, y - h, size, size, 2);
    p.ctx.fill();
  });
}

function terminate(p: Painter, point: Point): void {
  if (p.random() < 0.55) drawVia(p, point[0], point[1]);
  else drawPad(p, point[0], point[1]);
}

/* -- Routing ------------------------------------------------------------ */

/** A random Manhattan walk with chamfered turns that keeps clear of occupied cells. */
function routeCentreline(p: Painter, start: Point, heading: number, traces: number, grace: number): Point[] | null {
  const half = ((traces - 1) * PITCH) / 2 + TRACE_WIDTH + CLEARANCE;
  const points: Point[] = [[start[0], start[1]]];
  let [x, y] = start;
  let h = heading;
  let travelled = 0;
  let lastTurn = 0;
  const turns = 1 + Math.floor(p.random() * TURNS_MAX);
  for (let s = 0; s <= turns; s++) {
    const want = SEGMENT_MIN + Math.floor(p.random() * (SEGMENT_MAX - SEGMENT_MIN));
    const [dx, dy] = DIRECTIONS[h];
    let walked = 0;
    while (walked < want) {
      const nx = x + dx * (walked + CELL);
      const ny = y + dy * (walked + CELL);
      if (travelled + walked + CELL > grace && !discFree(p, nx, ny, half)) break;
      walked += CELL;
    }
    if (walked < SEGMENT_MIN / 2) {
      if (s === 0) return null;
      break;
    }
    x += dx * walked;
    y += dy * walked;
    travelled += walked;
    points.push([x, y]);
    if (s === turns) break;

    // Mostly zig-zag (alternate turns): two same-way turns would fold a wide bus onto itself.
    const turn = lastTurn !== 0 && p.random() < 0.7 ? -lastTurn : p.random() < 0.5 ? -2 : 2;
    const diagonal = (h + turn / 2 + 8) % 8;
    const chamfer = CHAMFER_BASE + (traces - 1) * CHAMFER_PER_TRACE;
    const cx = x + DIRECTIONS[diagonal][0] * chamfer;
    const cy = y + DIRECTIONS[diagonal][1] * chamfer;
    if (!discFree(p, cx, cy, half)) break;
    x = cx;
    y = cy;
    travelled += chamfer;
    points.push([x, y]);
    h = (h + turn + 8) % 8;
    lastTurn = turn;
  }
  return points.length >= 2 ? points : null;
}

function markCentreline(p: Painter, points: Point[], traces: number): void {
  const half = ((traces - 1) * PITCH) / 2 + TRACE_WIDTH + CLEARANCE;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const length = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(length / (CELL / 2)));
    for (let k = 0; k <= steps; k++) markDisc(p, ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps, half);
  }
}

/** The centreline offset sideways by d (positive = the left normal), mitred at the corners. */
function offsetPolyline(points: Point[], d: number): Point[] {
  const normal = (a: Point, b: Point): Point => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
  };
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i === 0 || i === points.length - 1) {
      const n = i === 0 ? normal(points[0], points[1]) : normal(points[i - 1], points[i]);
      out.push([p[0] + n[0] * d, p[1] + n[1] * d]);
      continue;
    }
    const n1 = normal(points[i - 1], p);
    const n2 = normal(p, points[i + 1]);
    let mx = n1[0] + n2[0];
    let my = n1[1] + n2[1];
    const m = Math.hypot(mx, my) || 1;
    mx /= m;
    my /= m;
    const k = d / Math.max(mx * n1[0] + my * n1[1], 0.2);
    out.push([p[0] + mx * k, p[1] + my * k]);
  }
  return out;
}

/** Routes a bus of `traces` parallel traces; returns the end points for terminators, or null. */
function drawBus(p: Painter, start: Point, heading: number, traces: number, grace: number, fromPins: Point[] | null): boolean {
  const centre = routeCentreline(p, start, heading, traces, grace);
  if (!centre) return false;
  markCentreline(p, centre, traces);
  const phase = p.random();
  for (let j = 0; j < traces; j++) {
    const d = (j - (traces - 1) / 2) * PITCH;
    const line = offsetPolyline(centre, d);
    if (fromPins) line.unshift(fromPins[j]);
    drawTrace(p, line, phase + j * PHASE_STAGGER);
    terminate(p, line[line.length - 1]);
    if (!fromPins) terminate(p, line[0]);
  }
  return true;
}

/* -- Chips ------------------------------------------------------------- */

interface Chip {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function snap(value: number): number {
  return Math.round(value / PITCH) * PITCH;
}

function placeChips(p: Painter): Chip[] {
  const chips: Chip[] = [];
  for (let attempt = 0; attempt < CHIP_ATTEMPTS && chips.length < CHIP_COUNT; attempt++) {
    const w = snap(CHIP_MIN + p.random() * (CHIP_MAX - CHIP_MIN));
    const h = snap(CHIP_MIN + p.random() * (CHIP_MAX - CHIP_MIN));
    const x0 = snap(p.random() * DESIGN);
    const y0 = snap(p.random() * DESIGN);
    const chip = { x0, y0, x1: x0 + w, y1: y0 + h };
    const m = CHIP_MARGIN + 3 * CELL;
    if (!rectFree(p, chip.x0 - m, chip.y0 - m, chip.x1 + m, chip.y1 + m)) continue;
    markRect(p, chip.x0 - CHIP_MARGIN, chip.y0 - CHIP_MARGIN, chip.x1 + CHIP_MARGIN, chip.y1 + CHIP_MARGIN);
    chips.push(chip);
  }
  return chips;
}

function drawChipBody(p: Painter, chip: Chip): void {
  const { x0, y0, x1, y1 } = chip;
  wrapped(p, x0 - 2, y0 - 2, x1 + 2, y1 + 2, () => {
    const ctx = p.ctx;
    ctx.fillStyle = "rgb(0,0,40)";
    ctx.beginPath();
    ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 6);
    ctx.fill();
    ctx.strokeStyle = "rgb(0,0,130)";
    ctx.lineWidth = 2;
    ctx.stroke();
    // The die: an inner square outline.
    const inset = Math.min(x1 - x0, y1 - y0) * 0.28;
    ctx.strokeStyle = "rgb(0,0,80)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0 + inset, y0 + inset, x1 - x0 - 2 * inset, y1 - y0 - 2 * inset);
  });
}

/** Pins along each side; runs of them leave as buses, the rest stay bare pads. */
function wireChip(p: Painter, chip: Chip): void {
  const sides: { from: Point; along: Point; out: number; length: number }[] = [
    { from: [chip.x0, chip.y0], along: [1, 0], out: 6, length: chip.x1 - chip.x0 },
    { from: [chip.x1, chip.y0], along: [0, 1], out: 0, length: chip.y1 - chip.y0 },
    { from: [chip.x0, chip.y1], along: [1, 0], out: 2, length: chip.x1 - chip.x0 },
    { from: [chip.x0, chip.y0], along: [0, 1], out: 4, length: chip.y1 - chip.y0 },
  ];
  for (const side of sides) {
    const [ox, oy] = DIRECTIONS[side.out];
    const count = Math.floor(side.length / PITCH) - 2;
    let i = 0;
    while (i < count) {
      const run = Math.min(count - i, 2 + Math.floor(p.random() * 5));
      const pins: Point[] = [];
      for (let k = 0; k < run; k++) {
        const t = (i + k + 1.5) * PITCH;
        pins.push([side.from[0] + side.along[0] * t, side.from[1] + side.along[1] * t]);
      }
      let wired = false;
      if (p.random() < CHIP_BUS_CHANCE) {
        // The bus's centreline starts at the pin tips; its offsets must land on the pins, so the
        // pins are ordered along the bus's left normal (offsetPolyline's positive side).
        const nx = -oy;
        const ny = ox;
        const ordered = [...pins].sort((a, b) => a[0] * nx + a[1] * ny - (b[0] * nx + b[1] * ny));
        const mid: Point = [
          (ordered[0][0] + ordered[run - 1][0]) / 2 + ox * PIN_LENGTH,
          (ordered[0][1] + ordered[run - 1][1]) / 2 + oy * PIN_LENGTH,
        ];
        wired = drawBus(p, mid, side.out, run, CHIP_MARGIN + 2 * CELL, ordered);
      }
      for (const pin of pins) drawPad(p, pin[0] + ox * 3, pin[1] + oy * 3, wired ? 7 : 6);
      i += run + 1 + Math.floor(p.random() * 2);
    }
  }
}

/* -- Decoration ---------------------------------------------------------- */

function drawViaArray(p: Painter): void {
  const columns = 2 + Math.floor(p.random() * 4);
  const rows = 2 + Math.floor(p.random() * 5);
  const x0 = snap(p.random() * DESIGN);
  const y0 = snap(p.random() * DESIGN);
  const x1 = x0 + (columns - 1) * PITCH;
  const y1 = y0 + (rows - 1) * PITCH;
  if (!rectFree(p, x0 - PITCH, y0 - PITCH, x1 + PITCH, y1 + PITCH)) return;
  markRect(p, x0 - PITCH, y0 - PITCH, x1 + PITCH, y1 + PITCH);
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) drawVia(p, x0 + c * PITCH, y0 + r * PITCH);
}

/**
 * Paints the circuit tile into a new canvas of `size` px. Deterministic for a seed. Runs once
 * (tens of ms at 2048), so the caller schedules it off the critical path.
 */
export function paintCircuit(size: number, seed: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return canvas;
  ctx.fillStyle = "rgb(0,0,0)";
  ctx.fillRect(0, 0, size, size);
  ctx.scale(size / DESIGN, size / DESIGN);

  const p: Painter = { ctx, random: createRandom(seed), occupied: new Uint8Array(GRID * GRID) };

  const chips = placeChips(p);
  for (const chip of chips) drawChipBody(p, chip);
  for (const chip of chips) wireChip(p, chip);

  let placed = 0;
  for (let attempt = 0; attempt < FREE_BUS_ATTEMPTS && placed < FREE_BUSES; attempt++) {
    const start: Point = [snap(p.random() * DESIGN), snap(p.random() * DESIGN)];
    const roll = p.random();
    const traces = roll < 0.35 ? 1 : roll < 0.6 ? 2 : roll < 0.8 ? 3 : 4 + Math.floor(p.random() * 3);
    if (!discFree(p, start[0], start[1], ((traces - 1) * PITCH) / 2 + TRACE_WIDTH + CLEARANCE)) continue;
    if (drawBus(p, start, 2 * Math.floor(p.random() * 4), traces, 0, null)) placed++;
  }

  for (let i = 0; i < VIA_ARRAYS; i++) drawViaArray(p);
  for (let i = 0; i < LONE_VIAS; i++) {
    const x = snap(p.random() * DESIGN);
    const y = snap(p.random() * DESIGN);
    if (!discFree(p, x, y, VIA_RADIUS + CELL)) continue;
    markDisc(p, x, y, VIA_RADIUS + CELL);
    drawVia(p, x, y);
  }
  return canvas;
}
