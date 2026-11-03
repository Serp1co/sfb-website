"use client";

/*
 * The liquid-glass orb: Rapier bodies (one per metaball) pulled by spring-dampers toward targets
 * the choreography sets, rendered as one marching-cubes surface with vertex colours and a
 * transmissive MeshPhysicalMaterial that refracts the circuit boards behind it.
 *
 * The orb splits into as many bodies as a section has panels (owner decision 2026-11-02): the
 * rig gives it two layouts and a mix (OrbControls.from / to / mix), metaball i belongs to cluster
 * i % count of each, and moving between layouts the bodies divide and merge like liquid.
 *
 * Per frame, in FRAME_ORDER:
 *   orb (-3)      presses become splashes (projected onto the orb plane), on the open scene and
 *                 on glass alike: the orb answers under the panels too; the pointer's movement
 *                 is measured for the stir; the hero logo's charge lights the body behind it,
 *                 and its thunder kicks it
 *   physics (-1)  Rapier: before each fixed step, fresh forces from fresh positions; after, dirty
 *   late (0)      the field is rebuilt only if a step ran, so rebuilds cap at 60/s at any
 *                 refresh rate; then motion.orb and motion.bodies are published for the effects
 *                 and the panels that answer the orb
 *
 * The field box adapts (orb-field.ts): merged, it shrinks while the bodies are compact and big on
 * screen (the hero), so its cells shrink with it, and grows back at once when they need the room.
 * Split into cells (choreography v3: every page, every screen), it is the view box instead: a slab
 * over the camera's visible region at the bodies' depth, its cells cubes of a size on screen the
 * bodies stay smooth at, so far-apart panels (a phone's stack, a 3 x 3 feature grid) no longer
 * coarsen the grid. A body whose panel is off screen lies outside it and is simply not drawn.
 *
 * Taps on touch splash the body under the finger like a click: motion/pointer.ts presses a touch
 * only once it has lifted as a tap (it stayed put and no scroll took it), and the orb splashes it
 * once the page has stayed still a moment longer (a fling the tap stopped may still be settling).
 *
 * While a body sits in a panel (a card, a Services window, a call to action), pushes, stirs and
 * splashes keep it inside (owner decision 2026-11-02, v3.1): a soft wall at the panel's rect, less
 * the body's iso margin, confines its metaballs, and a hard limit just past it catches the rest, so
 * the visible body never leaves its panel. The hero's orb and the slots' keep the free behaviour.
 *
 * The hero logo feeds the orb (v3.4): the body behind it (the one a press on the logo's centre
 * would swell) brightens a little with the logo's charge as the pipeline publishes it
 * (motion.charge.hero), and a thunder click on the logo (motion.charge.burstAt) kicks it: a
 * splash at the logo's centre on top of the click's own (with its press swell). The thunder adds
 * no light (owner, 2026-11-02 evening: "remove the blinding flash when clicking the logo"; v3.4's
 * surge lit the whole body). The splash takes the click's path, so the field's walls, a panel's
 * hold and the springs catch it as they catch a click; at most one kick per THUNDER_KICK_GAP_MS,
 * so rapid clicks never stack them. Never while paused, with reduced motion or still: the orb
 * shows at rest there.
 *
 * On a practice page's technology pills the liquid hands over to one droplet per pill
 * (pill-droplets.ts, v3.1): the metaballs dissolve as the droplets leave the body for their pills,
 * and form again as they come back. motion.bodies holds the orb's bodies, then the droplets.
 *
 * In Services the three bodies each reflect their practice's photo: the one mesh is drawn again
 * with three materials (shared geometry, no extra CPU), each fading in over its body's soft
 * Voronoi region on top of the circuit-reflecting base, which drops out once they cover it.
 *
 * Physics only steps on the scene's clock: while the visitor has paused the animation the useFrame
 * delta is 0, so nothing moves and nothing is rebuilt. Where the pose jumps without time passing
 * (paused at boot, a new page while paused or in the reduced-motion still) the bodies are settled
 * into the new pose synchronously instead (settleNow).
 *
 * The rebuild is timed: on a CPU that cannot afford it the box's floor steps up and then the grid
 * steps down live (field-governor), and its cost is published (motion.perf) so the pipeline's
 * governor knows a slow frame is the CPU's, which no pipeline setting can fix.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from "react";
import * as THREE from "three";
import { useFrame, type RootState } from "@react-three/fiber";
import { useAfterPhysicsStep, useBeforePhysicsStep, useRapier, type RapierRigidBody } from "@react-three/rapier";
import { ANCHORS, anchorRects } from "../../glass/contract";
import { isInsideFixedChrome } from "../../glass/registry";
import { MAX_ORB_BODIES, motion, type OrbBody } from "../../motion/store";
import type { PracticeEnvironments } from "../backgrounds/hidden-reflections";
import { FIELD_MEASURE_DELAY_MS, RAISE_FIELD_FLOOR, createFieldGovernor, recordRebuild, type FieldGovernor } from "./field-governor";
import { FRAME_ORDER, PHYSICS_STEP } from "./frame-order";
import { MarchingCubes } from "./marching-cubes";
import { approach, clamp, lerp, smoothstep } from "./math";
import { createBodySpecs, type BodySpec } from "./orb-bodies";
import { GROUP_COUNT, MAX_CLUSTERS, dominantLayout, type OrbControls } from "./orb-controls";
import {
  ATTENUATION_COLOUR,
  ATTENUATION_DISTANCE,
  BALL_STRENGTH,
  BALL_SUBTRACT,
  CELL_TARGET_LIMIT,
  FIELD_FLOOR_STEPS,
  FIELD_ISOLATION,
  FIELD_ROOM,
  FIELD_SCALE,
  ISO_MARGIN,
  ORB_RADIUS,
  REFRACTION_RAY,
  TARGET_LIMIT,
  clampToField,
  fieldStrengthScale,
  fitViewGrid,
  splitIsoMargin,
  wallAcceleration,
  type ViewGrid,
} from "./orb-field";
import type { WorldConfig } from "./performance-configs";
import {
  createPillDroplets,
  disposePillDroplets,
  dropletPublished,
  kickDroplet,
  updatePillDroplets,
  type PillDroplets,
} from "./pill-droplets";
import { createPracticeLayer, createPracticeUniforms, type PracticeUniforms } from "./practice-layers";
import { clientToPlaneZ, pixelsPerUnitAt, worldToClient, type ScreenBox, type ScreenPoint } from "./projection";

/* -- Bodies (unchanged from the original orb's feel) ------------------ */
const BODY_RADIUS = 0.2;
const BODY_DENSITY = 0.5;
const BODY_MASS = BODY_DENSITY * (4 / 3) * Math.PI * BODY_RADIUS ** 3;
const BODY_RESTITUTION = 0.1;
const BODY_FRICTION = 1;
/** Low, because the spring below carries the damping; Rapier's only takes the edge off contacts. */
const BODY_LINEAR_DAMPING = 0.6;
const BODY_ANGULAR_DAMPING = 1;

/* -- Spring-damper toward each body's target (calibrated in scratch orb-sim) -- */
/** rad/s: tracks a split target moving at the 1/s rise limit with little lag, packs like the old pull. */
const SPRING_OMEGA = 5.5;
const SPRING_ZETA = 0.7;
/**
 * Cap on the spring's restoring pull only, so a far body glides in instead of slamming the
 * cluster. The damping is never capped: inside the cap, it let a flicked body coast out of the
 * marching-cubes grid (review m5).
 */
const MAX_ACCELERATION = 60;

/**
 * While the layout moves between two sections (OrbControls.mix strictly between 0 and 1; a timed
 * 0.8 s move since choreography v3.1, section-transition.ts) the springs stiffen by this factor,
 * may pull this much harder, and damp only the speed a body has beyond its own target's: at the
 * calibrated feel above the bodies trailed the move by a second (measured 1.9-2.2 s from the
 * trigger to within 12 px of their cells at 1440 x 900), and on a phone's tall page the damping
 * held a far body to about 8 units/s, seconds behind. The brief wants them landing with the move,
 * in about 1 s, however far it goes: with these (and the lead below) they are within 12 px of their
 * cells about 0.87 s after the trigger. Held in a layout, the springs keep that feel. A glide between
 * the Partners slots (OrbControls.gliding) carries the bodies with the centre instead, and takes only
 * the stiffer springs, so the shape holds and a scroll's slosh from before it settles twice as fast.
 */
const MOVE_OMEGA_GAIN = 1.8;
const MOVE_MAX_ACCELERATION = 220;
/**
 * The stiffening is on from a move's first step (its target barely stirs then: the move eases in)
 * and eases out over this time constant (s) once it ends: long enough to land the bodies.
 */
const MOVE_STIFFEN_TAU = 0.35;
/**
 * A target faster than this (physics units/s) is a step in the layout, not motion: no speed to keep
 * pace with. A timed move's own peak is 1.5 x its length / 0.8 s: about 10 units/s between two
 * desktop sections, a few hundred from one end of a phone's page to the other.
 */
const MOVE_FOLLOW_MAX_SPEED = 2000;
/**
 * The targets' speed is smoothed over this time constant (s): a one-step change kicks a body only
 * a little, and the lag (which carries a landing body past its cell) stays short. At 0.05 s the
 * bodies overshot their windows by about 120 px at 1440 x 900.
 */
const MOVE_FOLLOW_TAU = 0.025;
/**
 * ...and its change (the target's acceleration) is added to a moving body's own, up to this much
 * (physics units/s^2): without it the bodies ran past their windows by about 90 px as a move eased
 * out (the spring's lag behind a decelerating target, a/omega^2). A step in the layout stays a nudge.
 */
const MOVE_FOLLOW_MAX_ACCELERATION = 800;

