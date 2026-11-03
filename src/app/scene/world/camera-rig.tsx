"use client";

/*
 * The camera rig: first in the world's frame (FRAME_ORDER.rig). It holds the pose of the section
 * being read (the one crossing the viewport centre, with hysteresis) and, when that changes, moves
 * to the next section's pose on its own clock (section-transition.ts, choreography v3.1): a timed
 * blend of the two, eased in and out with the transit dive, that finishes whatever the scroll does
 * meanwhile; no pose follows the scroll position proportionally. It springs toward the result,
 * adds pointer parallax, idle breathing and the drag orbit, then moves the camera. It also writes
 * what the rest of the world reads this frame: the orb's controls (its layouts, the panels holding
 * its bodies in, the pills' droplets, its field box's wish), the board emphasis, the partner-node
 * weight and the traces' morph, the circuitry's weights, the flight travel, the shader clock and
 * the power-on.
 *
 * Everything moves on the scene clock (motion.time.sceneDelta): while the visitor has paused the
 * animation the rig holds still, the boards stay where they were, and the circuitry stands fully
 * powered. A page change while paused, or in the reduced-motion still, jumps to the new pose
 * (and asks the orb to settle there at once) instead of flying.
 *
 * The orb's bodies live inside the panels and the slots (choreography), which scroll: the share
 * of the pose that rides with the page is carried with it (not sprung, so the bodies stay in their
 * panels however fast the page scrolls), through holds and moves alike. Through Partners and
 * Contact the orb holds one of the page's stations (orb-slots.ts: slot A, slot B, the contact
 * cards). Between slots A and B it glides like a section move: triggered, on its own clock, eased
 * in and out with the transit dive, a turn back running it backwards from where it is; the liquid
 * is carried with the glide, so the drawn orb stays on the partner circuit's junction (owner report
 * 2026-11-02: it lagged behind it). Any other change of station glides on the pose spring with the dive.
 *
 * Split into cells, the orb's field box is the view box (orb-field.ts, choreography v3), measured
 * here every frame from this frame's camera: the visible region at the bodies' depth, narrowed to
 * where the cells and the drawn bodies are, its cells the size on screen the bodies stay smooth at.
 */

import { useState } from "react";
import * as THREE from "three";
import { useFrame, type RootState } from "@react-three/fiber";
import { ANCHORS } from "../../glass/contract";
import { MAX_ORB_BODIES, motion } from "../../motion/store";
import { FRAME_ORDER } from "../../aquaism/core/frame-order";
import {
  approach,
  clamp,
  createSpring,
  createSpringVec3,
  omegaForSettle,
  smoothstep,
  snapSpringVec3,
  stepSpring,
  stepSpringVec3,
  type Spring,
  type SpringVec3,
} from "../../aquaism/core/math";
import { FIELD_FLOOR_STEPS, FIELD_SCALE, ORB_RADIUS } from "../../aquaism/core/orb-field";
import { pixelsPerUnitAt, worldToClient, type ScreenPoint } from "../../aquaism/core/projection";
import {
  FALLBACK_POSE,
  applyTransitArc,
  blendPoses,
  bodyCellPx,
  createPose,
  evaluatePose,
  holdsSlot,
  isPortrait,
  measureContactCells,
  measureSlot,
  type Pose,
  type PoseContext,
} from "./choreography";
import { FLOOR_Y, FLOOR_Y_PORTRAIT } from "./layers";
import { createOrbDirector, directOrb, type OrbDirector } from "./orb-direction";
import {
  createSlotTracker,
  createSlotView,
  updateSlotTracker,
  type SlotChoice,
  type SlotTracker,
  type SlotView,
} from "./orb-slots";
import {
  TRANSITION_S,
  advanceSection,
  createSectionTransition,
  easeInOut,
  pickSection,
  retargetSection,
  sectionProgress,
  settleSection,
  type SectionTransition,
} from "./section-transition";
import { measureTechPills } from "./tech-pills";
import { measureViewBox } from "./view-box";
import type { WorldState } from "./world-state";

/**
 * The pose spring: critically damped, ~0.6 s. It rounds off the timed moves between sections
 * (TRANSITION_S), a reversal's turn, a change of station other than A<->B and a layout's jumps (a resize).
 */
const POSE_SETTLE = 0.6;

/**
 * A change of station other than A<->B (B to the contact cards or the fallback, and back) dives
 * like a page change, over this long: the orb passes behind the heading and the bands small and
 * fogged, and resurfaces in its new place.
 */
const SLOT_TRANSIT_S = 0.9;
/**
 * The glide between slots A and B: its ease and its dive on one clock, as long as a section move
 * (v3.1: triggered, timed, eased in and out), so the circuit's morph ends exactly as the orb lands.
 */
const SLOT_GLIDE_S = TRANSITION_S;
/**
 * Meanwhile the orb's position and size spring settles in this long (the rest of the pose keeps
 * POSE_SETTLE): it only rounds the ease off (a turn back's corner), so the glide lands about 1 s
 * after the trigger instead of trailing to 1.3 s.
 */
