"use client";

/*
 * The cell circuitry (owner decisions 2026-11-02, choreography v3 and v3.1): the practice pages
 * behave like the home page, and as the service circuitry links the three Services cards there,
 * traces link a practice page's panels while the orb sits split in them. Every trace that meets a
 * body runs into a junction at the body's anchored rest point (the card's and the call to action's
 * centre, the pill's bead window; junctions.md): a point, not a block (logo-v3-2.md), a small round
 * via the traces converge into, drawn behind the body, so pushing or splashing it aside never
 * leaves a hole in the circuit:
 *   - the feature grid: two traces between neighbouring cards along each row (a jog in the gap),
 *     and between each card and those of the row above it that it sits under (straight down a
 *     column, or stepping across in the gap where a short last row is centred);
 *   - the call to action: two rails from the grid's last row, out to the container's sides, down
 *     past the technologies and into the call-to-action panel's junction;
 *   - the technologies: their own network, never joined to the rails that frame the section (a
 *     clear gap between them): a double trace between neighbouring pills along each row, the rows
 *     joined end to end (a snake), a junction in each pill's bead window under its droplet (v3.1,
 *     logo-v3-2.md).
 * Laid out on screen from the anchors (cell-practice, cell-practice-cta) and the pills (tech-pills,
 * measured by the rig) every frame, cast onto a plane just behind the bodies (their refraction
 * shows the junctions and traces they sit on). Same additive opaque-list material and fade to black as
 * the service and partner traces: crisp in the gaps, softened behind the frost (the composite's).
 *
 * The grid and the rails weigh the practice cells' share of the pose (world.cellLinks): they come
 * in with the split and go out as the orb merges for the practice hero. The pills' network weighs
 * their droplets' (world.droplets): it lights up as the droplets land in the pills. Rebuilt on the
 * CPU each visible frame, at most MAX_QUADS and MAX_PILL_QUADS quads.
 */

import { useEffect, useState, type JSX } from "react";
import * as THREE from "three";
import { useFrame, type RootState } from "@react-three/fiber";
import { ANCHORS, anchorRects, type AnchorRect } from "../../glass/contract";
import { motion } from "../../motion/store";
import { FRAME_ORDER } from "../../aquaism/core/frame-order";
import { MAX_CLUSTERS } from "../../aquaism/core/orb-controls";
import { clientToPlaneZ, pixelsPerUnitAt, worldToClient, type ScreenPoint } from "../../aquaism/core/projection";
import { CELL_FILL } from "./choreography";
import { LinkWriter, MAX_ROUTE_CORNERS, createLinkMesh, laidOut, uploadLinks, type LinkMesh } from "./link-writer";
import { FAN_SHARE } from "./partner-routes";
import type { TechPills } from "./tech-pills";
import { powerSeconds } from "./world-materials";
import type { WorldState } from "./world-state";

/**
 * The traces' plane sits this far (world units) behind the bodies' back: behind them, so they
 * refract it, and never through them (the feature cells' bodies are ~0.9 units deep at 1440 px).
 */
const PLANE_CLEARANCE = 0.6;
/** ...and never nearer the camera than this world z: the boards' near band starts at -2 (layers.ts). */
const PLANE_NEAREST_Z = -1.2;
/** As fine as the service traces: these run behind text-bearing cards. */
const LINK_WIDTH_PX = 3;
/** The two traces of a link, this far apart (CSS px, centre to centre). */
const LINK_PITCH_PX = 10;
/** The jog in the gap: each row link's traces step aside by this many px over a 45-degree leg. */
const LINK_JOG_PX = 14;
/** Cards share a row when their centres are within this share of the shorter card's height. */
const ROW_TOLERANCE = 0.5;
/**
 * A card is linked to a card of the row above when their spans overlap by at least this share of
 * the narrower one: the card right above it, or both it straddles when a short last row is centred
 * (C1, 3 over 2), never one a whole column aside.
 */
const COLUMN_OVERLAP = 0.25;
/** Under this offset (share of the narrower card) a column link runs straight down; beyond it, it steps across in the gap. */
const COLUMN_ALIGNED = 0.1;
/** A stepping link leaves and enters its junctions' fans this share of the fan off their centres, toward each other. */
const STEP_OFFSET = 0.45;
/** The rails leave the grid's last row this far below it, and run this far outside the container (at most half the margin). */
const RAIL_DROP_PX = 20;
const RAIL_OUTSET_PX = 16;
/** A rail leaves its card's junction this share of the fan off its centre, on its outer side. */
const RAIL_START_SHARE = 0.5;
/**
 * The pills' network: its traces as fine as the rest, closer together (a pill is ~45 px tall), and
 * its fans at least a pitch long, so the pair converges into a junction at no steeper than ~27 deg.
 */
