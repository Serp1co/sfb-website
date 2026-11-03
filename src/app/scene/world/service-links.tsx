"use client";

/*
 * The service circuitry (owner decision 2026-11-02): while the orb sits split in the three
 * Services windows, traces link the cards. At each window's centre, where its body rests, sits a
 * junction (junctions.md): a point, not a block (logo-v3-2.md), a small round via, and every trace
 * runs into one: so a body pushed or splashed aside never leaves a hole in the circuit behind it.
 * Between each pair of neighbouring cards a bus of three traces fans out of one window's junction,
 * runs across the card, through the gap (with a jog there) and fans into the next window's
 * junction, carrying pulses between the practices both ways; under the row a drop from each
 * junction joins a bus in the open below the cards. Laid out on screen from the anchors every
 * frame (the windows, the cards), projected onto a plane behind the bodies, so the bodies refract
 * the junctions and traces they sit on. Same additive opaque-list material and fade to black as
 * the partner traces: crisp in the gaps and under the row, softened behind the frost (the composite's).
 *
 * Its weight is the Services pose's share (world.links): it comes in with the split and goes out
 * with the merge. At most MAX_QUADS quads, rebuilt on the CPU each visible frame.
 */

import { useEffect, useState, type JSX } from "react";
import * as THREE from "three";
import { useFrame, type RootState } from "@react-three/fiber";
import { SERVICE_SLUGS } from "../../data/site-data";
import { ANCHORS, anchorRects, type AnchorRect } from "../../glass/contract";
import { motion } from "../../motion/store";
import { FRAME_ORDER } from "../../aquaism/core/frame-order";
import { clientToPlaneZ, pixelsPerUnitAt, worldToClient, type ScreenPoint } from "../../aquaism/core/projection";
import { CELL_FILL } from "./choreography";
import { LinkWriter, createLinkMesh, laidOut, uploadLinks } from "./link-writer";
import { FAN_SHARE } from "./partner-routes";
import { powerSeconds } from "./world-materials";
import type { WorldState } from "./world-state";

/** The links' plane: behind the Services bodies (z about 0, radius under 1), in front of the flight boards. */
const LINK_PLANE_Z = -2.2;
/** Finer than the partner traces: these run behind text-bearing cards. */
const LINK_WIDTH_PX = 3;
/** Traces per link between neighbouring cards, and their pitch (CSS px). */
const LINK_TRACES = 3;
const LINK_PITCH_PX = 12;
/** The jog in the gap: each link's bus steps down (then the next one up) by this many px over a 45-degree leg. */
const LINK_JOG_PX = 16;
/** The bus under the row: this far below the cards' lowest edge (CSS px), the drops leaving each window's junction. */
const BUS_DROP_PX = 22;
/** Windows share a row when their centres are within this share of the shorter one's height (a phone stacks them). */
const ROW_TOLERANCE = 0.5;
/**
 * Corners per route (a junction, the fan's end, jog, jog, the fan's start, the next junction) and
 * quads in all: 2 links x 3 traces x 9 pieces, the bus's 7, three junctions, and some to spare.
 */
const MAX_CORNERS = 6;
const MAX_QUADS = 80;
/** Below this weight nothing is drawn. */
const MIN_WEIGHT = 0.003;

const _screen: ScreenPoint = { x: 0, y: 0, depth: 0 };
const _onPlane = new THREE.Vector3();
const _windows: AnchorRect[] = Array.from({ length: SERVICE_SLUGS.length }, () => ({ x: 0, y: 0, width: 0, height: 0, visible: false }));
const _corners = new Float64Array(2 * MAX_CORNERS);

/** The laid-out service card holding a window (its centre inside the card), or null. */
function cardOf(window: AnchorRect, cards: AnchorRect[] | undefined): AnchorRect | null {
  const x = window.x + window.width / 2;
  const y = window.y + window.height / 2;
  for (const card of cards ?? []) {
    if (card.width > 0 && card.height > 0 && x >= card.x && x <= card.x + card.width && y >= card.y && y <= card.y + card.height) return card;
  }
  return null;
}

function setCorners(...points: number[]): number {
  const n = Math.min(points.length >> 1, MAX_CORNERS);
  for (let k = 0; k < 2 * n; k++) _corners[k] = points[k];
  return n;
}

