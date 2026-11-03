/* ------------------------------------------------------------------ */
/*  The technology pills of a practice page (owner decision            */
/*  2026-11-02, choreography v3.1): one small liquid droplet sits in   */
/*  each pill, and the pills are linked by their own network of double */
/*  traces. Measured here once per frame by the rig, from the glass    */
/*  registry's surfaces (every pill is a [data-glass="pill"] surface,  */
/*  measured whether on screen or not) inside the practice-tech row.   */
/*  Client CSS px, in reading order: rows top to bottom, each left to  */
/*  right.                                                             */
/*                                                                     */
/*  The droplet reads as a ball, not a glow behind the label           */
/*  (logo-v3-2.md): it rests in the pill's bead window, the clear      */
/*  [data-glass-window] at its leading end, centred and wholly inside  */
/*  it, and the pills' network meets the pill at a junction there.     */
/* ------------------------------------------------------------------ */

import { ANCHORS, anchorRects } from "../../glass/contract";
import { getSurfaces } from "../../glass/registry";
import { MAX_ORB_BODIES, motion } from "../../motion/store";
import { dropletFit } from "../../aquaism/core/pill-droplets";
import { DROPLET_FILL } from "./choreography";
import { laidOut } from "./link-writer";

/** Most pills given a droplet (each is published as one of the orb's bodies) and wired. A practice has 11-14. */
export const MAX_PILLS = MAX_ORB_BODIES;

export interface TechPills {
  /** Pills this frame, 0..MAX_PILLS (0 off a practice page, or with no row laid out). */
  count: number;
  /** Rows of pills (a phone's row wraps into several). */
  rows: number;
  /** Centre and half extents (client px), and row index, per pill in reading order. */
  cx: Float64Array;
  cy: Float64Array;
  hw: Float64Array;
  hh: Float64Array;
  row: Int32Array;
  /**
   * Where its droplet rests (client px): the centre and half extents of its bead window, or the
   * pill's own without one (a pill rendered before the bead markup); and the droplet's rest radius,
   * DROPLET_FILL of the pill's height, less if the window is too small to hold that wholly.
   */
  bx: Float64Array;
  by: Float64Array;
  bw: Float64Array;
  bh: Float64Array;
  radius: Float64Array;
}

export function createTechPills(): TechPills {
  return {
    count: 0,
    rows: 0,
    cx: new Float64Array(MAX_PILLS),
    cy: new Float64Array(MAX_PILLS),
    hw: new Float64Array(MAX_PILLS),
    hh: new Float64Array(MAX_PILLS),
    row: new Int32Array(MAX_PILLS),
    bx: new Float64Array(MAX_PILLS),
    by: new Float64Array(MAX_PILLS),
    bw: new Float64Array(MAX_PILLS),
    bh: new Float64Array(MAX_PILLS),
    radius: new Float64Array(MAX_PILLS),
  };
}

function swap(p: TechPills, i: number, j: number): void {
  for (const array of [p.cx, p.cy, p.hw, p.hh, p.row, p.bx, p.by, p.bw, p.bh, p.radius] as const) {
    const t = array[i];
    array[i] = array[j];
    array[j] = t;
  }
}

/** Insertion sort (at most MAX_PILLS entries): by row, then left to right; or by centre height before the rows are known. */
function sortPills(p: TechPills, byRow: boolean): void {
  for (let i = 1; i < p.count; i++) {
    for (let j = i; j > 0; j--) {
      const inOrder = byRow
        ? p.row[j - 1] < p.row[j] || (p.row[j - 1] === p.row[j] && p.cx[j - 1] <= p.cx[j])
        : p.cy[j - 1] < p.cy[j] || (p.cy[j - 1] === p.cy[j] && p.cx[j - 1] <= p.cx[j]);
      if (inOrder) break;
      swap(p, j, j - 1);
    }
  }
}

/** Measures this frame's pills into `out` (client px). Empty off a practice page. */
export function measureTechPills(out: TechPills): void {
  out.count = 0;
  out.rows = 0;
  if (motion.story.practice === "") return;
  const row = laidOut(anchorRects.get(ANCHORS.practiceTech));
  if (!row) return;
  const scroll = motion.scroll.y;
  for (const surface of getSurfaces()) {
    if (out.count >= MAX_PILLS) break;
    if (surface.kind !== "pill") continue;
    const box = surface.box;
    if (!(box.width > 0 && box.height > 0)) continue;
    // Where the composite draws it (the registry's packed rects add the magnetic offset too).
    const cx = box.x + box.width / 2 + surface.offsetX;
    const cy = (box.fixed ? box.y : box.y - scroll) + box.height / 2 + surface.offsetY;
    if (cx < row.x || cx > row.x + row.width || cy < row.y || cy > row.y + row.height) continue;
    const k = out.count++;
    out.cx[k] = cx;
    out.cy[k] = cy;
    out.hw[k] = box.width / 2;
    out.hh[k] = box.height / 2;
    out.row[k] = 0;
    // The bead window, as the registry measures it (its layout box, the glassFrame.windows rect).
    const bead = surface.windowBox;
    if (surface.windowElement && bead.width > 0 && bead.height > 0) {
      out.bx[k] = bead.x + bead.width / 2 + surface.offsetX;
      out.by[k] = (bead.fixed ? bead.y : bead.y - scroll) + bead.height / 2 + surface.offsetY;
      out.bw[k] = bead.width / 2;
      out.bh[k] = bead.height / 2;
    } else {
      out.bx[k] = cx;
      out.by[k] = cy;
      out.bw[k] = out.hw[k];
      out.bh[k] = out.hh[k];
    }
    out.radius[k] = dropletFit(out.bw[k], out.bh[k], DROPLET_FILL * box.height);
  }
  // Rows: a pill whose centre is more than its half height below the row's first starts a new one.
  sortPills(out, false);
  let rowY = -Infinity;
  for (let k = 0; k < out.count; k++) {
    if (out.rows === 0 || Math.abs(out.cy[k] - rowY) > out.hh[k]) {
      out.rows++;
      rowY = out.cy[k];
    }
    out.row[k] = out.rows - 1;
  }
  sortPills(out, true);
}