const PILL_PITCH_PX = 6;
const PILL_FAN_MIN_PX = PILL_PITCH_PX;
/**
 * Quads in all: up to 13 grid links x 2 traces x 9 pieces (junction to junction, six corners
 * chamfered), the two 9-piece rails, ten junctions, and some to spare.
 */
const MAX_QUADS = 320;
/**
 * ...and the pills', for up to 16 pills: a row link is 2 x 5 pieces, a snake joint 2 x 9; the most
 * is one pill per row (15 joints, 270) plus 16 junctions.
 */
const MAX_PILL_QUADS = 288;
/** Below this weight nothing is drawn. */
const MIN_WEIGHT = 0.003;

interface Card {
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
  row: number;
}

const _screen: ScreenPoint = { x: 0, y: 0, depth: 0 };
const _onPlane = new THREE.Vector3();
const _corners = new Float64Array(2 * MAX_ROUTE_CORNERS);
const _cards: Card[] = Array.from({ length: MAX_CLUSTERS }, () => ({ x: 0, y: 0, width: 0, height: 0, cx: 0, cy: 0, row: 0 }));
const _order: Card[] = [];

function setCorners(...points: number[]): number {
  const n = Math.min(points.length >> 1, MAX_ROUTE_CORNERS);
  for (let k = 0; k < 2 * n; k++) _corners[k] = points[k];
  return n;
}

/** The laid-out feature cards in reading order (rows top to bottom, each left to right) into _order; returns the row count. */
function collectCards(): number {
  _order.length = 0;
  const rects = anchorRects.get(ANCHORS.practiceCell);
  if (!rects) return 0;
  let n = 0;
  for (const rect of rects) {
    if (n >= _cards.length) break;
    if (!(rect.width > 0 && rect.height > 0)) continue;
    const card = _cards[n++];
    card.x = rect.x;
    card.y = rect.y;
    card.width = rect.width;
    card.height = rect.height;
    card.cx = rect.x + rect.width / 2;
    card.cy = rect.y + rect.height / 2;
    _order.push(card);
  }
  _order.sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  let rows = 0;
  let rowY = -Infinity;
  let rowH = 0;
  for (const card of _order) {
    if (rows === 0 || Math.abs(card.cy - rowY) > ROW_TOLERANCE * Math.min(rowH, card.height)) {
      rows++;
      rowY = card.cy;
      rowH = card.height;
    }
    card.row = rows - 1;
  }
  _order.sort((a, b) => a.row - b.row || a.cx - b.cx);
  return rows;
}

/**
 * The cards' fan: the traces converge into each card's junction over this reach (CSS px), from the
 * bodies' rest radius (every body is the smallest card's fit, choreography): under the body.
 */
function cardFan(): number {
  let side = Infinity;
  for (const card of _order) side = Math.min(side, card.width, card.height);
  return Number.isFinite(side) ? FAN_SHARE * CELL_FILL * side : 0;
}

/** Two traces along a row, from a's junction to its right-hand neighbour b's, jogged in the gap between them. */
function linkAcross(writer: LinkWriter, a: Card, b: Card, fan: number, index: number): void {
  const jog = index % 2 === 0 ? LINK_JOG_PX : -LINK_JOG_PX;
  const step = Math.abs(jog) / 2;
  const gap = (a.x + a.width + b.x) / 2;
  const y = (a.cy + b.cy) / 2 - jog / 2;
  writer.double(
    _corners,
    setCorners(a.cx, a.cy, a.cx + fan, y, gap - step, y, gap + step, y + jog, b.cx - fan, y + jog, b.cx, b.cy),
    LINK_PITCH_PX,
  );
}

/**
 * Two traces from card a down to card b in the next row: straight down the column (a jog in the
 * gap) when b sits under a, else out of a's junction toward b, across in the gap, and into b's.
 */