/**
 * Boot gather: the springs start at GATHER_FLOOR of their stiffness, so the loose bodies drift
 * together while the scene loads, and reach full strength GATHER_S after the first composite
 * frame: the orb condenses in place as the scene fades in, where the glass wave starts from.
 */
const GATHER_FLOOR = 0.15;
const GATHER_S = 0.5;
/** If the pipeline never reports a first frame, the gather runs anyway after this much physics time. */
const GATHER_FALLBACK_S = 2.5;
/** The boot gather counts as done this long after its ramp started (the bodies have packed). */
const GATHER_DONE_S = GATHER_S + 1;
/** Physics steps of a synchronous settle: 1.5 s, past the spring's settling time (~1 s at zeta 0.7). */
const SETTLE_STEPS = 90;

/** Peak sideways sweep (physics units) halfway between two layouts: the streams spiral, not slide. */
const MERGE_SWEEP = 0.7;
/** ...and the dip away from the camera at the same moment, so streams crossing pass behind each other. */
const LAYOUT_DIVE = 0.5;
/** Satellites (the other practices on a practice page) pack a little tighter than the main body. */
const SATELLITE_PACKING = 0.7;

/* -- Splash: a press throws nearby bodies outward from their body's centre -- */
/**
 * Outward kick at the press point, units/s (strength 1); falls off as (1 - d/R)^2. Stronger than
 * the first orb's (12 within 2.2: owner, 2026-11-02, "a bit more dramatic"), still caught by the
 * field: the box grows to hold a flung body and the springs bring it back within ~1 s.
 */
const SPLASH_SPEED = 17;
const SPLASH_RADIUS = 2.6;
/** Mix of "away from the press" into the outward direction, and a lift toward the camera. */
const SPLASH_PRESS_BIAS = 0.6;
const SPLASH_TOWARD_CAMERA = 0.35;
const MAX_SPLASHES_PER_FRAME = 4;
/** A press also swells the body it lands on for a moment: strength x (1 + PRESS_SWELL), easing out. */
const PRESS_SWELL = 0.35;
const PRESS_SWELL_TAU = 0.3;
/** A press counts for a body whose centre is within this many of its radii on screen. */
const PRESS_SWELL_REACH = 1.8;
/**
 * A split's bodies are smaller than the merged orb: the splash's reach scales with them (never
 * below this share), so a tap on one card throws its own body, not its neighbours'.
 */
const SPLASH_MIN_SCALE = 0.45;

/* -- The hero logo feeds the orb (v3.4): its charge lights the body behind it, its thunder kicks it -- */
/**
 * At full charge (motion.charge.hero 1) the body behind the hero logo is this much brighter, a
 * vertex-colour gain: a little (a hovered panel's body gets 0.4), it feeds the logo, it does not
 * light up the page.
 */
const LOGO_FEED_GLOW = 0.2;
/**
 * A thunder click on the logo (motion.charge.burstAt) splashes the body behind it at the logo's
 * centre this strongly, a frame after the click's own splash: together they move a metaball at most
 * ~1.8 physics units against a click's ~1.2 and two quick clicks' ~2.3 (scratch kick-sim), and the
 * springs bring it back within ~1 s.
 */
const THUNDER_KICK = 0.5;
/** ...at most once this often (ms): repeated clicks retrigger the logo's thunder, never a second kick on the first. */
const THUNDER_KICK_GAP_MS = 400;
/** A burst first seen this long (ms) after it fired (the frames stalled) has passed: no kick. */
const THUNDER_FRESH_MS = 250;

/* -- Taps on touch: a touch press splashes once the finger lifts, if it was a tap -- */
/** A tap lifts within this long (ms) of the press... */
const TAP_MAX_MS = 400;
/** ...having moved at most this far (CSS px), the page at most this far (a scroll starting is no tap). */
const TAP_SLOP_PX = 12;
const TAP_SCROLL_PX = 6;
/**
 * A lifted finger splashes only once the page has stayed still this long (ms) after the lift: a
 * scroll's start lifts the pointer too (pointercancel) a frame or two before the page moves.
 */
const TAP_SETTLE_MS = 70;
/**
 * A second touch splash this close (ms, CSS px) to the last one is the same tap reported twice
 * (the press and its lift both reaching the orb): it splashes once.
 */
const TAP_DEDUPE_MS = 450;
const TAP_DEDUPE_PX = 24;
/** A tap on these lands on an overlay above the page, never on the orb (with the fixed chrome). */
const ABOVE_SCENE_SELECTOR = "[data-lenis-prevent], [role='dialog']";

/* -- Stir: the pointer's movement drags the liquid along, harder the faster it moves -- */
/** Acceleration per unit of the pointer's speed across the orb plane (physics units/s), 1/s, at the pointer. */
const STIR_GAIN = 7;
/** ...falling off as (1 - d/R)^2 within this many physics units of it. */
const STIR_RADIUS = 1.7;
/** Cap on the stir (units/s^2): a flick shoves the liquid, it never throws a body out of the field. */
const STIR_MAX = 45;
/** Below this speed (physics units/s) the hand is resting and nothing is stirred. */
const STIR_DEAD = 0.4;

/* -- The adaptive field box --------------------------------------------- */
/** The box grows at once, and shrinks only once it is this share too big: the grid never slides under a resting orb. */
const FIELD_SHRINK_HYSTERESIS = 0.06;
/**
 * The view box keeps its cells for small moves (this share of a cell): the slab follows the view as
 * the page scrolls, but in whole cells of the bodies' carried frame, so the grid moves with the
 * bodies between steps and they are never resampled at a sliding offset (no shimmer while reading).
 */
const VIEW_BOX_SNAP = 1;
/**
 * ...and its cell size while the size it is asked for stays within this share of it: the camera's
 * breathing changes the cells' size on screen by a few per cent every second, which must not
 * resample the bodies either.
 */
const VIEW_CELL_HYSTERESIS = 0.08;

/* -- Panels hold their bodies in (owner decision 2026-11-02, v3.1) ---- */
/**
 * A body's metaball centres stay inside its panel by its iso margin (how far its surface reaches
 * past them) plus this (CSS px): the visible surface keeps clear of the panel's edge.
 */
const CONTAIN_MARGIN_PX = 6;
/** The soft wall pushes back from this far (CSS px) before that limit; past the limit a body is stopped. */
const CONTAIN_SOFT_PX = 18;
/**
 * The soft wall's stiffness (1/s^2 per physics unit into it) and its damping of the outward speed
 * (1/s): it catches a 10 units/s splash in about its own depth, and sqrt(k) x step (1) is stable.
 */
const CONTAIN_STIFFNESS = 3600;
const CONTAIN_DAMPING = 40;
/** At this much dissolved (into the pills' droplets) the field is empty: not rebuilt, not drawn. */
const DISSOLVED = 0.995;
/** The orb's bodies stop counting as bodies (lighting panels) once this dissolved. */
const DISSOLVED_BODIES = 0.9;

/* -- Practice reflections (Services, practice-layers.ts) --------------- */
/** Below this share no practice layer is drawn; above 1 - this, the base is not. */
const PRACTICE_EPSILON = 0.002;

interface OrbProps {
  config: WorldConfig;
  controls: OrbControls;
  /** The three practice photos' environments (filled as they load). */
  practiceEnvironments: PracticeEnvironments;
  /** Called after the first rebuilt frame (the orb exists on screen). */
  onFirstFrame?: () => void;
}

interface OrbMesh {
  mesh: MarchingCubes;
  material: THREE.MeshPhysicalMaterial;
  layers: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>[];
  practice: PracticeUniforms;
}

function createOrbMesh(config: WorldConfig): OrbMesh {
  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    transmission: 1,
    // Thickness is in local units and three multiplies it by the mesh scale: keep the ray at
    // REFRACTION_RAY world units whatever the pose scale and box (updated per frame below).
    thickness: REFRACTION_RAY / FIELD_SCALE,
    roughness: 0,
    metalness: 0,
    ior: 1.33,
    clearcoat: 1,
    clearcoatRoughness: 0,
    attenuationColor: new THREE.Color(ATTENUATION_COLOUR),
    attenuationDistance: ATTENUATION_DISTANCE,
    dispersion: config.dispersion,
  });
  // Vertex colours and no uvs (MeshPhysicalMaterial without maps never reads them). The vendored
  // class bounds the whole box, where split bodies can sit near the corners.
  const mesh = new MarchingCubes(config.fieldResolution, material, true, config.maxPolyCount);
  mesh.isolation = FIELD_ISOLATION;
  mesh.scale.setScalar(FIELD_SCALE);

  const practice = createPracticeUniforms();
  const layers: OrbMesh["layers"] = [];
  for (let k = 0; k < GROUP_COUNT; k++) {
    const layer = new THREE.Mesh(mesh.geometry, createPracticeLayer(material, k, practice));
    // After the base, in practice order (transmissive items sort by render order first).
    layer.renderOrder = k + 1;
    layer.visible = false;
    mesh.add(layer);
    layers.push(layer);
  }
  return { mesh, material, layers, practice };
}

const _offset = new THREE.Vector3();
const _sweep = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _force = { x: 0, y: 0, z: 0 };
const _impulse = { x: 0, y: 0, z: 0 };
const _hit = new THREE.Vector3();
const _centroid = new THREE.Vector3();
const _point = new THREE.Vector3();
const _screen: ScreenPoint = { x: 0, y: 0, depth: 0 };
const _groupCounts = new Int32Array(GROUP_COUNT);
const _boxCentre = new THREE.Vector3();
const _grid: ViewGrid = { nx: 0, ny: 0, nz: 0, cell: 0 };
/** The panels' walls: the camera's screen axes in world units, a correction, and an acceleration. */
const _right = new THREE.Vector3();
const _upAxis = new THREE.Vector3();
const _shift = new THREE.Vector3();
const _wall = new THREE.Vector3();
const ZERO = { x: 0, y: 0, z: 0 };
const UP = new THREE.Vector3(0, 1, 0);