const SLOT_GLIDE_SETTLE = 0.35;
/** The glide (and its carry) ends once its clock has run out and the orb's spring is this slow (world units/s, ~3 px/s). */
const GLIDE_LANDED_SPEED = 0.05;
/** It carries the liquid only while the pose is wholly the slots' (not mid-way to or from another section's). */
const GLIDE_CARRY_SHARE = 0.999;
/** The scroll's slosh fades over this long when a glide starts (the liquid rides the junction), and back after it. */
const SLOSH_GLIDE_SETTLE = 0.2;
/**
 * How docked the orb is in its slot: fully within the first share of the slot's height from the
 * slot's centre, not at all beyond the second. The partner traces first draw in once it has docked.
 */
const DOCK_NEAR = 0.12;
const DOCK_FAR = 0.4;

/**
 * A client navigation bridges the two pages with the transit dive (choreography) over this long
 * from motion.story.changedAt: the orb passes behind the new headline small and fogged while
 * its lines rise, and resurfaces at the new pose (review M6).
 */
const ROUTE_TRANSIT_S = 0.9;
/**
 * With the clock stopped, a page change is a jump, and the rig keeps jumping to the target this
 * long after it (wall clock), so anchors and the practice slug that arrive a few ticks after the
 * swap still land in the pose. The reduced-motion still re-renders the whole scene for as long
 * (scene-canvas.tsx), so those late jumps reach the screen too.
 */
export const ROUTE_SNAP_WINDOW_MS = 600;

/** Pointer parallax: up to this many world units of camera shift, damped. */
const PARALLAX = 0.25;
const PARALLAX_SETTLE = 0.8;

/** Drag orbit around the orb: soft limits, a quick follow, and a slow spring back on release. */
const DRAG_MAX_YAW = THREE.MathUtils.degToRad(25);
const DRAG_MAX_PITCH = THREE.MathUtils.degToRad(12);
/** Drag distance (CSS px) at which the orbit reaches ~76% of its limit (tanh(1)). */
const DRAG_YAW_PX = 320;
const DRAG_PITCH_PX = 220;
const DRAG_FOLLOW_SETTLE = 0.15;
const DRAG_RETURN_SETTLE = 1.2;
/**
 * While the drag orbit turns the camera more than this (radians) the panels do not hold their
 * bodies in: the view swings across them, and walls fixed to the page would squeeze the bodies.
 */
const ORBIT_FREE = 0.01;

/** Idle breathing: slow, incommensurate drifts of the camera (world units, seconds). */
const BREATH_AMPLITUDE: readonly [number, number, number] = [0.05, 0.04, 0.07];
const BREATH_PERIOD: readonly [number, number, number] = [9.5, 12.5, 15];

/** World units of board travel per CSS px of scroll (~14 units over the home page). */
const TRAVEL_PER_PX = 0.004;
/** After a pause, the boards catch up with the scroll they missed with this time constant (s). */
const TRAVEL_RESUME_TAU = 0.35;

/** The orb's lowest point stays this far above the floor board. */
const FLOOR_CLEARANCE = 0.5;
/**
 * A scroll of more than this share of the view in one frame is a jump (an anchor link without
 * smooth scrolling, a phone's tap on the status bar), not motion: when it also changes the section,
 * the bodies are not carried off with the cells they are leaving (on a phone's tall page that sent
 * them a few thousand px away, seconds of flight back) but move from where they are on screen.
 */
const JUMP_SHARE = 0.9;

/**
 * The circuitry powers on this long after the WebGL glass takes over, so the glass and the orb
 * condense first and the power-on is its own beat, its flash past the CSS hand-over (review M1, K3).
 */
const POWER_DELAY_MS = 500;
/**
 * If the WebGL glass is possible but never activates (no HDR targets, a shader that fails to
 * link), the circuitry powers on this long after the first frame anyway.
 */
const POWER_FALLBACK_MS = 4000;
/** By this long after it starts, the power-on front has crossed every board (~63 units at 14/s). */
const POWER_COMPLETE_MS = 6000;

/** The timed glide between slots A and B (camera-rig's own: the section does not change). */
interface SlotGlide {
  /** The slot it left and the one it goes to. */
  from: "a" | "b";
  to: "a" | "b";
  /** Scene seconds into it; SLOT_GLIDE_S once its clock has run out. */
  age: number;
  /** From the change of slot until the orb has landed (or another station cut it short). */
  active: boolean;
  /** The orb's centre as of the last frame (the glide's carry is its motion since), once there is one. */
  lastCentre: THREE.Vector3;
  hasLast: boolean;
  /** The glide's own velocity, the page's scroll left out (world units/s): handed to the liquid if cut short. */
  velocity: THREE.Vector3;
  /** The share of the scroll's slosh the liquid feels: 1 outside a glide, 0 inside. */
  slosh: Spring;
}