function linkDown(writer: LinkWriter, a: Card, b: Card, fan: number, index: number): void {
  const gap = (a.y + a.height + b.y) / 2;
  const offset = b.cx - a.cx;
  if (Math.abs(offset) <= COLUMN_ALIGNED * Math.min(a.width, b.width)) {
    const jog = index % 2 === 0 ? LINK_JOG_PX : -LINK_JOG_PX;
    const step = Math.abs(jog) / 2;
    const x = (a.cx + b.cx) / 2 - jog / 2;
    writer.double(
      _corners,
      setCorners(a.cx, a.cy, x, a.cy + fan, x, gap - step, x + jog, gap + step, x + jog, b.cy - fan, b.cx, b.cy),
      LINK_PITCH_PX,
    );
    return;
  }
  const toward = Math.sign(offset);
  const leave = a.cx + toward * STEP_OFFSET * fan;
  const enter = b.cx - toward * STEP_OFFSET * fan;
  writer.double(
    _corners,
    setCorners(a.cx, a.cy, leave, a.cy + fan, leave, gap, enter, gap, enter, b.cy - fan, b.cx, b.cy),
    LINK_PITCH_PX,
  );
}

/** The grid: a junction in every card, links along each row, then each card to the cards above it that it sits under. */
function buildGrid(writer: LinkWriter, fan: number): void {
  for (let k = 0; k < _order.length; k++) writer.junction(_order[k].cx, _order[k].cy, 1, k * 1.9);
  let index = 0;
  for (let k = 0; k + 1 < _order.length; k++) {
    const a = _order[k];
    const b = _order[k + 1];
    if (a.row === b.row) linkAcross(writer, a, b, fan, index++);
  }
  for (const b of _order) {
    if (b.row === 0) continue;
    for (const a of _order) {
      if (a.row !== b.row - 1) continue;
      const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      if (overlap >= COLUMN_OVERLAP * Math.min(a.width, b.width)) linkDown(writer, a, b, fan, index++);
    }
  }
}

/**
 * The call to action joined to the grid's last row: a rail out of the junction of each of its
 * outer cards (both out of one card's when the last row is a single centred card), down below the
 * row, out to the container's side, down past the technologies and into the call to action's.
 */
function buildRails(writer: LinkWriter, rows: number, fan: number, cta: AnchorRect, box: RootState["size"]): void {
  if (rows === 0 || _order.length === 0) return;
  let first: Card | null = null;
  let last: Card | null = null;
  let gridLeft = Infinity;
  let gridRight = -Infinity;
  let rowBottom = -Infinity;
  for (const card of _order) {
    gridLeft = Math.min(gridLeft, card.x);
    gridRight = Math.max(gridRight, card.x + card.width);
    if (card.row !== rows - 1) continue;
    if (!first) first = card;
    last = card;
    rowBottom = Math.max(rowBottom, card.y + card.height);
  }
  if (!first || !last) return;
  const left = Math.min(gridLeft, cta.x);
  const right = Math.max(gridRight, cta.x + cta.width);
  // Outside the container, but within half its margin (a phone's is 16 px).
  const outLeft = left - Math.min(RAIL_OUTSET_PX, Math.max((left - box.left) / 2, 0));
  const outRight = right + Math.min(RAIL_OUTSET_PX, Math.max((box.left + box.width - right) / 2, 0));
  const drop = rowBottom + RAIL_DROP_PX;
  const ctaX = cta.x + cta.width / 2;
  const ctaY = cta.y + cta.height / 2;
  writer.junction(ctaX, ctaY, 1, 0.7);
  const startLeft = first.cx - RAIL_START_SHARE * fan;
  const startRight = last.cx + RAIL_START_SHARE * fan;
  writer.route(
    _corners,
    setCorners(first.cx, first.cy, startLeft, first.cy + fan, startLeft, drop, outLeft, drop, outLeft, ctaY, ctaX, ctaY),
    false,
  );
  writer.route(
    _corners,
    setCorners(last.cx, last.cy, startRight, last.cy + fan, startRight, drop, outRight, drop, outRight, ctaY, ctaX, ctaY),
    true,
  );
}

/** Pill k's fan (CSS px): its pair of traces converges into its junction over it, under its droplet. */
function pillFan(pills: TechPills, k: number): number {
  return Math.max(FAN_SHARE * pills.radius[k], PILL_FAN_MIN_PX);
}

/**
 * The pills' own network (v3.1): a junction in each pill where its droplet rests (the centre of its
 * bead window, logo-v3-2.md), a double trace to its neighbour along each row, and each row joined
 * to the next at the end they share (even rows run left to right, odd rows back: a snake). It stays
 * within the pills' span: it never meets the rails that frame the section.
 */