/** Where metaball i aims this step, as an offset from the centre (physics units, field-clamped). */
function targetOffset(i: number, spec: BodySpec, controls: OrbControls, swirlTime: number, out: THREE.Vector3): THREE.Vector3 {
  const group = spec.group;
  const practice = controls.practiceGroup;
  const isSatellite = practice >= 0 && group !== practice;

  // Rest offset, sheared by its own swirl.
  const angle = spec.swirlRate * swirlTime;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const packing = isSatellite ? 1 + (SATELLITE_PACKING - 1) * controls.satellite : 1;
  out.set(
    (spec.offset.x * cos + spec.offset.z * sin) * packing,
    spec.offset.y * packing,
    (spec.offset.z * cos - spec.offset.x * sin) * packing,
  );

  // Its cluster in each layout, mixed; between two different clusters the metaball sweeps
  // sideways and dips back mid-way, so the streams spiral apart and together instead of sliding.
  const from = controls.from;
  const to = controls.to;
  const t = clamp(controls.mix, 0, 1);
  _from.copy(from.clusters[i % Math.max(from.count, 1)]);
  _to.copy(to.clusters[i % Math.max(to.count, 1)]);
  out.x += _from.x + (_to.x - _from.x) * t;
  out.y += _from.y + (_to.y - _from.y) * t;
  out.z += _from.z + (_to.z - _from.z) * t;
  if (t > 0 && t < 1) {
    const arc = 4 * t * (1 - t);
    _sweep.subVectors(_to, _from);
    if (_sweep.lengthSq() > 1e-6) {
      _sweep.crossVectors(UP, _sweep).normalize();
      // Turning back (sweep -1, the layouts swapped) keeps the side the streams swept on.
      out.addScaledVector(_sweep, MERGE_SWEEP * arc * controls.sweep);
      out.z -= LAYOUT_DIVE * arc;
    }
  }

  // Practice page: the other two groups become satellites of the current practice's body.
  if (isSatellite && controls.satellite > 0) {
    out.addScaledVector(controls.satellites[group < practice ? group : group - 1], controls.satellite);
  }

  // Split into cells, a body goes wherever its panel is (the view box draws what is on screen);
  // only its depth keeps to the field. Merged, everything stays inside the compact box.
  if (controls.field.view.split) {
    return out.set(
      clamp(out.x, -CELL_TARGET_LIMIT, CELL_TARGET_LIMIT),
      clamp(out.y, -CELL_TARGET_LIMIT, CELL_TARGET_LIMIT),
      clampToField(out.z),
    );
  }
  return out.set(clampToField(out.x), clampToField(out.y), clampToField(out.z));
}

/** Where cluster i's body centre aims this step (its layouts' cluster, mixed), offset from the centre. */
function clusterOffset(i: number, controls: OrbControls, out: THREE.Vector3): THREE.Vector3 {
  const t = clamp(controls.mix, 0, 1);
  const from = controls.from.clusters[i % Math.max(controls.from.count, 1)];
  const to = controls.to.clusters[i % Math.max(controls.to.count, 1)];
  return out.lerpVectors(from, to, t);
}

/** Entries of the shape signature (see OrbFrameState.shape), and the change that counts. */
const SHAPE_SIZE = 6;
const SHAPE_EPSILON = 0.02;

function shapeEntry(out: Float64Array, index: number, value: number): boolean {
  const changed = Math.abs(value - out[index]) > SHAPE_EPSILON;
  out[index] = value;
  return changed;
}

/** Writes the controls that shape the bodies into `out`; true when they differ from what it held. */
function updateShape(controls: OrbControls, out: Float64Array): boolean {
  // Not the clusters' offsets: anchored to panels, they follow the page, and the layouts are held
  // while the clock is stopped (orb-direction) unless the pose jumps, which changes these.
  let changed = shapeEntry(out, 0, controls.mix);
  if (shapeEntry(out, 1, controls.from.count)) changed = true;
  if (shapeEntry(out, 2, controls.to.count)) changed = true;
  if (shapeEntry(out, 3, controls.practiceGroup)) changed = true;
  if (shapeEntry(out, 4, controls.satellite)) changed = true;
  if (shapeEntry(out, 5, controls.satellites[0].x)) changed = true;
  return changed;
}

/**
 * The field box a rebuild uses, in physics coordinates: the compact cube around the centre
 * (merged), or the view box (split), as a grid of nx x ny x nz cubic cells, `unit` cells to a box
 * unit of `length` physics units.
 */
interface FieldBox {
  view: boolean;
  centre: THREE.Vector3;
  nx: number;
  ny: number;
  nz: number;
  unit: number;
  length: number;
  /** A ball's reach cut, box units (0: three's full reach). */
  cut: number;
  /** Half extents the soft wall keeps the bodies within, per axis (physics units; Infinity: none). */
  wall: THREE.Vector3;
}

/**
 * The hero logo feeding the orb (v3.4). Per body (indexed like OrbFrameState.kick): the light the
 * logo's charge adds this frame (a vertex-colour gain over 1); the last burst seen
 * (motion.charge.burstAt) and when the liquid was last kicked by one (ms).
 */
interface LogoFeed {
  light: number[];
  burstSeen: number;
  kickedAt: number;
}

function createLogoFeed(): LogoFeed {
  return {
    light: Array.from({ length: MAX_CLUSTERS }, () => 0),
    // A burst from before this orb existed (a remount) is not this orb's to answer.
    burstSeen: motion.charge.burstAt,
    kickedAt: -Infinity,
  };
}

/** The hero logo's centre this frame (client px), where its thunder kicks the orb. */
const _logoCentre = { x: 0, y: 0 };

/** The hero logo's centre on screen (client px) into `out`; false when the page has none in view. */
function heroLogoCentre(out: { x: number; y: number }): boolean {
  const rects = anchorRects.get(ANCHORS.heroLogo);
  if (!rects) return false;
  for (const r of rects) {
    if (!r.visible || !(r.width > 0 && r.height > 0) || !Number.isFinite(r.x) || !Number.isFinite(r.y)) continue;
    out.x = r.x + r.width / 2;
    out.y = r.y + r.height / 2;
    return true;
  }
  return false;
}

/** The published body (a motion.bodies index) nearest client (x, y), within PRESS_SWELL_REACH of its radii; -1 if none. */
function nearestBody(x: number, y: number): number {
  let best = -1;
  let bestShare = PRESS_SWELL_REACH;
  for (let k = 0; k < motion.bodies.length; k++) {
    const body = motion.bodies[k];
    if (!(body.radius > 0)) continue;
    const share = Math.hypot(x - body.x, y - body.y) / body.radius;
    if (share < bestShare) {
      bestShare = share;
      best = k;
    }
  }
  return best;
}

/**
 * One frame of the hero logo feeding the orb, while the scene may move. The body behind the logo
 * (the one a press on its centre would swell) takes the logo's charge as light; a fresh burst
 * (`burst`: its performance.now(), 0 for none this frame) kicks it, at most once per
 * THUNDER_KICK_GAP_MS: true then, and the caller splashes at `at` (the logo's centre). A burst
 * adds no light. The charge's pace is the pipeline's (motion.charge.hero): the orb keeps no copy
 * of its timings.
 */
function stepLogoFeed(feed: LogoFeed, bodyIndex: readonly number[], burst: number, nowMs: number, at: { x: number; y: number }): boolean {
  let body = -1;
  if (heroLogoCentre(at)) {
    const k = nearestBody(at.x, at.y);
    // A pill's droplet (a negative index) is no body behind the logo.
    if (k >= 0 && bodyIndex[k] >= 0 && bodyIndex[k] < MAX_CLUSTERS) body = bodyIndex[k];
  }
  let kick = false;
  if (body >= 0 && burst > 0 && nowMs - burst < THUNDER_FRESH_MS && nowMs - feed.kickedAt >= THUNDER_KICK_GAP_MS) {
    feed.kickedAt = nowMs;
    kick = true;
  }
  const charge = motion.charge.hero;
  const lit = body >= 0 && Number.isFinite(charge) ? clamp(charge, 0, 1) : 0;
  for (let k = 0; k < MAX_CLUSTERS; k++) feed.light[k] = k === body ? LOGO_FEED_GLOW * lit : 0;
  return kick;
}

/** A touch press waiting to become a tap (see TAP_MAX_MS): down, then lifted and settling. */
interface PendingTap {
  active: boolean;
  lifted: boolean;
  x: number;
  y: number;
  time: number;
  liftedAt: number;
  scroll: number;
}

