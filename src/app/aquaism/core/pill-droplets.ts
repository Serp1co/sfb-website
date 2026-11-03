/* ------------------------------------------------------------------ */
/*  The technology pills' droplets (owner decision 2026-11-02,         */
/*  choreography v3.1: "small metaballs inside each technology         */
/*  panel"). A pill is too small for the field's grid (its droplet's   */
/*  radius is about one grid cell), so each droplet is an instance of  */
/*  one refractive bead in the orb's own glass, all drawn in one call. */
/*  The orb hands its liquid over to them (OrbControls.droplets): as   */
/*  the pills' section becomes current they leave its body, fly to     */
/*  their pills and grow while the metaballs dissolve, and as it is    */
/*  left they fly back into the body. Each rests centred in its pill's */
/*  bead window (the clear [data-glass-window] at the pill's leading   */
/*  end, logo-v3-2.md), so it reads as a ball, not a glow behind the   */
/*  label; it wobbles gently, shies from the pointer over its pill and */
/*  jiggles when pressed, never leaving that window, and is published  */
/*  as one of the orb's bodies, so its own pill is energized           */
/*  (glass/energy.ts).                                                 */
/* ------------------------------------------------------------------ */

import * as THREE from "three";
import { motion } from "../../motion/store";
import { approach, clamp, smoothstep } from "./math";
import { GROUP_PALETTES } from "./orb-bodies";
import { GROUP_COUNT, MAX_DROPLETS, type OrbControls } from "./orb-controls";
import { ATTENUATION_COLOUR, ATTENUATION_DISTANCE } from "./orb-field";
import { clientToPlaneZ, pixelsPerUnitAt, worldToClient, type ScreenBox, type ScreenPoint } from "./projection";

/** The bead: enough segments for a round silhouette at ~30 px across. */
const BEAD_WIDTH_SEGMENTS = 24;
const BEAD_HEIGHT_SEGMENTS = 16;
/** The glass a ray crosses in a droplet, world units: a short lens, about its diameter at 1440 px. */
const BEAD_THICKNESS = 0.3;

/**
 * The hand-over: the droplet nearest the body leaves first, the farthest this share of the
 * hand-over later; each reaches full size over the first share of its own flight.
 */
const STAGGER = 0.35;
const GROW_SHARE = 0.6;

/** The gentle wobble: each axis swells and squeezes by this share, over its own period (seconds). */
const WOBBLE = 0.06;
const WOBBLE_PERIODS: readonly [number, number] = [2.3, 3.1];
/**
 * A press on a droplet jiggles it this much more, faster, easing out with this time constant (s).
 * The squeeze is free; the stretch takes only the room its window leaves.
 */
const KICK_WOBBLE = 0.22;
const KICK_RATE = (2 * Math.PI) / 0.32;
const KICK_TAU = 0.45;
/** A droplet's edge stays this far (CSS px) inside its window's, its swell included: wholly inside it. */
const WINDOW_MARGIN_PX = 1.5;
/**
 * The pointer over a pill pushes its droplet away, as far as its window leaves room; the push
 * falls off over this share of the pill's half width.
 */
const SHY_REACH = 1.6;
/** The droplet follows that push with this time constant (s). */
const SHY_TAU = 0.12;

/** Below this share of its size a droplet is neither drawn nor published (it is inside the body). */
const MIN_SIZE = 0.02;
/** It counts as one of the orb's bodies (lights its pill) once this grown. */
const PUBLISH_SIZE = 0.35;

export interface PillDroplets {
  mesh: THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshPhysicalMaterial>;
  /** Per droplet: the pointer's push (client px) and the press jiggle, 1 just after a press. */
  shyX: Float64Array;
  shyY: Float64Array;
  kick: Float64Array;
  /** Scene seconds of the wobble. */
  time: number;
  /** As drawn this frame (client px), for the published bodies and the presses: centre, radius, how grown. */
  x: Float64Array;
  y: Float64Array;
  radius: Float64Array;
  size: Float64Array;
  /** Droplets drawn this frame (the first `count` pills). */
  count: number;
}