interface Rig {
  initialised: boolean;
  context: PoseContext;
  a: Pose;
  b: Pose;
  target: Pose;
  camera: SpringVec3;
  look: SpringVec3;
  orb: SpringVec3;
  scale: Spring;
  boards: Spring;
  nodes: Spring;
  parallaxX: Spring;
  parallaxY: Spring;
  yaw: Spring;
  pitch: Spring;
  director: OrbDirector;
  /** The section whose pose the rig holds, and the timed move to the next (section-transition.ts). */
  sections: SectionTransition;
  /** The story's names the sections index (a new array: a new page, held afresh). */
  storyNames: readonly string[];
  /** motion.story.changedAt as of the last frame, and scene seconds since that page change. */
  changedAt: number;
  routeAge: number;
  /** Board travel the boards are behind (or ahead of) the scroll, after a pause. */
  travelLag: number;
  /** Which station the orb holds, and scene seconds since it last changed (the dive of a change other than A<->B). */
  slots: SlotTracker;
  slotAge: number;
  glide: SlotGlide;
  /** The page's scroll as of the last frame, to carry the anchored orb by its motion. */
  lastScroll: number;
  /** Aimed through the sprung camera to turn that motion into world units at the orb's depth. */
  carryCamera: THREE.PerspectiveCamera;
  /** Aimed through the pose's camera (no parallax, breathing or drag) to measure the traces' morph. */
  morphCamera: THREE.PerspectiveCamera;
  /** Springed values this frame. */
  pose: Pose;
}

function createRig(): Rig {
  return {
    initialised: false,
    context: {
      box: { width: 1, height: 1, left: 0, top: 0 },
      fov: 75,
      fieldResolution: 0,
      fieldFloor: FIELD_FLOOR_STEPS[0],
      satelliteSide: 1,
      portrait: false,
      documentScroll: 0,
      slot: "none",
      slotA: createSlotView(),
      slotB: createSlotView(),
      slotC: createSlotView(),
      glide: 1,
      glideFrom: createSlotView(),
      scratch: new THREE.PerspectiveCamera(),
    },
    a: createPose(),
    b: createPose(),
    target: createPose(),
    camera: createSpringVec3(0, 0, 5),
    look: createSpringVec3(),
    orb: createSpringVec3(),
    scale: createSpring(1),
    boards: createSpring(1),
    nodes: createSpring(0),
    parallaxX: createSpring(0),
    parallaxY: createSpring(0),
    yaw: createSpring(0),
    pitch: createSpring(0),
    director: createOrbDirector(),
    sections: createSectionTransition(),
    storyNames: [],
    changedAt: 0,
    routeAge: ROUTE_TRANSIT_S,
    travelLag: 0,
    slots: createSlotTracker(),
    slotAge: SLOT_TRANSIT_S,
    glide: {
      from: "a",
      to: "a",
      age: SLOT_GLIDE_S,
      active: false,
      lastCentre: new THREE.Vector3(),
      hasLast: false,
      velocity: new THREE.Vector3(),
      slosh: createSpring(1),
    },
    lastScroll: 0,
    carryCamera: new THREE.PerspectiveCamera(),
    morphCamera: new THREE.PerspectiveCamera(),
    pose: createPose(),
  };
}

/** Slot A or slot B: the two stations the orb glides between on its own clock. */
function isSlotAB(choice: SlotChoice): choice is "a" | "b" {
  return choice === "a" || choice === "b";
}

/** Aims `camera` from `eye` at `look` with the real camera's lens (context.fov, the view's aspect). */
function aimCamera(camera: THREE.PerspectiveCamera, context: PoseContext, eye: THREE.Vector3, look: THREE.Vector3): THREE.PerspectiveCamera {
  const box = context.box;
  const aspect = box.width / Math.max(box.height, 1);
  if (camera.fov !== context.fov || camera.aspect !== aspect) {
    camera.fov = context.fov;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }
  camera.position.copy(eye);
  camera.lookAt(look);
  camera.updateMatrixWorld();
  return camera;
}

const UP = new THREE.Vector3(0, 1, 0);
const _position = new THREE.Vector3();
const _look = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _right = new THREE.Vector3();
const _turn = new THREE.Quaternion();
const _carry = new THREE.Vector3();
const _carryEye = new THREE.Vector3();
const _carryLook = new THREE.Vector3();
const _carryOrb = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _orbScreen: ScreenPoint = { x: 0, y: 0, depth: 0 };
const _morphScreen: ScreenPoint = { x: 0, y: 0, depth: 0 };

/**
 * The target pose: the held section's, or the timed move from one section's to the next's (eased,
 * with the transit dive). The section being read is picked from the story position with
 * hysteresis; when it changes the move starts (or turns back, or redirects) and runs on the scene
 * clock: `dt` advances it, so it waits while paused. `fresh` (the first frame, a new page, a jump)
 * holds the current section at once. Returns how much of the blend is the slot poses' (Partners,
 * Contact): the share the slot glide dives by.
 */