interface OrbFrameState {
  dirty: boolean;
  announced: boolean;
  swirlTime: number;
  /** Physics seconds since mount, and since the boot gather's ramp started. */
  stepTime: number;
  gatherTime: number;
  /** The boot gather has completed (or the bodies were settled into a pose). */
  formed: boolean;
  /** The last OrbControls.settleSerial handled. */
  settleSerial: number;
  /**
   * What decides the bodies' shape (layouts, practice satellites), as of the last frozen frame:
   * when a jump changes it with the clock stopped, the bodies are settled again.
   */
  shape: Float64Array;
  /** The centre the current field was built around: the mesh sits there until the next rebuild. */
  builtCentre: THREE.Vector3;
  /** The centre the bodies were last carried to while frozen (still or paused, see below). */
  stillCentre: THREE.Vector3;
  positions: Float32Array;
  colours: THREE.Color[];
  splashes: Float32Array;
  splashCount: number;
  /** Per cluster: the press swell, 1 just after a press, easing out (scene clock). */
  kick: number[];
  /** The hero logo's charge lighting the body behind it, and its thunder's kick (v3.4). */
  feed: LogoFeed;
  /** The pointer on the orb plane this frame (physics units around the centre) and its velocity there. */
  stir: { active: boolean; x: number; y: number; vx: number; vy: number };
  /**
   * The compact box's half extent now (physics units), and the index of its floor in
   * FIELD_FLOOR_STEPS; and the box the last rebuild used (compact or view), carried with the page.
   */
  half: number;
  floorStep: number;
  box: FieldBox;
  /** A touch press waiting to become a tap, and the last touch splash (client px, ms). */
  tap: PendingTap;
  lastTouchSplash: { x: number; y: number; time: number };
  governor: FieldGovernor;
  /** performance.now() when the world was first seen ready; 0 before. */
  readySince: number;
  /** 0..1: how stiff the springs are for a move between layouts (MOVE_OMEGA_GAIN): 1 while it runs, easing out after. */
  moveStiffen: number;
  /**
   * Per metaball: its target as of the last physics step (physics units; carried with the page like
   * the bodies) and the target's smoothed speed, which a move's damping leaves alone.
   */
  aims: Float32Array;
  aimSpeeds: Float32Array;
  aimsLive: boolean;
  /**
   * The published bodies, reused (motion.bodies holds the first `count`), and what each is: the
   * body (cluster) k >= 0, or the pills' droplet -1 - k.
   */
  bodies: OrbBody[];
  bodyIndex: number[];
  /** Per metaball: held inside its panel (it has been inside since the layout started holding). */
  walled: Uint8Array;
  /** This frame's camera and canvas box, for the panels' walls in the physics steps. */
  camera: THREE.Camera | null;
  size: ScreenBox;
}