export function createPillDroplets(): PillDroplets {
  const material = new THREE.MeshPhysicalMaterial({
    // The instance colours (the practice's palette) tint it, as the vertex colours tint the orb.
    color: 0xffffff,
    transmission: 1,
    thickness: BEAD_THICKNESS,
    roughness: 0,
    metalness: 0,
    ior: 1.33,
    clearcoat: 1,
    clearcoatRoughness: 0,
    attenuationColor: new THREE.Color(ATTENUATION_COLOUR),
    attenuationDistance: ATTENUATION_DISTANCE,
  });
  const geometry = new THREE.SphereGeometry(1, BEAD_WIDTH_SEGMENTS, BEAD_HEIGHT_SEGMENTS);
  const mesh = new THREE.InstancedMesh(geometry, material, MAX_DROPLETS);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Placed anew every frame across the page: the bounds would always be stale.
  mesh.frustumCulled = false;
  // Always in the scene, drawing no instance while there are no droplets: its program compiles at
  // boot with the orb's (scene-compile.ts), not in the frame the first droplet appears. It adds no
  // pass: the orb's transmission pass is drawn anyway.
  mesh.count = 0;
  const colour = new THREE.Color();
  for (let k = 0; k < MAX_DROPLETS; k++) mesh.setColorAt(k, colour.setRGB(1, 1, 1));
  return {
    mesh,
    shyX: new Float64Array(MAX_DROPLETS),
    shyY: new Float64Array(MAX_DROPLETS),
    kick: new Float64Array(MAX_DROPLETS),
    time: 0,
    x: new Float64Array(MAX_DROPLETS),
    y: new Float64Array(MAX_DROPLETS),
    radius: new Float64Array(MAX_DROPLETS),
    size: new Float64Array(MAX_DROPLETS),
    count: 0,
  };
}

/**
 * The largest droplet radius up to `wanted` (client px) that rests wholly inside a window of half
 * extents `hw` by `hh` at its centre, its wobble's swell included (a round window holds a disc of
 * its shorter half extent, a pill-shaped one too).
 */
export function dropletFit(hw: number, hh: number, wanted: number): number {
  const room = (Math.min(hw, hh) - WINDOW_MARGIN_PX) / (1 + WOBBLE);
  return Math.max(Math.min(wanted, room), 0);
}

export function disposePillDroplets(d: PillDroplets): void {
  d.mesh.geometry.dispose();
  d.mesh.material.dispose();
  d.mesh.dispose();
}

/** A press landed on droplet k: it jiggles. */
export function kickDroplet(d: PillDroplets, k: number, strength: number): void {
  if (k >= 0 && k < MAX_DROPLETS) d.kick[k] = Math.max(d.kick[k], clamp(strength, 0, 1));
}

