"use client";

/*
 * The cursor's body in the liquid: a kinematic ball the orb's metaballs bump into. It follows
 * motion.pointer (the site's own pointer state; R3F's pointer events are not used), projected
 * onto the orb plane.
 *
 * - Moved with setNextKinematicTranslation, so contacts see a velocity, never a teleport.
 * - Disabled (not parked far away) when the pointer leaves the window, and on touch between
 *   presses. On re-entry it is enabled at the projected point with a tiny collider that eases
 *   to full size, so it parts the orb instead of blasting it apart.
 * - On glass too (owner decision 2026-11-02): the orb's bodies live under the panels, and the
 *   cursor moving over a panel parts the body inside it. (It used to lift toward the camera over
 *   glass, review M2, when the orb was parked behind the hero's buttons.)
 * - The faster it moves, the wider it parts the liquid (its collider grows with its speed); the
 *   orb's stir (orb.tsx) drags the liquid along with it on top of that.
 * - Still while the visitor has paused the animation (no physics steps run then anyway).
 */

import { useLayoutEffect, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useBeforePhysicsStep, useRapier, type RapierCollider, type RapierRigidBody } from "@react-three/rapier";
import { motion } from "../../motion/store";
import { FRAME_ORDER, PHYSICS_STEP } from "./frame-order";
import { approach, clamp } from "./math";
import type { OrbControls } from "./orb-controls";
import { ORB_RADIUS } from "./orb-field";
import { clientToPlaneZ } from "./projection";

/**
 * Collider radius, physics units: below the orb's own radius (1.15), so the cursor parts the
 * liquid instead of shoving the whole orb aside (it was 1.5, the original cursor body).
 */
const POINTER_RADIUS = 0.9;
/**
 * Split into cells, the bodies are smaller than the merged orb (a nine-way body is ~0.5): the
 * collider shrinks with them (never below this share), so it still parts the body under the
 * cursor instead of shoving it out of its panel.
 */
const POINTER_MIN_SHARE = 0.4;

/** The collider's size for the bodies the orb is split into now, as a share of the merged orb's. */
function bodyShare(controls: OrbControls): number {
  return clamp(controls.bodyRadius / ORB_RADIUS, POINTER_MIN_SHARE, 1);
}
/** Radius on re-entry, eased up to POINTER_RADIUS over POINTER_EASE_IN seconds. */
const POINTER_RADIUS_START = 0.05;
const POINTER_EASE_IN = 0.3;
/** The original plane sat 0.2 in front of the orb centre. */
const POINTER_PLANE_OFFSET = 0.2;
/**
 * Extra collider radius at speed (physics units), reached at POINTER_SPEED_FULL units/s across
 * the plane: a sweep parts a wider wake than a resting cursor, a flick wider still.
 */
const POINTER_SPEED_RADIUS = 0.4;
const POINTER_SPEED_FULL = 10;
/**
 * Lag of the body behind the cursor, seconds: smooths uneven pointer events into a steady
 * velocity, and caps the body's speed (so its contact impulse) on fast moves.
 */
const POINTER_FOLLOW_TAU = 0.08;
/**
 * Top speed of the body across the orb plane, physics units/s (~1400 px/s at the hero's depth).
 * A kinematic body cannot be stopped, so a faster flick would plough metaballs out of the
 * marching-cubes grid however hard the orb's springs and wall pull back (scratch f3/flick-sim).
 * 16 (it was 12) pushes harder: the field box grows to hold what it throws (orb.tsx).
 */
const POINTER_MAX_SPEED = 16;
/**
 * A pointer that moves further than this between two ticks has jumped (a pen tablet, a remote
 * desktop, synthetic input), not swept: the body re-enters at the new point like after leaving the
 * window, instead of ploughing through the orb at that speed and scattering it. A real flick
 * covers ~50 px per frame; the ripple input uses the same limit for its strokes.
 */
const POINTER_JUMP_PX = 400;

interface PointerBodyState {
  body: RapierRigidBody | null;
  collider: RapierCollider | null;
  wanted: boolean;
  enabled: boolean;
  /** The pointer jumped since the last physics step (see POINTER_JUMP_PX). */
  jumped: boolean;
  radius: number;
  /** The radius it is easing toward: POINTER_RADIUS, plus its speed's share. */
  reach: number;
  target: THREE.Vector3;
  current: THREE.Vector3;
  hit: THREE.Vector3;
}