export default function Orb({ config, controls, practiceEnvironments, onFirstFrame }: OrbProps): JSX.Element {
  const [orb] = useState(() => createOrbMesh(config));
  const specs = useMemo(() => createBodySpecs(config.bodyCount), [config.bodyCount]);
  const { world, rapier, step } = useRapier();

  const bodies = useRef<RapierRigidBody[]>([]);
  const [frameState] = useState<OrbFrameState>(() => ({
    dirty: true,
    announced: false,
    swirlTime: 0,
    stepTime: 0,
    gatherTime: 0,
    formed: false,
    settleSerial: controls.settleSerial,
    shape: new Float64Array(SHAPE_SIZE),
    builtCentre: controls.centre.clone(),
    stillCentre: controls.centre.clone(),
    positions: new Float32Array(config.bodyCount * 3),
    colours: Array.from({ length: config.bodyCount }, () => new THREE.Color()),
    splashes: new Float32Array(MAX_SPLASHES_PER_FRAME * 4),
    splashCount: 0,
    kick: Array.from({ length: MAX_CLUSTERS }, () => 0),
    feed: createLogoFeed(),
    stir: { active: false, x: 0, y: 0, vx: 0, vy: 0 },
    half: FIELD_SCALE,
    floorStep: 0,
    box: {
      view: false,
      centre: controls.centre.clone(),
      nx: config.fieldResolution,
      ny: config.fieldResolution,
      nz: config.fieldResolution,
      unit: config.fieldResolution,
      length: 2 * FIELD_SCALE,
      cut: 0,
      wall: new THREE.Vector3(FIELD_SCALE, FIELD_SCALE, FIELD_SCALE),
    },
    tap: { active: false, lifted: false, x: 0, y: 0, time: 0, liftedAt: 0, scroll: 0 },
    lastTouchSplash: { x: -9999, y: -9999, time: -Infinity },
    governor: createFieldGovernor(),
    readySince: 0,
    moveStiffen: 0,
    aims: new Float32Array(config.bodyCount * 3),
    aimSpeeds: new Float32Array(config.bodyCount * 3),
    aimsLive: false,
    bodies: Array.from({ length: MAX_ORB_BODIES }, () => ({ x: 0, y: 0, radius: 0, weight: 0 })),
    bodyIndex: Array.from({ length: MAX_ORB_BODIES }, (_, k) => k),
    walled: new Uint8Array(config.bodyCount),
    camera: null,
    size: { width: 1, height: 1, left: 0, top: 0 },
  }));
  const [droplets] = useState<PillDroplets>(createPillDroplets);

  // Bodies are created imperatively: no React component or Object3D per metaball, and the
  // handles stay in one array the force loop walks. A layout effect, so on unmount its cleanup
  // runs before the Physics provider's passive cleanup frees the world: the bodies leave a live
  // world instead of the lazy world proxy recreating one just to be asked about them.
  useLayoutEffect(() => {
    const created: RapierRigidBody[] = [];
    const centre = controls.centre;
    for (const spec of specs) {
      const body = world.createRigidBody(
        rapier.RigidBodyDesc.dynamic()
          .setTranslation(centre.x + spec.start.x, centre.y + spec.start.y, centre.z + spec.start.z)
          .setLinearDamping(BODY_LINEAR_DAMPING)
          .setAngularDamping(BODY_ANGULAR_DAMPING)
          // Forces are re-applied every step; a sleeping body would ignore them.
          .setCanSleep(false),
      );
      world.createCollider(
        rapier.ColliderDesc.ball(BODY_RADIUS)
          .setDensity(BODY_DENSITY)
          .setRestitution(BODY_RESTITUTION)
          .setFriction(BODY_FRICTION),
        body,
      );
      created.push(body);
    }
    bodies.current = created;
    frameState.dirty = true;
    frameState.stillCentre.copy(centre);
    return () => {
      bodies.current = [];
      for (const body of created) if (world.getRigidBody(body.handle)) world.removeRigidBody(body);
    };
  }, [world, rapier, specs, controls, frameState]);

  useEffect(() => {
    const { mesh, material, layers } = orb;
    motion.perf.fieldResolution = mesh.resolution;
    controls.field.floor = FIELD_FLOOR_STEPS[0];
    return () => {
      mesh.geometry.dispose();
      material.dispose();
      for (const layer of layers) layer.material.dispose();
      disposePillDroplets(droplets);
      motion.orb.visible = false;
      motion.bodies.length = 0;
      motion.perf.fieldResolution = 0;
      motion.perf.rebuildMs = 0;
    };
  }, [orb, controls, droplets]);

  // Presses become splashes at the press, projected onto the orb plane, wherever Impulse.onScene
  // says the press reaches the orb: a mouse or pen press anywhere on the page, over glass and text
  // too (the orb sits under the panels and answers there), never on the fixed chrome or an overlay,
  // and never a keyboard activation (it lands on a control, not on the liquid). A touch splashes
  // like a click, over glass and text too, but only as a tap: pointer.ts presses it once the finger
  // has lifted without moving and no scroll took it, and the orb splashes it once the page has
  // stayed still TAP_SETTLE_MS more (dropped if it moved: a fling the tap stopped, a scroll
  // starting). Never with reduced motion (the orb is settling out of sight for its still frame) or
  // while paused (the splash would wait for the clock and fire on resume). The pointer's movement
  // across the orb plane is measured here too, for the stir, and this frame's camera kept for the
  // panels' walls.
  useFrame((state) => {
    const f = frameState;
    f.camera = state.camera;
    f.size = state.size;
    carryWithPage(bodies.current, f);
    const dt = motion.time.sceneDelta;
    for (let k = 0; k < MAX_CLUSTERS; k++) f.kick[k] *= 1 - approach(dt, PRESS_SWELL_TAU);
    // A thunder click on the hero logo is taken once, whatever becomes of it below: one seen while
    // the clock is stopped must not kick the orb when it starts again.
    const burstAt = motion.charge.burstAt;
    const burst = burstAt > 0 && burstAt !== f.feed.burstSeen ? burstAt : 0;
    f.feed.burstSeen = burstAt;
    if (controls.still || motion.capabilities.reducedMotion || motion.paused) {
      f.splashCount = 0;
      f.stir.active = false;
      f.tap.active = false;
      // No feeding without motion: a rebuild meanwhile (a settle) shows the orb at rest.
      f.feed.light.fill(0);
      return;
    }
    const scale = controls.scale > 0 ? controls.scale : 1;
    const centre = controls.centre;
    const pointer = motion.pointer;
    const nowMs = motion.time.now * 1000;
    for (const impulse of motion.impulses) {
      if (impulse.kind !== "press" || !impulse.onScene) continue;
      if (pointer.type === "touch") {
        // A tap: wait until the page is still (below); a later tap replaces it. Should a touch
        // press arrive with the finger still down, the lift is awaited first.
        f.tap.active = true;
        f.tap.lifted = !pointer.down;
        f.tap.liftedAt = nowMs;
        f.tap.x = impulse.x;
        f.tap.y = impulse.y;
        f.tap.time = impulse.time;
        f.tap.scroll = motion.scroll.y;
        continue;
      }
      splashAt(state, f, impulse.x, impulse.y, impulse.strength, false, nowMs);
    }
    const tap = f.tap;
    if (tap.active) {
      const moved =
        Math.hypot(pointer.x - tap.x, pointer.y - tap.y) > TAP_SLOP_PX ||
        Math.abs(motion.scroll.y - tap.scroll) > TAP_SCROLL_PX;
      if (moved || (!tap.lifted && nowMs - tap.time > TAP_MAX_MS)) tap.active = false;
      else if (!tap.lifted && !pointer.down) {
        tap.lifted = true;
        tap.liftedAt = nowMs;
      } else if (tap.lifted && nowMs - tap.liftedAt >= TAP_SETTLE_MS) {
        tap.active = false;
        if (tapReachesOrb(tap.x, tap.y)) splashAt(state, f, tap.x, tap.y, 1, true, nowMs);
      }
    }

    // The hero logo feeds the body behind it, and its thunder kicks it: a splash at the logo's
    // centre, the click's own path (the field's walls, a panel's hold and the springs catch it).
    if (stepLogoFeed(f.feed, f.bodyIndex, burst, nowMs, _logoCentre)) {
      splashAt(state, f, _logoCentre.x, _logoCentre.y, THUNDER_KICK, false, nowMs);
    }

    // The stir: the pointer's velocity on screen, in physics units at the orb's depth.
    const stir = f.stir;
    stir.active = false;
    if (
      controls.pointerEnabled &&
      pointer.inside &&
      pointer.x > -9000 &&
      (pointer.type !== "touch" || pointer.down) &&
      clientToPlaneZ(_hit, state.camera, state.size, pointer.x, pointer.y, centre.z) &&
      worldToClient(_screen, state.camera, state.size, centre)
    ) {
      const unitPx = pixelsPerUnitAt(state.camera, state.size, _screen.depth) * scale;
      if (unitPx > 0) {
        stir.active = true;
        stir.x = (_hit.x - centre.x) / scale;
        stir.y = (_hit.y - centre.y) / scale;
        stir.vx = (Number.isFinite(pointer.vx) ? pointer.vx : 0) / unitPx;
        // Screen y points down, the world's up.
        stir.vy = -(Number.isFinite(pointer.vy) ? pointer.vy : 0) / unitPx;
      }
    }
  }, FRAME_ORDER.orb);

  /**
   * A splash at client (x, y): projected onto the orb plane, queued for the next physics step, and
   * the body it lands on swells. A touch splash right on top of the last one is the same tap
   * reported twice, and splashes once.
   */
  function splashAt(state: RootState, f: OrbFrameState, x: number, y: number, strength: number, touch: boolean, nowMs: number): void {
    if (f.splashCount >= MAX_SPLASHES_PER_FRAME) return;
    const last = f.lastTouchSplash;
    if (touch) {
      if (nowMs - last.time < TAP_DEDUPE_MS && Math.hypot(x - last.x, y - last.y) < TAP_DEDUPE_PX) return;
      last.x = x;
      last.y = y;
      last.time = nowMs;
    }
    const centre = controls.centre;
    const scale = controls.scale > 0 ? controls.scale : 1;
    if (!clientToPlaneZ(_hit, state.camera, state.size, x, y, centre.z)) return;
    const o = f.splashCount * 4;
    f.splashes[o] = centre.x + (_hit.x - centre.x) / scale;
    f.splashes[o + 1] = centre.y + (_hit.y - centre.y) / scale;
    f.splashes[o + 2] = centre.z;
    f.splashes[o + 3] = clamp(strength, 0, 1);
    f.splashCount++;
    kickNearest(f, x, y, strength);
  }

  /** A press swells the published body it lands on (its cluster), for a moment, or jiggles the droplet. */
  function kickNearest(f: OrbFrameState, x: number, y: number, strength: number): void {
    const best = nearestBody(x, y);
    if (best < 0) return;
    const body = f.bodyIndex[best];
    if (body < 0) kickDroplet(droplets, -1 - body, strength);
    else f.kick[body] = Math.max(f.kick[body], clamp(strength, 0, 1));
  }

  useBeforePhysicsStep(() => {
    const list = bodies.current;
    if (list.length === 0) return;
    const f = frameState;
    const centre = controls.centre;
    const wall = f.box.wall;

    const reach = Math.max(controls.bodyRadius / ORB_RADIUS, SPLASH_MIN_SCALE);
    for (let s = 0; s < f.splashCount; s++) {
      const o = s * 4;
      applySplash(list, controls, f.splashes[o], f.splashes[o + 1], f.splashes[o + 2], f.splashes[o + 3], reach);
    }
    f.splashCount = 0;

    f.swirlTime += PHYSICS_STEP;
    f.stepTime += PHYSICS_STEP;
    if (motion.engine.sceneReadyAt > 0 || f.stepTime > GATHER_FALLBACK_S) f.gatherTime += PHYSICS_STEP;
    if (f.gatherTime > GATHER_DONE_S) f.formed = true;
    const gather = lerp(GATHER_FLOOR, 1, smoothstep(0, GATHER_S, f.gatherTime));
    const moving = controls.mix > 0 && controls.mix < 1;
    f.moveStiffen = moving ? 1 : f.moveStiffen * Math.exp(-PHYSICS_STEP / MOVE_STIFFEN_TAU);
    // A slot glide stiffens the springs only: its pull cap and target follow would read a split
    // that cuts the glide short (B to the contact cards) as target speed and kick the bodies.
    const omega = SPRING_OMEGA * lerp(1, MOVE_OMEGA_GAIN, Math.max(f.moveStiffen, controls.gliding ? 1 : 0));
    const omega2 = omega * omega * gather;
    const damping = 2 * SPRING_ZETA * omega;
    const maxAcceleration = lerp(MAX_ACCELERATION, MOVE_MAX_ACCELERATION, f.moveStiffen);
    const follow = f.moveStiffen;
    const aimBlend = 1 - Math.exp(-PHYSICS_STEP / MOVE_FOLLOW_TAU);
    const aims = f.aims;
    const aimSpeeds = f.aimSpeeds;
    const inertia = controls.inertia;
    const stir = f.stir;
    const stirSpeed = stir.active ? Math.hypot(stir.vx, stir.vy) : 0;
    const stirring = stirSpeed > STIR_DEAD;
    const containing = beginContain(f, list.length);
    for (let i = 0; i < list.length; i++) {
      const body = list[i];
      const spec = specs[i];
      targetOffset(i, spec, controls, f.swirlTime, _offset);
      const p = body.translation();
      const v = body.linvel();
      const dx = p.x - centre.x;
      const dy = p.y - centre.y;
      const dz = p.z - centre.z;
      // The target's own speed this step (smoothed; zero for a step in the layout), for a move's damping.
      const o3 = i * 3;
      const ax = centre.x + _offset.x;
      const ay = centre.y + _offset.y;
      const az = centre.z + _offset.z;
      let ux = 0;
      let uy = 0;
      let uz = 0;
      if (f.aimsLive) {
        ux = (ax - aims[o3]) / PHYSICS_STEP;
        uy = (ay - aims[o3 + 1]) / PHYSICS_STEP;
        uz = (az - aims[o3 + 2]) / PHYSICS_STEP;
        if (!(ux * ux + uy * uy + uz * uz <= MOVE_FOLLOW_MAX_SPEED * MOVE_FOLLOW_MAX_SPEED)) ux = uy = uz = 0;
      }
      aims[o3] = ax;
      aims[o3 + 1] = ay;
      aims[o3 + 2] = az;
      const sx0 = aimSpeeds[o3];
      const sy0 = aimSpeeds[o3 + 1];
      const sz0 = aimSpeeds[o3 + 2];
      aimSpeeds[o3] += (ux - sx0) * aimBlend;
      aimSpeeds[o3 + 1] += (uy - sy0) * aimBlend;
      aimSpeeds[o3 + 2] += (uz - sz0) * aimBlend;
      // The target's acceleration, capped (the speed's change this step).
      let fx = (aimSpeeds[o3] - sx0) / PHYSICS_STEP;
      let fy = (aimSpeeds[o3 + 1] - sy0) / PHYSICS_STEP;
      let fz = (aimSpeeds[o3 + 2] - sz0) / PHYSICS_STEP;
      const lead = Math.hypot(fx, fy, fz);
      if (lead > MOVE_FOLLOW_MAX_ACCELERATION) {
        const k = MOVE_FOLLOW_MAX_ACCELERATION / lead;
        fx *= k;
        fy *= k;
        fz *= k;
      }
      let rx = -omega2 * (dx - _offset.x);
      let ry = -omega2 * (dy - _offset.y);
      let rz = -omega2 * (dz - _offset.z);
      const pull = Math.hypot(rx, ry, rz);
      if (pull > maxAcceleration) {
        const k = maxAcceleration / pull;
        rx *= k;
        ry *= k;
        rz *= k;
      }
      // The stir: along the pointer's motion, strongest at the pointer, capped.
      let sx = 0;
      let sy = 0;
      if (stirring) {
        const d = Math.hypot(dx - stir.x, dy - stir.y);
        if (d < STIR_RADIUS) {
          const falloff = (1 - d / STIR_RADIUS) ** 2;
          const gain = Math.min(STIR_GAIN * (stirSpeed - STIR_DEAD) * falloff, STIR_MAX) / stirSpeed;
          sx = stir.vx * gain;
          sy = stir.vy * gain;
        }
      }
      // The wall about the box's centre (the view box's has none across: the page goes on), and
      // the panel's, for a body held in one.
      const bx = p.x - f.box.centre.x;
      const by = p.y - f.box.centre.y;
      const bz = p.z - f.box.centre.z;
      if (!(containing && panelWall(f, i, p, v, false, list[i]))) _wall.set(0, 0, 0);
      const vx = v.x - follow * aimSpeeds[o3];
      const vy = v.y - follow * aimSpeeds[o3 + 1];
      const vz = v.z - follow * aimSpeeds[o3 + 2];
      _force.x = (rx - damping * vx + follow * fx + inertia.x * spec.inertiaGain + sx + wallAcceleration(bx, wall.x) + _wall.x) * BODY_MASS;
      _force.y = (ry - damping * vy + follow * fy + inertia.y * spec.inertiaGain + sy + wallAcceleration(by, wall.y) + _wall.y) * BODY_MASS;
      _force.z = (rz - damping * vz + follow * fz + inertia.z * spec.inertiaGain + wallAcceleration(bz, wall.z) + _wall.z) * BODY_MASS;
      body.resetForces(false);
      body.addForce(_force, true);
    }
    f.aimsLive = true;
  });

  useAfterPhysicsStep(() => {
    const f = frameState;
    f.dirty = true;
    // Past the soft wall's reach a held body is stopped at its panel's limit (contacts with the
    // cursor's body may have pushed it there within the step): the surface never leaves the panel.
    const list = bodies.current;
    if (!beginContain(f, list.length)) return;
    for (let i = 0; i < list.length; i++) {
      if (f.walled[i]) panelWall(f, i, list[i].translation(), list[i].linvel(), true, list[i]);
    }
  });

  /**
   * Whether the panels hold the bodies this step (OrbControls.contain), with the walls' frame of
   * reference measured: this frame's camera axes. Off, every metaball lets go of its panel, and on
   * again each takes hold once it is inside its own (bodies arriving from elsewhere are not snapped in).
   */
  function beginContain(f: OrbFrameState, count: number): boolean {
    const contain = controls.contain;
    const camera = f.camera;
    if (!contain.active || !camera || controls.still || motion.paused) {
      f.walled.fill(0);
      return false;
    }
    _right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    _upAxis.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    return count > 0;
  }

  /**
   * Metaball i against its body's panel, on screen: before a step (`clamp` false) the soft wall's
   * acceleration into _wall (physics units/s^2); after one (`clamp` true) a body past the limit is
   * moved back onto it and its outward speed dropped. Takes hold of a metaball once it is inside
   * its limit. False (and _wall untouched) when it has no wall this step.
   */
  function panelWall(
    f: OrbFrameState,
    i: number,
    p: { x: number; y: number; z: number },
    v: { x: number; y: number; z: number },
    clampBody: boolean,
    body: RapierRigidBody,
  ): boolean {
    const contain = controls.contain;
    const k = i % Math.max(contain.count, 1);
    const o = 4 * k;
    const panels = contain.panels;
    const camera = f.camera;
    if (!camera || !(panels[o + 2] > panels[o] && panels[o + 3] > panels[o + 1])) {
      f.walled[i] = 0;
      return false;
    }
    const centre = controls.centre;
    const scale = controls.scale > 0 ? controls.scale : 1;
    _point.set(centre.x + (p.x - centre.x) * scale, centre.y + (p.y - centre.y) * scale, centre.z + (p.z - centre.z) * scale);
    if (!worldToClient(_screen, camera, f.size, _point)) return false;
    // CSS px per physics unit at the metaball's depth.
    const unitPx = pixelsPerUnitAt(camera, f.size, _screen.depth) * scale;
    if (!(unitPx > 0)) return false;
    const inset = splitIsoMargin(contain.count) * unitPx + CONTAIN_MARGIN_PX;
    let x0 = panels[o] + inset;
    let x1 = panels[o + 2] - inset;
    let y0 = panels[o + 1] + inset;
    let y1 = panels[o + 3] - inset;
    // A panel narrower than the body: its centre line.
    if (x1 < x0) x0 = x1 = (panels[o] + panels[o + 2]) / 2;
    if (y1 < y0) y0 = y1 = (panels[o + 1] + panels[o + 3]) / 2;
    const sx = _screen.x;
    const sy = _screen.y;
    if (!f.walled[i]) {
      if (sx < x0 || sx > x1 || sy < y0 || sy > y1) return false;
      f.walled[i] = 1;
    }
    if (clampBody) {
      // Back onto the limit, along the camera's screen axes (screen y points down).
      const dx = clamp(sx, x0, x1) - sx;
      const dy = clamp(sy, y0, y1) - sy;
      if (dx === 0 && dy === 0) return true;
      _shift.copy(_right).multiplyScalar(dx / unitPx).addScaledVector(_upAxis, -dy / unitPx);
      body.setTranslation({ x: p.x + _shift.x, y: p.y + _shift.y, z: p.z + _shift.z }, true);
      const length = _shift.length();
      if (length > 0) {
        _shift.divideScalar(length);
        const inward = v.x * _shift.x + v.y * _shift.y + v.z * _shift.z;
        if (inward < 0) {
          body.setLinvel({ x: v.x - inward * _shift.x, y: v.y - inward * _shift.y, z: v.z - inward * _shift.z }, true);
        }
      }
      return true;
    }
    // The soft wall: into it by `depth` px on a side, pushed back in proportion, the outward speed damped.
    const vr = v.x * _right.x + v.y * _right.y + v.z * _right.z;
    const vu = v.x * _upAxis.x + v.y * _upAxis.y + v.z * _upAxis.z;
    let ar = 0;
    let au = 0;
    const right = sx - (x1 - CONTAIN_SOFT_PX);
    const left = x0 + CONTAIN_SOFT_PX - sx;
    const below = sy - (y1 - CONTAIN_SOFT_PX);
    const above = y0 + CONTAIN_SOFT_PX - sy;
    if (right > 0) ar -= CONTAIN_STIFFNESS * (right / unitPx) + (vr > 0 ? CONTAIN_DAMPING * vr : 0);
    if (left > 0) ar += CONTAIN_STIFFNESS * (left / unitPx) - (vr < 0 ? CONTAIN_DAMPING * vr : 0);
    // Screen down is the camera's -up.
    if (below > 0) au += CONTAIN_STIFFNESS * (below / unitPx) - (vu < 0 ? CONTAIN_DAMPING * vu : 0);
    if (above > 0) au -= CONTAIN_STIFFNESS * (above / unitPx) + (vu > 0 ? CONTAIN_DAMPING * vu : 0);
    _wall.copy(_right).multiplyScalar(ar).addScaledVector(_upAxis, au);
    return true;
  }

  /**
   * The rig carried an anchored orb with the page this frame (OrbControls.carry): move the bodies
   * with it, rigidly, before this frame's physics steps. The field built around the old centre is
   * the same field around the new one, so the mesh and the published orb move with it without a
   * rebuild (rebuilds stay one per physics step). Frozen, the late frame carries the bodies itself.
   * A glide's hand-off (OrbControls.handoff) is added to the bodies' velocity here, once; with the
   * clock stopped it is dropped, so nothing kicks on resume.
   */
  function carryWithPage(list: RapierRigidBody[], f: OrbFrameState): void {
    const handoff = controls.handoff;
    if (handoff.x !== 0 || handoff.y !== 0 || handoff.z !== 0) {
      if (!controls.still && !motion.paused) {
        for (const body of list) {
          const v = body.linvel();
          body.setLinvel({ x: v.x + handoff.x, y: v.y + handoff.y, z: v.z + handoff.z }, true);
        }
      }
      handoff.set(0, 0, 0);
    }
    const carry = controls.carry;
    if ((carry.x === 0 && carry.y === 0 && carry.z === 0) || list.length === 0) return;
    if (controls.still || motion.paused) return;
    for (const body of list) {
      const p = body.translation();
      body.setTranslation({ x: p.x + carry.x, y: p.y + carry.y, z: p.z + carry.z }, false);
    }
    f.builtCentre.add(carry);
    f.box.centre.add(carry);
    for (let i = 0; i < list.length; i++) {
      f.positions[i * 3] += carry.x;
      f.positions[i * 3 + 1] += carry.y;
      f.positions[i * 3 + 2] += carry.z;
      // The targets ride along too: the page's motion is no target speed for a move's damping.
      f.aims[i * 3] += carry.x;
      f.aims[i * 3 + 1] += carry.y;
      f.aims[i * 3 + 2] += carry.z;
    }
  }

  /**
   * Settles the bodies into the current pose at once by stepping the physics synchronously: the
   * scene's clock is stopped (paused, or the reduced-motion still), so they cannot fly there.
   * Physics rather than a teleport to the targets, so the packing (and the orb's size) is real.
   */
  function settleNow(list: RapierRigidBody[]): void {
    const f = frameState;
    for (const body of list) {
      body.setLinvel(ZERO, false);
      body.setAngvel(ZERO, false);
    }
    f.gatherTime = Math.max(f.gatherTime, GATHER_DONE_S);
    f.formed = true;
    f.splashCount = 0;
    f.stir.active = false;
    for (let s = 0; s < SETTLE_STEPS; s++) step(PHYSICS_STEP);
    // Leave them at rest: nothing should drift on from here when the clock starts again.
    for (const body of list) {
      body.setLinvel(ZERO, false);
      body.setAngvel(ZERO, false);
    }
    f.dirty = true;
  }

  /**
   * The box this rebuild uses. Split into cells, or with bodies still too far out for the compact
   * box (arriving from their panels), the view box the rig measured: its centre and extents in
   * physics units (render = C + (physics - C) x scale), its cells as small on screen as the rig
   * asked within the grid's cells (coarser if the view needs more), its centre snapped to whole
   * cells of the bodies' frame. Otherwise the compact cube around the centre (chooseHalf).
   */
  function chooseBox(list: RapierRigidBody[], f: OrbFrameState): FieldBox {
    const box = f.box;
    const extent = bodyExtent(list, f);
    const view = controls.field.view;
    const scale = controls.scale > 0 ? controls.scale : 1;
    const budget = orb.mesh.cellCapacity;
    if ((view.split || extent > TARGET_LIMIT) && view.cell > 0 && budget > 0) {
      const centre = controls.centre;
      const hx = view.half.x / scale;
      const hy = view.half.y / scale;
      const hz = view.half.z / scale;
      if (fitViewGrid(hx, hy, hz, view.cell / scale, budget, _grid)) {
        // The last box's cell while it is near what this frame asks for and no finer (so it fits).
        const previous = box.view ? box.length / box.unit : 0;
        if (previous >= _grid.cell && previous / _grid.cell - 1 < VIEW_CELL_HYSTERESIS) {
          fitViewGrid(hx, hy, hz, previous, budget, _grid);
        }
        const { nx, ny, nz } = _grid;
        const cell = _grid.cell;
        // Where the rig wants the box (physics), snapped to whole cells of the last box's frame
        // (which the carry moves with the bodies) while the cell size holds.
        _boxCentre.set(
          centre.x + (view.centre.x - centre.x) / scale,
          centre.y + (view.centre.y - centre.y) / scale,
          centre.z + (view.centre.z - centre.z) / scale,
        );
        const unit = Math.max(nx, ny, nz);
        const length = unit * cell;
        const same = box.view && Math.abs(box.length / box.unit - cell) < 1e-6 * cell;
        if (same) {
          for (const axis of ["x", "y", "z"] as const) {
            const steps = Math.round((_boxCentre[axis] - box.centre[axis]) / (cell * VIEW_BOX_SNAP));
            _boxCentre[axis] = box.centre[axis] + steps * cell * VIEW_BOX_SNAP;
          }
        }
        box.view = true;
        box.centre.copy(_boxCentre);
        box.nx = nx;
        box.ny = ny;
        box.nz = nz;
        box.unit = unit;
        box.length = length;
        box.cut = view.reach > 0 ? view.reach / length : 0;
        // No wall across (the page goes on), and in depth one at the slab's faces.
        box.wall.set(Infinity, Infinity, Math.max(hz - FIELD_ROOM / 2, hz * 0.5));
        return box;
      }
    }
    const half = chooseHalf(extent, f);
    const resolution = orb.mesh.resolution;
    box.view = false;
    box.centre.copy(controls.centre);
    box.nx = box.ny = box.nz = box.unit = resolution;
    box.length = 2 * half;
    box.cut = 0;
    box.wall.set(half, half, half);
    return box;
  }

  /** How far out the bodies reach from the centre (their targets and where they are), physics units, per axis. */
  function bodyExtent(list: RapierRigidBody[], f: OrbFrameState): number {
    const centre = controls.centre;
    let extent = 0;
    for (let i = 0; i < list.length; i++) {
      targetOffset(i, specs[i], controls, f.swirlTime, _offset);
      const p = list[i].translation();
      extent = Math.max(
        extent,
        Math.abs(_offset.x),
        Math.abs(_offset.y),
        Math.abs(_offset.z),
        Math.abs(p.x - centre.x),
        Math.abs(p.y - centre.y),
        Math.abs(p.z - centre.z),
      );
    }
    return extent;
  }

  /**
   * The compact box: what the bodies need (their extent plus FIELD_ROOM), at least the rig's wish
   * (the largest box whose cells stay small enough at the orb's size on screen: larger is cheaper),
   * within the cost floor and FIELD_SCALE. It grows at once and shrinks with hysteresis.
   */
  function chooseHalf(extent: number, f: OrbFrameState): number {
    const floor = FIELD_FLOOR_STEPS[Math.min(f.floorStep, FIELD_FLOOR_STEPS.length - 1)];
    const wish = Number.isFinite(controls.field.wish) ? controls.field.wish : FIELD_SCALE;
    const need = clamp(Math.max(extent + FIELD_ROOM, wish), floor, FIELD_SCALE);
    if (need > f.half || need < f.half * (1 - FIELD_SHRINK_HYSTERESIS)) f.half = need;
    else f.half = clamp(f.half, floor, FIELD_SCALE);
    return f.half;
  }

  useFrame((state) => {
    const list = bodies.current;
    if (list.length === 0) return;
    const f = frameState;
    const { mesh, material, layers, practice } = orb;
    const frozen = controls.still || motion.paused;

    // Frozen (no physics steps): carry the bodies when the layout moves the centre (a resize
    // re-renders the still), keeping the orb on its anchor.
    if (frozen) {
      const dx = controls.centre.x - f.stillCentre.x;
      const dy = controls.centre.y - f.stillCentre.y;
      const dz = controls.centre.z - f.stillCentre.z;
      if (dx * dx + dy * dy + dz * dz > 1e-8) {
        for (const body of list) {
          const p = body.translation();
          body.setTranslation({ x: p.x + dx, y: p.y + dy, z: p.z + dz }, false);
        }
        f.dirty = true;
      }
    }
    f.stillCentre.copy(controls.centre);

    // The pose jumped (see OrbControls.settleSerial), what shapes the bodies changed while the
    // clock is stopped (a practice page's satellites arriving a tick after the jump), or the
    // visitor's stored pause stopped the clock before the boot gather finished: form the orb in
    // its pose now. The shape is tracked every frame, so pausing itself never reshapes the orb.
    const settleAsked = controls.settleSerial !== f.settleSerial;
    f.settleSerial = controls.settleSerial;
    const reshaped = updateShape(controls, f.shape);
    if (
      (settleAsked && (frozen || motion.capabilities.reducedMotion)) ||
      (reshaped && frozen) ||
      (motion.paused && !f.formed)
    ) {
      settleNow(list);
    }

    // Handed over to the pills' droplets: nothing of the field is left to build or draw.
    const dissolved = clamp(controls.dissolve, 0, 1) >= DISSOLVED;
    mesh.visible = !dissolved;
    if (dissolved) f.dirty = false;

    if (f.dirty) {
      const start = performance.now();
      const box = chooseBox(list, f);
      rebuildField(mesh, list, specs, controls, f, box, config.maxPolyCount);
      const cost = performance.now() - start;
      f.builtCentre.copy(controls.centre);
      f.dirty = false;

      // Field resolution (and the box's floor) from the measured cost (review C8), once the boot
      // has settled. The floor rises first while the compact box sits on it: the cheaper remedy.
      // A coarser grid also has fewer cells for the view box, which coarsens its cells with it.
      if (motion.engine.worldReady && f.readySince === 0) f.readySince = start;
      const measuring = f.readySince > 0 && start - f.readySince > FIELD_MEASURE_DELAY_MS && !frozen;
      const floor = FIELD_FLOOR_STEPS[Math.min(f.floorStep, FIELD_FLOOR_STEPS.length - 1)];
      const floorBinds =
        !box.view && f.floorStep < FIELD_FLOOR_STEPS.length - 1 && f.half <= floor * (1 + FIELD_SHRINK_HYSTERESIS);
      const next = recordRebuild(f.governor, cost, motion.perf.frameMs, mesh.resolution, measuring, floorBinds);
      if (next === RAISE_FIELD_FLOOR) {
        f.floorStep++;
        controls.field.floor = FIELD_FLOOR_STEPS[f.floorStep];
      } else if (next > 0) {
        // init() keeps the vertex buffers, the isolation and the bounds, but empties the grid:
        // rebuild at once, so no frame draws without the orb.
        mesh.init(next);
        rebuildField(mesh, list, specs, controls, f, chooseBox(list, f), config.maxPolyCount);
        motion.perf.fieldResolution = next;
      }
      motion.perf.rebuildMs = f.governor.rebuildMs;
    }

    // The box's centre in render space (C + (B - C) x scale), and its box unit's half in world units.
    const scale = controls.scale > 0 ? controls.scale : 1;
    const box = f.box;
    const built = f.builtCentre;
    mesh.position.set(
      built.x + (box.centre.x - built.x) * scale,
      built.y + (box.centre.y - built.y) * scale,
      built.z + (box.centre.z - built.z) * scale,
    );
    const meshScale = (box.length / 2) * scale;
    mesh.scale.setScalar(meshScale);
    const thickness = REFRACTION_RAY / meshScale;
    material.thickness = thickness;

    // Services: each body's practice photo over its region; the base drops out once covered.
    const mix = clamp(controls.practiceMix, 0, 1);
    const layered = mix > PRACTICE_EPSILON;
    material.visible = mix < 1 - PRACTICE_EPSILON;
    practice.uPracticeMix.value = mix;
    if (layered) groupCentres(f.positions, list.length, specs, f.builtCentre, scale, practice.uBodyCentres.value);
    for (let k = 0; k < layers.length; k++) {
      const layer = layers[k];
      layer.visible = layered;
      const environment = practiceEnvironments.textures[k];
      if (layer.material.envMap !== environment) {
        layer.material.envMap = environment;
        layer.material.needsUpdate = true;
      }
      layer.material.thickness = thickness;
    }

    publishOrb(state, f.positions, list.length, f.builtCentre, scale, 1 - clamp(controls.dissolve, 0, 1));
    // The droplets leave from (and return to) the liquid's body as drawn.
    updatePillDroplets(
      droplets,
      controls,
      state.camera,
      state.size,
      motion.time.sceneDelta,
      motion.orb.x,
      motion.orb.y,
      motion.capabilities.reducedMotion,
    );
    publishBodies(state, f, list.length, controls, specs, scale, droplets);

    if (!f.announced) {
      f.announced = true;
      onFirstFrame?.();
    }
  }, FRAME_ORDER.late);

  return (
    <>
      <primitive object={orb.mesh} />
      <primitive object={droplets.mesh} />
    </>
  );
}