function easeOutCubic(t: number): number {
  const u = 1 - clamp(t, 0, 1);
  return 1 - u * u * u;
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _rotation = new THREE.Quaternion();
const _colour = new THREE.Color();
const _screen: ScreenPoint = { x: 0, y: 0, depth: 0 };

/**
 * Places this frame's droplets: each between the liquid's body (client px `sourceX`, `sourceY`)
 * and its rest point in its pill's window by the hand-over, its push and jiggle stepped on the
 * scene clock (`dt`, 0 while paused; no motion of its own with reduced motion), cast onto the
 * bodies' plane (the orb's centre depth) through this frame's camera.
 */
export function updatePillDroplets(
  d: PillDroplets,
  controls: OrbControls,
  camera: THREE.Camera,
  box: ScreenBox,
  dt: number,
  sourceX: number,
  sourceY: number,
  reducedMotion: boolean,
): void {
  const drops = controls.droplets;
  const handover = clamp(drops.handover, 0, 1);
  const n = Math.min(drops.count, MAX_DROPLETS);
  const mesh = d.mesh;
  d.count = 0;
  if (!(handover > 0) || n === 0 || !Number.isFinite(sourceX) || !Number.isFinite(sourceY)) {
    mesh.count = 0;
    return;
  }
  if (!reducedMotion) d.time += dt;
  const pointer = motion.pointer;
  const pointing = !reducedMotion && controls.pointerEnabled && pointer.inside && pointer.x > -9000;
  const shy = 1 - approach(dt, SHY_TAU);
  const kickFade = 1 - approach(dt, KICK_TAU);
  const group = controls.practiceGroup;
  const z = controls.centre.z;

  let farthest = 1;
  for (let k = 0; k < n; k++) farthest = Math.max(farthest, Math.hypot(drops.x[k] - sourceX, drops.y[k] - sourceY));

  let drawn = 0;
  for (let k = 0; k < n; k++) {
    // Its rest point (the window's centre), the window's half extents and its pill's rect.
    const restX = drops.x[k];
    const restY = drops.y[k];
    const rest = drops.radius[k];
    const hw = drops.hw[k];
    const hh = drops.hh[k];
    const o = 4 * k;
    const pillLeft = drops.pill[o];
    const pillTop = drops.pill[o + 1];
    const pillRight = drops.pill[o + 2];
    const pillBottom = drops.pill[o + 3];

    // What its window leaves round it: the press's stretch takes at most the spare share of its
    // radius, and the push the px left after the largest swell (so it never leaves the window).
    const inner = Math.min(hw, hh) - WINDOW_MARGIN_PX;
    const stretch = rest > 0 ? clamp(inner / rest - 1 - WOBBLE, 0, KICK_WOBBLE) : 0;
    const swell = rest * (1 + WOBBLE + stretch);
    const roomX = Math.max(hw - WINDOW_MARGIN_PX - swell, 0);
    const roomY = Math.max(hh - WINDOW_MARGIN_PX - swell, 0);

    // The pointer's push, over the pill only, within the window's room.
    let pushX = 0;
    let pushY = 0;
    if (pointing && pointer.x >= pillLeft && pointer.x <= pillRight && pointer.y >= pillTop && pointer.y <= pillBottom) {
      const dx = restX + d.shyX[k] - pointer.x;
      const dy = restY + d.shyY[k] - pointer.y;
      const distance = Math.hypot(dx, dy) || 1;
      const strength = clamp(1 - distance / (SHY_REACH * Math.max((pillRight - pillLeft) / 2, 1)), 0, 1);
      pushX = (dx / distance) * strength * roomX;
      pushY = (dy / distance) * strength * roomY;
    }
    if (dt > 0) {
      d.shyX[k] += (clamp(pushX, -roomX, roomX) - d.shyX[k]) * shy;
      d.shyY[k] += (clamp(pushY, -roomY, roomY) - d.shyY[k]) * shy;
      d.kick[k] *= kickFade;
    }
    // A window that shrank (a resize) never leaves the droplet outside it, even between pushes.
    d.shyX[k] = clamp(d.shyX[k], -roomX, roomX);
    d.shyY[k] = clamp(d.shyY[k], -roomY, roomY);

    // The hand-over: out of the body (nearest first), growing, into its window; and back.
    const stagger = (STAGGER * Math.hypot(restX - sourceX, restY - sourceY)) / farthest;
    const flight = clamp((handover - stagger) / (1 - STAGGER), 0, 1);
    const size = smoothstep(0, GROW_SHARE, flight);
    const along = easeOutCubic(flight);
    const x = sourceX + (restX + d.shyX[k] - sourceX) * along;
    const y = sourceY + (restY + d.shyY[k] - sourceY) * along;
    const radius = rest * size;
    d.x[k] = x;
    d.y[k] = y;
    d.radius[k] = radius;
    d.size[k] = size;
    if (size < MIN_SIZE || !(radius > 0)) continue;
    if (!clientToPlaneZ(_position, camera, box, x, y, z) || !worldToClient(_screen, camera, box, _position)) continue;
    const unitPx = pixelsPerUnitAt(camera, box, _screen.depth);
    if (!(unitPx > 0)) continue;
    const r = radius / unitPx;
    // The wobble: two axes out of phase, the third keeping the volume; a press adds a quick jiggle,
    // squeezing one axis and stretching the other as far as the window allows.
    const t = d.time;
    const jiggle = KICK_WOBBLE * d.kick[k] * Math.sin(KICK_RATE * t);
    const jiggleX = jiggle > 0 ? Math.min(jiggle, stretch) : jiggle;
    const jiggleY = jiggle < 0 ? Math.min(-jiggle, stretch) : -jiggle;
    const sx = 1 + (reducedMotion ? 0 : WOBBLE * Math.sin((2 * Math.PI * t) / WOBBLE_PERIODS[0] + 1.7 * k)) + jiggleX;
    const sy = 1 + (reducedMotion ? 0 : WOBBLE * Math.sin((2 * Math.PI * t) / WOBBLE_PERIODS[1] + 2.3 * k)) + jiggleY;
    const sz = 1 / Math.sqrt(Math.max(sx * sy, 0.25));
    _matrix.compose(_position, _rotation, _scale.set(r * sx, r * sy, r * sz));
    mesh.setMatrixAt(drawn, _matrix);
    // The practice's palette, alternating its two colours (every group's on a page without one).
    const palette = GROUP_PALETTES[group >= 0 ? group : k % GROUP_COUNT];
    mesh.setColorAt(drawn, _colour.setHex(palette[k % 2]));
    drawn++;
  }
  d.count = n;
  mesh.count = drawn;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/** Whether droplet k counts as one of the orb's bodies this frame (grown enough to light its pill). */
export function dropletPublished(d: PillDroplets, k: number): boolean {
  return k < d.count && d.size[k] >= PUBLISH_SIZE && d.radius[k] > 0;
}