export default function PointerBody({ controls }: { controls: OrbControls }): null {
  const { world, rapier } = useRapier();
  const [state] = useState<PointerBodyState>(() => ({
    body: null,
    collider: null,
    wanted: false,
    enabled: false,
    jumped: false,
    radius: POINTER_RADIUS_START,
    reach: POINTER_RADIUS,
    target: new THREE.Vector3(),
    current: new THREE.Vector3(),
    hit: new THREE.Vector3(),
  }));

  // Layout effect for the same reason as the orb's bodies: removed while the world is alive.
  useLayoutEffect(() => {
    const body = world.createRigidBody(
      rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0, 0).setEnabled(false),
    );
    const collider = world.createCollider(rapier.ColliderDesc.ball(POINTER_RADIUS_START), body);
    state.body = body;
    state.collider = collider;
    state.enabled = false;
    return () => {
      state.body = null;
      state.collider = null;
      if (world.getRigidBody(body.handle)) world.removeRigidBody(body);
    };
  }, [world, rapier, state]);

  // Where the body should be this frame, from this frame's camera (FRAME_ORDER.orb).
  useFrame((root) => {
    const pointer = motion.pointer;
    const touch = pointer.type === "touch";
    const dt = motion.time.sceneDelta;
    const active =
      controls.pointerEnabled &&
      !controls.still &&
      !motion.paused &&
      pointer.inside &&
      (!touch || pointer.down) &&
      pointer.x > -9000;
    if (!active || !clientToPlaneZ(state.hit, root.camera, root.size, pointer.x, pointer.y, controls.centre.z)) {
      state.wanted = false;
      return;
    }
    const jumped = state.wanted && Math.hypot(pointer.x - pointer.prevX, pointer.y - pointer.prevY) > POINTER_JUMP_PX;
    if (jumped) state.jumped = true;

    const centre = controls.centre;
    const scale = controls.scale > 0 ? controls.scale : 1;
    state.target.set(
      centre.x + (state.hit.x - centre.x) / scale,
      centre.y + (state.hit.y - centre.y) / scale,
      centre.z + POINTER_PLANE_OFFSET,
    );
    state.wanted = true;
    if (!(dt > 0)) state.reach = POINTER_RADIUS * bodyShare(controls);
  }, FRAME_ORDER.orb);

  useBeforePhysicsStep(() => {
    const { body, collider } = state;
    if (!body || !collider) return;

    if (!state.wanted) {
      if (state.enabled) {
        body.setEnabled(false);
        state.enabled = false;
      }
      return;
    }

    if (state.jumped && state.enabled) {
      // A jump: leave the orb where it is and come back in at the new point (below).
      body.setEnabled(false);
      state.enabled = false;
    }
    state.jumped = false;

    if (!state.enabled) {
      // Re-entry: appear where the cursor is (a teleport is harmless while disabled), small.
      state.current.copy(state.target);
      body.setTranslation(state.current, false);
      state.radius = POINTER_RADIUS_START;
      collider.setRadius(state.radius);
      body.setEnabled(true);
      state.enabled = true;
    }

    // Follow the cursor with a lag, at most POINTER_MAX_SPEED across the plane.
    const follow = approach(PHYSICS_STEP, POINTER_FOLLOW_TAU);
    const current = state.current;
    let dx = (state.target.x - current.x) * follow;
    let dy = (state.target.y - current.y) * follow;
    const stepLength = Math.hypot(dx, dy);
    const maxStep = POINTER_MAX_SPEED * PHYSICS_STEP;
    if (stepLength > maxStep) {
      dx *= maxStep / stepLength;
      dy *= maxStep / stepLength;
    }
    current.set(current.x + dx, current.y + dy, current.z + (state.target.z - current.z) * follow);
    body.setNextKinematicTranslation(current);

    // Wider at speed; the same ease as the re-entry's, both ways, so it never snaps into the liquid.
    const speed = Math.hypot(dx, dy) / PHYSICS_STEP;
    state.reach = (POINTER_RADIUS + POINTER_SPEED_RADIUS * clamp(speed / POINTER_SPEED_FULL, 0, 1)) * bodyShare(controls);
    const ease = ((POINTER_RADIUS - POINTER_RADIUS_START) * PHYSICS_STEP) / POINTER_EASE_IN;
    const radius = state.radius < state.reach ? Math.min(state.reach, state.radius + ease) : Math.max(state.reach, state.radius - ease);
    if (radius !== state.radius) {
      state.radius = radius;
      collider.setRadius(radius);
    }
  });

  return null;
}