function targetPose(rig: Rig, context: PoseContext, reducedMotion: boolean, dt: number, fresh: boolean): number {
  const names = motion.story.names;
  const sections = rig.sections;
  if (names.length === 0) {
    settleSection(sections, 0);
    evaluatePose(rig.target, FALLBACK_POSE, context);
    return 0;
  }
  // Reduced motion: one still frame of the page's top, in the page's own first pose (the hero,
  // or a practice page's hero), placed against the document (context.documentScroll). Nothing moves.
  if (reducedMotion) {
    settleSection(sections, 0);
    evaluatePose(rig.target, names[0], context);
    return 0;
  }
  const count = names.length;
  const renamed = names !== rig.storyNames;
  rig.storyNames = names;
  const current = pickSection(fresh || renamed ? -1 : sections.current, motion.story.position, count);
  if (fresh || renamed || sections.from >= count || sections.to >= count) settleSection(sections, current);
  else {
    sections.current = current;
    retargetSection(sections, current);
  }
  const t = advanceSection(sections, dt);
  const here = holdsSlot(names[sections.from], context);
  if (sections.from === sections.to) {
    evaluatePose(rig.target, names[sections.to], context);
    return here ? 1 : 0;
  }
  const next = holdsSlot(names[sections.to], context);
  evaluatePose(rig.a, names[sections.from], context);
  evaluatePose(rig.b, names[sections.to], context);
  // Partners to Contact keeps the orb in the same slot: only the slot glide dives.
  blendPoses(rig.target, rig.a, rig.b, t, !(here && next), sectionProgress(sections));
  return (here ? 1 - t : 0) + (next ? t : 0);
}

function copySlotView(out: SlotView, from: SlotView): void {
  out.valid = from.valid;
  out.x = from.x;
  out.y = from.y;
  out.height = from.height;
  out.radius = from.radius;
}

/**
 * The anchored orb moves with the page: the page's motion on screen since the last frame (its
 * scroll), times how much of the pose rides with it, as a world offset into `out`. Converted
 * across the view at the orb's current depth through the camera as it stands, so the orb's image
 * moves exactly with its panels even while it still dives toward their depth (where a step on the
 * pose's plane would carry it too far). Zero on a snap, on a jump into another section's layout
 * (JUMP_SHARE), or with the clock stopped (paused, the orb stays put like everything else) or
 * reduced motion (a still of the page top).
 */
function pageCarry(rig: Rig, context: PoseContext, dt: number, snap: boolean, reducedMotion: boolean, out: THREE.Vector3): void {
  out.set(0, 0, 0);
  const scroll = motion.scroll.y;
  const moved = rig.lastScroll - scroll;
  rig.lastScroll = scroll;
  const weight = clamp(rig.target.anchored, 0, 1);
  if (snap || reducedMotion || !(dt > 0) || !(weight > 0) || !Number.isFinite(moved) || moved === 0) return;
  const box = context.box;
  if (Math.abs(moved) > JUMP_SHARE * box.height && rig.sections.from !== rig.sections.to) return;
  const camera = aimCamera(
    rig.carryCamera,
    context,
    _carryEye.set(rig.camera.x.value, rig.camera.y.value, rig.camera.z.value),
    _carryLook.set(rig.look.x.value, rig.look.y.value, rig.look.z.value),
  );
  _carryOrb.set(rig.orb.x.value, rig.orb.y.value, rig.orb.z.value);
  if (!worldToClient(_orbScreen, camera, box, _carryOrb)) return;
  const unitPx = pixelsPerUnitAt(camera, box, _orbScreen.depth);
  if (!(unitPx > 0)) return;
  // The page moved `moved` px down the screen (up when scrolling down); screen y runs against the camera's up.
  out.addScaledVector(_axis.setFromMatrixColumn(camera.matrixWorld, 1), -(moved * weight) / unitPx);
}

/** Springs the pose toward its target: the orb's position and size settle in `orbSettle` s, the rest in POSE_SETTLE. */
function springPose(rig: Rig, dt: number, snap: boolean, orbSettle: number): void {
  const target = rig.target;
  const pose = rig.pose;
  if (snap) {
    snapSpringVec3(rig.camera, target.camera);
    snapSpringVec3(rig.look, target.look);
    snapSpringVec3(rig.orb, target.orb);
    for (const [spring, value] of [
      [rig.scale, target.scale],
      [rig.boards, target.boards],
      [rig.nodes, target.nodes],
    ] as const) {
      spring.value = value;
      spring.velocity = 0;
    }
  }
  const omega = omegaForSettle(POSE_SETTLE);
  const orbOmega = omegaForSettle(orbSettle);
  stepSpringVec3(rig.camera, target.camera, omega, dt, pose.camera);
  stepSpringVec3(rig.look, target.look, omega, dt, pose.look);
  stepSpringVec3(rig.orb, target.orb, orbOmega, dt, pose.orb);
  pose.scale = stepSpring(rig.scale, target.scale, orbOmega, dt);
  pose.boards = stepSpring(rig.boards, target.boards, omega, dt);
  pose.nodes = stepSpring(rig.nodes, target.nodes, omega, dt);
}