function buildPillNetwork(writer: LinkWriter, pills: TechPills): void {
  const n = pills.count;
  for (let k = 0; k < n; k++) writer.junction(pills.bx[k], pills.by[k], 1, k * 1.3);
  let start = 0;
  let previous = -1;
  for (let r = 0; r < pills.rows; r++) {
    let end = start;
    while (end < n && pills.row[end] === r) end++;
    if (end === start) continue;
    for (let k = start; k + 1 < end; k++) {
      const y = (pills.by[k] + pills.by[k + 1]) / 2;
      const from = pills.bx[k] + pillFan(pills, k);
      const to = pills.bx[k + 1] - pillFan(pills, k + 1);
      writer.double(_corners, setCorners(pills.bx[k], pills.by[k], from, y, to, y, pills.bx[k + 1], pills.by[k + 1]), PILL_PITCH_PX);
    }
    // The snake: this row starts at the end the previous one finished at.
    const entry = r % 2 === 0 ? start : end - 1;
    if (previous >= 0) {
      const a = previous;
      const b = entry;
      // Down from a's junction into the gap between the rows, along it, and up or down into b's.
      const gap = (pills.cy[a] + pills.hh[a] + pills.cy[b] - pills.hh[b]) / 2;
      const ax = pills.bx[a];
      const bx = pills.bx[b];
      writer.double(
        _corners,
        setCorners(ax, pills.by[a], ax, pills.by[a] + pillFan(pills, a), ax, gap, bx, gap, bx, pills.by[b] - pillFan(pills, b), bx, pills.by[b]),
        PILL_PITCH_PX,
      );
    }
    previous = r % 2 === 0 ? end - 1 : start;
    start = end;
  }
}

/** The plane behind the bodies: their centre's depth, less their depth and PLANE_CLEARANCE. */
function planeZ(world: WorldState): number {
  const orb = world.orb;
  return Math.min(orb.centre.z - orb.bodyRadius * Math.max(orb.scale, 0.05) - PLANE_CLEARANCE, PLANE_NEAREST_Z);
}

/** Starts both writers on this frame's plane; false when it cannot be measured. */
function beginLinks(writers: readonly LinkWriter[], world: WorldState, state: RootState): boolean {
  const camera = state.camera;
  const box = state.size;
  const z = planeZ(world);
  // The trace width at the plane's depth, measured at the view's centre.
  if (!clientToPlaneZ(_onPlane, camera, box, box.left + box.width / 2, box.top + box.height / 2, z)) return false;
  if (!worldToClient(_screen, camera, box, _onPlane)) return false;
  const planePx = pixelsPerUnitAt(camera, box, _screen.depth);
  if (!(planePx > 0)) return false;
  for (const writer of writers) writer.begin(camera, box, z, planePx, LINK_WIDTH_PX);
  return true;
}

function setWeight(m: LinkMesh, weight: number, world: WorldState): boolean {
  const u = m.mesh.material.uniforms;
  u.uWeight.value = weight;
  u.uTraceWeight.value = weight;
  const visible = weight > MIN_WEIGHT && world.powerStartMs > 0 && motion.story.practice !== "";
  m.mesh.visible = visible;
  if (!visible) return false;
  u.uTime.value = world.time;
  u.uPowerT.value = powerSeconds(world.powerStartMs, motion.time.now);
  u.uPowerOrigin.value.copy(world.powerOrigin);
  return true;
}

export default function CellLinks({ world }: { world: WorldState }): JSX.Element {
  const [links] = useState(() => createLinkMesh(MAX_QUADS));
  const [writer] = useState(() => new LinkWriter(links));
  const [pillLinks] = useState(() => createLinkMesh(MAX_PILL_QUADS));
  const [pillWriter] = useState(() => new LinkWriter(pillLinks));

  useEffect(() => {
    return () => {
      for (const { mesh } of [links, pillLinks]) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    };
  }, [links, pillLinks]);

  useFrame((state) => {
    const grid = setWeight(links, world.cellLinks, world);
    const pills = setWeight(pillLinks, world.droplets, world) && world.pills.count > 0;
    pillLinks.mesh.visible = pills;
    if (!grid && !pills) return;
    if (!beginLinks([writer, pillWriter], world, state)) {
      uploadLinks(links, 0);
      uploadLinks(pillLinks, 0);
      return;
    }
    if (grid) {
      const rows = collectCards();
      const fan = cardFan();
      if (rows > 0) buildGrid(writer, fan);
      const cta = laidOut(anchorRects.get(ANCHORS.practiceCtaCell));
      if (cta) buildRails(writer, rows, fan, cta, state.size);
      uploadLinks(links, writer.quad);
    }
    if (pills) {
      buildPillNetwork(pillWriter, world.pills);
      uploadLinks(pillLinks, pillWriter.quad);
    }
  }, FRAME_ORDER.late);

  return (
    <>
      <primitive object={links.mesh} />
      <primitive object={pillLinks.mesh} />
    </>
  );
}