/**
 * A press throws the metaballs near it outward from their own body's centre (and away from the
 * press, toward the camera). `reach` scales the splash's radius to the bodies' size.
 */
function applySplash(
  list: RapierRigidBody[],
  controls: OrbControls,
  px: number,
  py: number,
  pz: number,
  strength: number,
  reach: number,
): void {
  const centre = controls.centre;
  const radius = SPLASH_RADIUS * reach;
  for (let i = 0; i < list.length; i++) {
    const body = list[i];
    const p = body.translation();
    const qx = p.x - px;
    const qy = p.y - py;
    const qz = p.z - pz;
    const d = Math.hypot(qx, qy, qz);
    if (d >= radius) continue;
    // From its body's centre (its cluster's target): a split's bodies burst each about its own.
    clusterOffset(i, controls, _point).add(centre);
    const rx = p.x - _point.x;
    const ry = p.y - _point.y;
    const rz = p.z - _point.z;
    const r = Math.hypot(rx, ry, rz) || 1;
    const q = d || 1;
    let dx = rx / r + (SPLASH_PRESS_BIAS * qx) / q;
    let dy = ry / r + (SPLASH_PRESS_BIAS * qy) / q;
    let dz = rz / r + (SPLASH_PRESS_BIAS * qz) / q + SPLASH_TOWARD_CAMERA;
    const length = Math.hypot(dx, dy, dz) || 1;
    dx /= length;
    dy /= length;
    dz /= length;
    const falloff = 1 - d / radius;
    const dv = SPLASH_SPEED * strength * falloff * falloff;
    _impulse.x = dx * dv * BODY_MASS;
    _impulse.y = dy * dv * BODY_MASS;
    _impulse.z = dz * dv * BODY_MASS;
    body.applyImpulse(_impulse, true);
  }
}