/** Camera = pose + parallax + breathing, then orbited around the orb by the drag. */
function placeCamera(rig: Rig, state: RootState, world: WorldState, dt: number, reducedMotion: boolean): void {
  const pose = rig.pose;
  const box = state.size;
  const pointer = motion.pointer;

  let parallaxX = 0;
  let parallaxY = 0;
  if (!reducedMotion && pointer.type !== "touch" && pointer.inside && pointer.x > -9000 && box.width > 0) {
    parallaxX = clamp(((pointer.x - box.left) / box.width) * 2 - 1, -1, 1) * PARALLAX;
    parallaxY = -clamp(((pointer.y - box.top) / box.height) * 2 - 1, -1, 1) * PARALLAX;
  }
  const parallaxOmega = omegaForSettle(PARALLAX_SETTLE);
  parallaxX = stepSpring(rig.parallaxX, parallaxX, parallaxOmega, dt);
  parallaxY = stepSpring(rig.parallaxY, parallaxY, parallaxOmega, dt);

  _position.copy(pose.camera);
  _look.copy(pose.look);
  if (!reducedMotion) {
    _position.x += parallaxX;
    _position.y += parallaxY;
    const t = world.time;
    _position.x += Math.sin((2 * Math.PI * t) / BREATH_PERIOD[0]) * BREATH_AMPLITUDE[0];
    _position.y += Math.sin((2 * Math.PI * t) / BREATH_PERIOD[1] + 1.3) * BREATH_AMPLITUDE[1];
    _position.z += Math.sin((2 * Math.PI * t) / BREATH_PERIOD[2] + 2.1) * BREATH_AMPLITUDE[2];
  }

  // Drag orbit about the orb centre.
  const drag = motion.drag;
  const dragging = !reducedMotion && drag.active;
  const yawTarget = dragging ? -DRAG_MAX_YAW * Math.tanh(drag.dx / DRAG_YAW_PX) : 0;
  const pitchTarget = dragging ? DRAG_MAX_PITCH * Math.tanh(drag.dy / DRAG_PITCH_PX) : 0;
  const dragOmega = omegaForSettle(dragging ? DRAG_FOLLOW_SETTLE : DRAG_RETURN_SETTLE);
  const yaw = stepSpring(rig.yaw, Number.isFinite(yawTarget) ? yawTarget : 0, dragOmega, dt);
  const pitch = stepSpring(rig.pitch, Number.isFinite(pitchTarget) ? pitchTarget : 0, dragOmega, dt);
  if (Math.abs(yaw) > 1e-5 || Math.abs(pitch) > 1e-5) {
    const pivot = world.orb.centre;
    _offset.subVectors(_position, pivot);
    _look.sub(pivot);
    _turn.setFromAxisAngle(UP, yaw);
    _offset.applyQuaternion(_turn);
    _look.applyQuaternion(_turn);
    _right.crossVectors(UP, _offset).normalize();
    if (_right.lengthSq() > 0) {
      _turn.setFromAxisAngle(_right, -pitch);
      _offset.applyQuaternion(_turn);
      _look.applyQuaternion(_turn);
    }
    _position.copy(pivot).add(_offset);
    _look.add(pivot);
  }

  const camera = state.camera;
  camera.position.copy(_position);
  camera.lookAt(_look);
  camera.updateMatrixWorld();
}

function updatePower(world: WorldState, nowMs: number): void {
  if (motion.paused) {
    // Paused (possibly from the start, a stored choice): the power-on is a moving front, so the
    // circuitry simply stands powered. The latch is final: resuming does not replay it.
    if (world.powerStartMs === 0 || nowMs - world.powerStartMs < POWER_COMPLETE_MS) {
      world.powerStartMs = nowMs - POWER_COMPLETE_MS;
      world.powerOrigin.copy(world.orb.centre);
    }
    return;
  }
  if (world.powerStartMs > 0) return;
  const engine = motion.engine;
  let start = 0;
  if (engine.activatedAt > 0) start = engine.activatedAt + POWER_DELAY_MS;
  else if (engine.sceneReadyAt > 0) {
    if (motion.capabilities.glassMode === "css") start = engine.sceneReadyAt + POWER_DELAY_MS;
    else if (nowMs - engine.sceneReadyAt > POWER_FALLBACK_MS) start = nowMs;
  }
  if (start > 0) {
    world.powerStartMs = start;
    world.powerOrigin.copy(world.orb.centre);
  }
}

/**
 * How docked the orb is in the slot it holds, 0..1, through this frame's camera: the partner
 * traces first draw in only once it has arrived (the orb first, then the circuit). 1 when no slot
 * is held.
 */