/** Lays the links out from this frame's windows and cards; returns the quads written. */
function buildLinks(writer: LinkWriter, state: RootState): number {
  const camera = state.camera;
  const box = state.size;
  for (let g = 0; g < SERVICE_SLUGS.length; g++) {
    const frame = laidOut(anchorRects.get(ANCHORS.practice(SERVICE_SLUGS[g])));
    if (!frame) return 0;
    Object.assign(_windows[g], frame);
  }
  // The trace width at the plane's depth, measured at the middle window.
  const middle = _windows[1];
  if (!clientToPlaneZ(_onPlane, camera, box, middle.x + middle.width / 2, middle.y + middle.height / 2, LINK_PLANE_Z)) return 0;
  if (!worldToClient(_screen, camera, box, _onPlane)) return 0;
  const planePx = pixelsPerUnitAt(camera, box, _screen.depth);
  if (!(planePx > 0)) return 0;
  writer.begin(camera, box, LINK_PLANE_Z, planePx, LINK_WIDTH_PX);

  // The junctions at the windows' centres, and the fan the traces converge into them over, from the
  // bodies' rest radius (every body is the smallest window's fit, choreography): under the body.
  let side = Infinity;
  for (const w of _windows) side = Math.min(side, w.width, w.height);
  const fan = FAN_SHARE * CELL_FILL * side;
  for (let g = 0; g < _windows.length; g++) {
    const w = _windows[g];
    writer.junction(w.x + w.width / 2, w.y + w.height / 2, 1, g * 2.1);
  }

  // Between neighbours: out of one window's junction, across the card and the gap, into the next
  // one's; stacked on a phone, down through the gap between the cards instead.
  const cards = anchorRects.get(ANCHORS.serviceCard);
  let row = true;
  for (let k = 0; k + 1 < _windows.length; k++) {
    const a = _windows[k];
    const b = _windows[k + 1];
    const acx = a.x + a.width / 2;
    const acy = a.y + a.height / 2;
    const bcx = b.x + b.width / 2;
    const bcy = b.y + b.height / 2;
    const jog = k % 2 === 0 ? LINK_JOG_PX : -LINK_JOG_PX;
    const step = Math.abs(jog) / 2;
    const across = Math.abs(acy - bcy) <= ROW_TOLERANCE * Math.min(a.height, b.height);
    if (!across) row = false;
    // Where the jog goes: the gap between the two windows' cards when they are measured, else between the windows.
    const cardA = cardOf(a, cards);
    const cardB = cardOf(b, cards);
    const gap = across
      ? cardA && cardB ? (cardA.x + cardA.width + cardB.x) / 2 : (a.x + a.width + b.x) / 2
      : cardA && cardB ? (cardA.y + cardA.height + cardB.y) / 2 : (a.y + a.height + b.y) / 2;
    const middle = across ? (acy + bcy) / 2 - jog / 2 : (acx + bcx) / 2 - jog / 2;
    for (let j = 0; j < LINK_TRACES; j++) {
      const lane = middle + (j - (LINK_TRACES - 1) / 2) * LINK_PITCH_PX;
      // Each lane fans out of a's junction point to its own height (or column), and into b's.
      if (across) {
        setCorners(acx, acy, acx + fan, lane, gap - step, lane, gap + step, lane + jog, bcx - fan, lane + jog, bcx, bcy);
      } else {
        setCorners(acx, acy, lane, acy + fan, lane, gap - step, lane + jog, gap + step, lane + jog, bcy - fan, bcx, bcy);
      }
      // Alternate directions, so pulses travel both ways between the practices.
      writer.route(_corners, MAX_CORNERS, j % 2 === 1);
    }
  }

  // Under the row (side by side only): a drop from each junction to a bus below the cards.
  let cardsBottom = -Infinity;
  for (const card of cards ?? []) if (card.width > 0 && card.height > 0) cardsBottom = Math.max(cardsBottom, card.y + card.height);
  if (row && Number.isFinite(cardsBottom)) {
    const bus = cardsBottom + BUS_DROP_PX;
    const middleX = _windows[1].x + _windows[1].width / 2;
    for (let g = 0; g < _windows.length; g++) {
      const w = _windows[g];
      const x = w.x + w.width / 2;
      const y = w.y + w.height / 2;
      if (g === 1) writer.route(_corners, setCorners(x, y, x, bus), false);
      else writer.route(_corners, setCorners(x, y, x, bus, middleX, bus), g > 1);
    }
  }
  return writer.quad;
}

export default function ServiceLinks({ world }: { world: WorldState }): JSX.Element {
  const [links] = useState(() => createLinkMesh(MAX_QUADS));
  const [writer] = useState(() => new LinkWriter(links));

  useEffect(() => {
    const { mesh } = links;
    return () => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    };
  }, [links]);

  useFrame((state) => {
    const u = links.mesh.material.uniforms;
    u.uWeight.value = world.links;
    u.uTraceWeight.value = world.links;
    const visible = world.links > MIN_WEIGHT && world.powerStartMs > 0;
    links.mesh.visible = visible;
    if (!visible) return;
    u.uTime.value = world.time;
    u.uPowerT.value = powerSeconds(world.powerStartMs, motion.time.now);
    u.uPowerOrigin.value.copy(world.powerOrigin);

    uploadLinks(links, buildLinks(writer, state));
  }, FRAME_ORDER.late);

  return <primitive object={links.mesh} />;
}