/** A tap reaches the orb unless it lands on the fixed chrome or an overlay above the page. */
function tapReachesOrb(x: number, y: number): boolean {
  if (typeof document === "undefined") return false;
  const target = document.elementFromPoint(x, y);
  if (!target || isInsideFixedChrome(target) || target.closest(ABOVE_SCENE_SELECTOR)) return false;
  return target.closest("main, body") !== null;
}

/** A practice page with its satellites out publishes (and swells) the three practices, not the layout's bodies. */
function byPracticeGroup(controls: OrbControls): boolean {
  return controls.practiceGroup >= 0 && controls.satellite >= 0.5;
}

/** The published body metaball i belongs to: its cluster in the layout the bodies are in, or its group. */
function bodyOf(i: number, spec: BodySpec, controls: OrbControls): number {
  return byPracticeGroup(controls) ? spec.group : i % Math.max(dominantLayout(controls).count, 1);
}

function rebuildField(
  mesh: MarchingCubes,
  list: RapierRigidBody[],
  specs: BodySpec[],
  controls: OrbControls,
  f: OrbFrameState,
  box: FieldBox,
  maxPolyCount: number,
): void {
  const positions = f.positions;
  const colours = f.colours;
  // The box's strength scale keeps the surface where it is in physics space (orb-field.ts): the
  // term is strength / d_box^2 with d_box = d / length, three's 0.5 at a box unit of 10.
  const boxGain = fieldStrengthScale(box.length / 2);
  // Dissolving into the pills' droplets, the liquid thins out of every metaball alike.
  const liquid = 1 - clamp(controls.dissolve, 0, 1);
  // Box coordinates: (p - B) / length, centred on each axis's span (n / unit box units).
  const bc = box.centre;
  const length = box.length;
  const ox = box.nx / box.unit / 2;
  const oy = box.ny / box.unit / 2;
  const oz = box.nz / box.unit / 2;
  mesh.setGrid(box.nx, box.ny, box.nz, box.unit);
  for (let i = 0; i < list.length; i++) {
    const p = list[i].translation();
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
    const spec = specs[i];
    const cluster = bodyOf(i, spec, controls);
    const swell = controls.swell[cluster] * (1 + PRESS_SWELL * f.kick[cluster]);
    const light = controls.brightness[spec.group] * controls.glow[cluster] * (1 + f.feed.light[cluster]);
    const colour = colours[i].copy(spec.colour).multiplyScalar(light);
    mesh.addBall(
      (p.x - bc.x) / length + ox,
      (p.y - bc.y) / length + oy,
      (p.z - bc.z) / length + oz,
      BALL_STRENGTH * controls.strength[spec.group] * swell * boxGain * liquid,
      BALL_SUBTRACT,
      colour.r,
      colour.g,
      colour.b,
      box.cut,
    );
  }
  mesh.update();

  // Upload only the vertices this rebuild wrote (three otherwise sends the whole buffers).
  // Clamped to the buffer, and an empty field still sends one triangle, because a range of
  // length 0 means "to the end".
  const vertices = clamp(mesh.vertexCount, 3, maxPolyCount * 3);
  const geometry = mesh.geometry;
  for (const name of ["position", "normal", "color"] as const) {
    const attribute = geometry.getAttribute(name);
    if (!(attribute instanceof THREE.BufferAttribute)) continue;
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, vertices * attribute.itemSize);
  }
}