function slotDock(context: PoseContext, camera: THREE.Camera, box: RootState["size"], centre: THREE.Vector3): number {
  if (context.slot !== "a" && context.slot !== "b") return 1;
  const view = context.slot === "a" ? context.slotA : context.slotB;
  if (!view.valid) return 1;
  // The orb as drawn (motion.orb, the bodies' last frame), not the pose centre they spring toward:
  // the liquid trails the pose by ~0.5 s, and the circuit must wait for the orb the visitor sees
  // (measured at 1440x900: the pose read docked while the drawn orb was still ~100 px short).
  const drawn = motion.orb;
  let x: number;
  let y: number;
  if (drawn.visible && Number.isFinite(drawn.x) && Number.isFinite(drawn.y)) {
    x = drawn.x;
    y = drawn.y;
  } else if (worldToClient(_orbScreen, camera, box, centre)) {
    x = _orbScreen.x;
    y = _orbScreen.y;
  } else {
    return 1;
  }
  const off = Math.hypot(x - view.x, y - view.y) / Math.max(view.height, 1);
  return 1 - smoothstep(DOCK_NEAR, DOCK_FAR, off);
}

/**
 * Where the orb is between slot A and slot B on screen, 0..1 (its centre, through `camera`,
 * projected onto the line from A's centre to B's): the partner traces morph between their two
 * routings by it, so they follow the orb's glide. 0 above A (arriving from Services), 1 below B
 * (leaving for Contact). The rig measures it through the pose's own camera: parallax, breathing and
 * the drag orbit move the scene against the page, and must not bend the circuit at rest.
 */
function traceMorph(context: PoseContext, camera: THREE.Camera, box: RootState["size"], centre: THREE.Vector3, previous: number): number {
  const a = context.slotA;
  const b = context.slotB;
  if (!a.valid || !b.valid) return context.slot === "b" || context.slot === "c" ? 1 : 0;
  if (!worldToClient(_morphScreen, camera, box, centre)) return previous;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  if (!(length2 > 1)) return previous;
  return clamp(((_morphScreen.x - a.x) * dx + (_morphScreen.y - a.y) * dy) / length2, 0, 1);
}

/**
 * The largest field box (half extent, physics units) whose cells stay under the cap for the
 * orb's bodies at their size on screen this frame: the orb uses it whenever the bodies fit (a
 * larger box is cheaper), and never more than FIELD_SCALE.
 */
function fieldWish(world: WorldState, camera: THREE.Camera, box: RootState["size"], resolution: number, cellPx: number): number {
  if (!(resolution > 0) || !worldToClient(_orbScreen, camera, box, world.orb.centre)) return FIELD_SCALE;
  const unitPx = pixelsPerUnitAt(camera, box, _orbScreen.depth) * Math.max(world.orb.scale, 0.05);
  if (!(unitPx > 0)) return FIELD_SCALE;
  return Math.min((cellPx * resolution) / (2 * unitPx), FIELD_SCALE);
}

function updateRig(rig: Rig, world: WorldState, state: RootState, configuredResolution: number): void {
  const dt = motion.time.sceneDelta;
  const reducedMotion = motion.capabilities.reducedMotion;
  const paused = motion.paused;
  const camera = state.camera;
  const box = state.size;
  const portrait = isPortrait(box);

  const context = rig.context;
  context.box = box;
  context.fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : context.fov;
  // The poses cap the orb by its grid: the live one once the orb exists (it steps down on a slow
  // CPU), the configured one before, so the first frames already have the orb's final size.
  context.fieldResolution = motion.perf.fieldResolution > 0 ? motion.perf.fieldResolution : configuredResolution;
  context.fieldFloor = world.orb.field.floor;
  context.satelliteSide = rig.director.side;
  context.portrait = portrait;
  context.documentScroll = reducedMotion ? motion.scroll.y : 0;

  // A page change with the clock stopped (paused, or the reduced-motion still) jumps to the new
  // pose, and the orb is told to settle there at once; so is the first frame of a stopped scene.
  const changedAt = motion.story.changedAt;
  const routeChanged = rig.initialised && changedAt !== rig.changedAt;
  rig.changedAt = changedAt;
  const stopped = reducedMotion || paused || world.orb.still;
  const sinceRouteMs = changedAt > 0 ? motion.time.now * 1000 - changedAt : Infinity;
  const snap = reducedMotion || !rig.initialised || (paused && (routeChanged || sinceRouteMs < ROUTE_SNAP_WINDOW_MS));
  if (stopped && (routeChanged || !rig.initialised)) world.orb.settleSerial++;
  if (routeChanged) rig.routeAge = stopped ? ROUTE_TRANSIT_S : 0;

  // The stations (Partners, Contact), and which one the orb holds. A new page starts afresh. A
  // change between slots A and B starts the timed glide (a turn back runs it backwards from where
  // it is: the ease and the dive are symmetric); any other change dives on the pose spring, picking
  // the dive up at the depth it is at (rising side of the arc).
  measureSlot(context.slotA, ANCHORS.orbSlotPartners, context);
  measureSlot(context.slotB, ANCHORS.orbSlotContact, context);
  measureContactCells(context.slotC, context);
  const previous = rig.slots.choice;
  updateSlotTracker(rig.slots, context.slotA, context.slotB, context.slotC, box, !rig.initialised || routeChanged);
  const choice = rig.slots.choice;
  context.slot = choice;
  const glide = rig.glide;
  // A jump (an anchor link, a phone's tap on the status bar) lands without a glide: it springs there.
  const jumped = Math.abs(rig.lastScroll - motion.scroll.y) > JUMP_SHARE * box.height;
  if (snap || routeChanged) {
    glide.active = false;
    glide.age = SLOT_GLIDE_S;
    rig.slotAge = SLOT_TRANSIT_S;
  } else if (rig.slots.changed) {
    const between = !jumped && isSlotAB(previous) && isSlotAB(choice);
    if (between && glide.active && choice === glide.from && glide.age < SLOT_GLIDE_S) {
      glide.from = glide.to;
      glide.to = choice;
      glide.age = SLOT_GLIDE_S - glide.age;
    } else if (between) {
      glide.from = previous;
      glide.to = choice;
      glide.age = 0;
      glide.active = true;
      rig.slotAge = SLOT_TRANSIT_S;
    } else {
      const u = glide.active ? Math.min(glide.age / SLOT_GLIDE_S, 1) : Math.min(rig.slotAge / SLOT_TRANSIT_S, 1);
      rig.slotAge = SLOT_TRANSIT_S * Math.min(u, 1 - u);
      // Cut short by another station: the liquid keeps the glide's speed (the carry moved it).
      if (glide.active && !jumped) world.orb.handoff.copy(glide.velocity);
      glide.active = false;
    }
  }
  context.glideFrom = glide.from === "a" ? context.slotA : context.slotB;
  context.glide = glide.active && glide.age < SLOT_GLIDE_S && choice === glide.to ? easeInOut(glide.age / SLOT_GLIDE_S) : 1;

  const slotShare = targetPose(rig, context, reducedMotion, dt, snap || routeChanged);
  if (!snap && rig.routeAge < ROUTE_TRANSIT_S) applyTransitArc(rig.target, rig.routeAge / ROUTE_TRANSIT_S);
  rig.routeAge += dt;
  if (!snap && glide.active && glide.age < SLOT_GLIDE_S) applyTransitArc(rig.target, glide.age / SLOT_GLIDE_S, slotShare);
  else if (!snap && rig.slotAge < SLOT_TRANSIT_S) applyTransitArc(rig.target, rig.slotAge / SLOT_TRANSIT_S, slotShare);
  rig.slotAge += dt;
  if (glide.active) glide.age = Math.min(glide.age + dt, SLOT_GLIDE_S);
  // Anchored in its panels or a slot, the orb moves with the page: the pose spring alone would
  // trail a scroll by ~0.25 s of it (out of the panels); it only smooths what is left, the moves
  // between layouts.
  pageCarry(rig, context, dt, snap, reducedMotion, _carry);
  rig.orb.x.value += _carry.x;
  rig.orb.y.value += _carry.y;
  rig.orb.z.value += _carry.z;
  springPose(rig, dt, snap, glide.active ? SLOT_GLIDE_SETTLE : POSE_SETTLE);

  const pose = rig.pose;
  const orb = world.orb;
  orb.scale = Math.max(pose.scale, 0.05);
  orb.centre.copy(pose.orb);
  world.floorY = portrait ? FLOOR_Y_PORTRAIT : FLOOR_Y;
  // Above the floor board, except as far as slot A or B holds it: there it rests exactly on its slot,
  // where the traces' junction and routings are (the boards write no depth, so nothing hides it).
  const floor = world.floorY + ORB_RADIUS * orb.scale + FLOOR_CLEARANCE;
  const slotHeld = isSlotAB(choice) ? clamp(slotShare, 0, 1) : 0;
  orb.centre.y += (Math.max(orb.centre.y, floor) - orb.centre.y) * (1 - slotHeld);
  // The bodies are carried with it (orb.tsx), so the liquid does not lag the page either. Through an
  // A<->B glide in the slots' pose they ride the centre's whole motion (the glide's and the page's),
  // so the drawn orb is the centre on every display frame, physics step or not.
  const carrying = glide.active && glide.hasLast && !snap && slotShare >= GLIDE_CARRY_SHARE;
  if (carrying) {
    orb.carry.subVectors(orb.centre, glide.lastCentre);
    if (dt > 0) glide.velocity.subVectors(orb.carry, _carry).divideScalar(dt);
  } else {
    orb.carry.copy(_carry);
    // Not carried, the bodies have no glide speed to keep if it is cut short.
    glide.velocity.set(0, 0, 0);
  }
  glide.lastCentre.copy(orb.centre);
  glide.hasLast = true;
  const resting = Math.hypot(rig.orb.x.velocity, rig.orb.y.velocity, rig.orb.z.velocity) < GLIDE_LANDED_SPEED;
  if (glide.active && glide.age >= SLOT_GLIDE_S && resting) glide.active = false;
  orb.gliding = carrying && glide.active;
  world.boardEmphasis = pose.boards;
  world.nodes = clamp(pose.nodes, 0, 1);
  if (!orb.still) world.time += dt;

  // The flight follows the scroll; while paused the boards hold where they are, and on resume
  // they catch up with the scroll they missed instead of jumping.
  const scrollTravel = reducedMotion ? 0 : motion.scroll.y * TRAVEL_PER_PX;
  if (!rig.initialised || reducedMotion) rig.travelLag = 0;
  else if (paused) rig.travelLag = world.travel - scrollTravel;
  else if (rig.travelLag !== 0) {
    rig.travelLag *= 1 - approach(dt, TRAVEL_RESUME_TAU);
    if (Math.abs(rig.travelLag) < 1e-4) rig.travelLag = 0;
  }
  world.travel = scrollTravel + rig.travelLag;
  rig.initialised = true;

  placeCamera(rig, state, world, dt, reducedMotion);
  world.focusDistance = camera.position.distanceTo(orb.centre);
  world.dock = slotDock(context, camera, box, orb.centre);
  const morphCamera = aimCamera(rig.morphCamera, context, pose.camera, pose.look);
  world.traceMorph = traceMorph(context, morphCamera, box, orb.centre, world.traceMorph);
  world.traceFollowsOrb = choice === "c" || choice === "fallback";
  if (worldToClient(_orbScreen, camera, box, orb.centre) && worldToClient(_morphScreen, morphCamera, box, orb.centre)) {
    world.junctionShift.set(_orbScreen.x - _morphScreen.x, _orbScreen.y - _morphScreen.y);
  } else world.junctionShift.set(0, 0);
  copySlotView(world.slotA, context.slotA);
  copySlotView(world.slotB, context.slotB);

  // The bodies take the unsprung pose's cells: they are springs of their own (orb.tsx). Split or
  // not decides how their layouts are bounded (orb-direction), so it is known first.
  const target = rig.target;
  const practicePage = motion.story.practice !== "";
  const most = Math.max(target.cells.count, target.cellMix > 0 ? target.next.count : target.cells.count);
  orb.field.view.split = most >= 2;
  measureTechPills(world.pills);
  directOrb(rig.director, orb, {
    camera,
    eye: pose.camera,
    look: pose.look,
    box,
    dt,
    cells: target.cells,
    next: target.next,
    cellMix: target.cellMix,
    practices: target.practices,
    satellites: target.satellites,
    satelliteRow: target.satelliteRow,
    sweep: rig.sections.reversed ? -1 : 1,
    holding:
      rig.sections.from === rig.sections.to && Math.abs(rig.yaw.value) < ORBIT_FREE && Math.abs(rig.pitch.value) < ORBIT_FREE,
    droplets: target.droplets,
    pills: world.pills,
    reducedMotion,
    snap,
  });
  // The scroll's slosh fades out while the orb glides between the slots (the liquid rides the
  // circuit's junction there), and back in once it has landed.
  const slosh = stepSpring(glide.slosh, orb.gliding ? 0 : 1, omegaForSettle(SLOSH_GLIDE_SETTLE), dt);
  orb.inertia.multiplyScalar(clamp(slosh, 0, 1));
  // The service circuitry comes and goes with the practice photos (held with them while paused),
  // a practice page's cell circuitry with its cells, the pills' with their droplets.
  world.links = orb.practiceMix;
  world.droplets = orb.droplets.handover;
  if (dt > 0 || snap) world.cellLinks = clamp(target.cellLinks, 0, 1);
  // The compact box the orb's cells may grow to at its size on screen now (orb.tsx keeps the bodies
  // inside), and the view box it uses instead while split. A practice page's satellites are small.
  const cells = target.cellMix >= 0.5 ? target.next : target.cells;
  const satellites = practicePage && target.satellites >= 0.5;
  orb.field.wish = fieldWish(world, camera, box, context.fieldResolution, bodyCellPx(cells.count, satellites));
  // The orb's own bodies only (motion.bodies continues with the pills' droplets).
  const liquid = Math.min(clamp(orb.liquidBodies, 0, MAX_ORB_BODIES), motion.bodies.length);
  measureViewBox(orb.field.view, orb, camera, box, target, bodyCellPx(most, satellites), motion.bodies, liquid);
  updatePower(world, motion.time.now * 1000);
}

interface CameraRigProps {
  world: WorldState;
  /** The orb's marching-cubes resolution as configured, until the orb publishes its live one. */
  fieldResolution: number;
}

export default function CameraRig({ world, fieldResolution }: CameraRigProps): null {
  const [rig] = useState(createRig);
  useFrame((state) => updateRig(rig, world, state, fieldResolution), FRAME_ORDER.rig);
  return null;
}