/** The three practice groups' centres in render space (the bodies the practice layers belong to). */
function groupCentres(
  positions: Float32Array,
  count: number,
  specs: BodySpec[],
  centre: THREE.Vector3,
  scale: number,
  out: THREE.Vector3[],
): void {
  for (let g = 0; g < GROUP_COUNT; g++) {
    out[g].set(0, 0, 0);
    _groupCounts[g] = 0;
  }
  for (let i = 0; i < count; i++) {
    const g = specs[i].group;
    out[g].x += positions[i * 3];
    out[g].y += positions[i * 3 + 1];
    out[g].z += positions[i * 3 + 2];
    _groupCounts[g]++;
  }
  for (let g = 0; g < GROUP_COUNT; g++) {
    const n = Math.max(_groupCounts[g], 1);
    out[g].set(
      centre.x + (out[g].x / n - centre.x) * scale,
      centre.y + (out[g].y / n - centre.y) * scale,
      centre.z + (out[g].z / n - centre.z) * scale,
    );
  }
}

/**
 * motion.bodies: each body of the layout the bodies are in (on a practice page with its
 * satellites out, the three practices), projected: centre, silhouette radius and share of the
 * orb; its radius is its farthest metaball plus the iso margin of a body that size, thinned as it
 * dissolves (none once mostly dissolved). Then the pills' droplets grown enough to count, up to
 * MAX_ORB_BODIES in all (the cap binds only for a few frames of a move from a full feature grid).
 * controls.liquidBodies: how many of them are the orb's own.
 */
function publishBodies(
  state: RootState,
  f: OrbFrameState,
  count: number,
  controls: OrbControls,
  specs: BodySpec[],
  scale: number,
  droplets: PillDroplets,
): void {
  const byGroup = byPracticeGroup(controls);
  const clusters = byGroup ? GROUP_COUNT : Math.min(Math.max(dominantLayout(controls).count, 1), MAX_ORB_BODIES);
  const positions = f.positions;
  const centre = f.builtCentre;
  const box = state.size;
  const out = motion.bodies;
  out.length = 0;
  const liquid = 1 - clamp(controls.dissolve, 0, 1);
  const dissolvedBodies = 1 - liquid >= DISSOLVED_BODIES;
  for (let k = 0; k < clusters && !dissolvedBodies && out.length < MAX_ORB_BODIES; k++) {
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let n = 0;
    for (let i = 0; i < count; i++) {
      if (bodyOf(i, specs[i], controls) !== k) continue;
      sx += positions[i * 3];
      sy += positions[i * 3 + 1];
      sz += positions[i * 3 + 2];
      n++;
    }
    if (n === 0) continue;
    sx /= n;
    sy /= n;
    sz /= n;
    let extent = 0;
    for (let i = 0; i < count; i++) {
      if (bodyOf(i, specs[i], controls) !== k) continue;
      extent = Math.max(extent, Math.hypot(positions[i * 3] - sx, positions[i * 3 + 1] - sy, positions[i * 3 + 2] - sz));
    }
    _point.set(centre.x + (sx - centre.x) * scale, centre.y + (sy - centre.y) * scale, centre.z + (sz - centre.z) * scale);
    if (!worldToClient(_screen, state.camera, box, _point)) continue;
    const margin = splitIsoMargin(clusters);
    const radius = (extent + margin) * scale * pixelsPerUnitAt(state.camera, box, _screen.depth) * Math.sqrt(liquid);
    f.bodyIndex[out.length] = k;
    const body = f.bodies[out.length];
    body.x = _screen.x;
    body.y = _screen.y;
    body.radius = Number.isFinite(radius) ? radius : 0;
    body.weight = (n / count) * liquid;
    out.push(body);
  }
  controls.liquidBodies = out.length;
  // The droplets share the liquid that went into them.
  const share = droplets.count > 0 ? clamp(controls.droplets.handover, 0, 1) / droplets.count : 0;
  for (let k = 0; k < droplets.count && out.length < MAX_ORB_BODIES; k++) {
    if (!dropletPublished(droplets, k)) continue;
    f.bodyIndex[out.length] = -1 - k;
    const body = f.bodies[out.length];
    body.x = droplets.x[k];
    body.y = droplets.y[k];
    body.radius = droplets.radius[k];
    body.weight = share;
    out.push(body);
  }
}

/**
 * Projected centre and radius of the orb for the boot wave and other effects (client CSS px); its
 * radius thins with the `liquid` left in it (the rest dissolved into the pills' droplets).
 */
function publishOrb(state: RootState, positions: Float32Array, count: number, centre: THREE.Vector3, scale: number, liquid: number): void {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (let i = 0; i < count; i++) {
    sx += positions[i * 3];
    sy += positions[i * 3 + 1];
    sz += positions[i * 3 + 2];
  }
  sx /= count;
  sy /= count;
  sz /= count;
  let extent = 0;
  for (let i = 0; i < count; i++) {
    const d = Math.hypot(positions[i * 3] - sx, positions[i * 3 + 1] - sy, positions[i * 3 + 2] - sz);
    if (d > extent) extent = d;
  }
  _centroid.set(centre.x + (sx - centre.x) * scale, centre.y + (sy - centre.y) * scale, centre.z + (sz - centre.z) * scale);

  const out = motion.orb;
  const box = state.size;
  if (!worldToClient(_screen, state.camera, box, _centroid)) {
    out.visible = false;
    return;
  }
  const radius = (extent + ISO_MARGIN) * scale * pixelsPerUnitAt(state.camera, box, _screen.depth) * Math.sqrt(liquid);
  out.x = _screen.x;
  out.y = _screen.y;
  out.radius = Number.isFinite(radius) ? radius : 0;
  out.visible =
    out.x + out.radius > box.left &&
    out.x - out.radius < box.left + box.width &&
    out.y + out.radius > box.top &&
    out.y - out.radius < box.top + box.height;
}
