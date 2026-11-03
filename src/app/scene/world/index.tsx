"use client";

/*
 * Everything the camera sees, and nothing that renders: lights, reflections (the circuit's on the
 * scene, the practice photos' kept for the Services bodies) and fog, the camera rig, the metaball
 * orb with its physics (and the technology pills' droplets it hands its liquid over to), the
 * circuit boards in depth, the droplets, the partner nodes, the service circuitry and a practice
 * page's cell circuitry (every trace that meets a body runs into a junction point under it).
 * Frame callbacks follow FRAME_ORDER (all <= 0); the pipeline renders at 1.
 *
 * Reads motion (time, story, pointer, scroll, engine, paused) and the glass contract's anchors;
 * writes motion.orb and motion.bodies every frame, motion.engine.worldReady once the world is up,
 * and the orb's field cost and resolution (motion.perf.rebuildMs, fieldResolution).
 *
 * Everything autonomous here runs on the scene clock (useFrame's delta = motion.time.sceneDelta,
 * 0 while the visitor has paused the animation): physics, shader time, drift, breathing, springs.
 */

import { Suspense, useCallback, useEffect, useRef, useState, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { SERVICE_IMAGES, SERVICE_SLUGS } from "../../data/site-data";
import { SETTLE_MS, motion, type SceneTier } from "../../motion/store";
import {
  HiddenReflections,
  PracticeReflections,
  VoidBackdrop,
  createPracticeEnvironments,
} from "../../aquaism/backgrounds/hidden-reflections";
import { FRAME_ORDER, PHYSICS_STEP } from "../../aquaism/core/frame-order";
import Orb from "../../aquaism/core/orb";
import { getWorldConfig } from "../../aquaism/core/performance-configs";
import PointerBody from "../../aquaism/core/pointer-body";
import CameraRig from "./camera-rig";
import CellLinks from "./cell-links";
import CircuitBoards from "./circuit-boards";
import Droplets from "./droplets";
import PartnerNodes from "./partner-nodes";
import ServiceLinks from "./service-links";
import { FOG_COLOUR } from "./world-materials";
import { createWorldState } from "./world-state";

/** The circuit photo the orb reflects (never shown as a background), at the original intensity. */
const REFLECTION_IMAGE = "/hero-bg-ultra-low.jpg";
const REFLECTION_INTENSITY = 10;
/** The practice photos the three Services bodies reflect, SERVICE_SLUGS order (the bodies' groups). */
const PRACTICE_IMAGES = [
  SERVICE_IMAGES[SERVICE_SLUGS[0]],
  SERVICE_IMAGES[SERVICE_SLUGS[1]],
  SERVICE_IMAGES[SERVICE_SLUGS[2]],
] as const;

/** Three's fog, which only the orb's material takes: the boards fade to black on their own. */
const ORB_FOG_NEAR = 5;
const ORB_FOG_FAR = 32;

const GRAVITY: [number, number, number] = [0, 0, 0];

/** If the reflections or the circuit texture stall, the world reports ready this long after the orb exists. */
const READY_TIMEOUT_MS = 2500;

function Lights(): JSX.Element {
  return (
    <>
      <hemisphereLight args={[0x00bbff, 0xaa00ff, 0.2]} />
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 5, 5]} intensity={0.5} />
    </>
  );
}

interface Readiness {
  /** performance.now() of the orb's first rebuilt frame; 0 until Rapier has loaded and it ran. */
  physicsAt: number;
  environment: boolean;
  circuit: boolean;
  settleTimer: number;
}

export default function World({ tier }: { tier: SceneTier }): JSX.Element {
  // The initial tier only. The orb steps its grid down live on its own, from the measured rebuild
  // cost (field-governor); the rest (buffers, droplets, boards, texture) is sized once.
  const [config] = useState(() => getWorldConfig(tier));
  const [world] = useState(createWorldState);
  const [practiceEnvironments] = useState(createPracticeEnvironments);
  const [still, setStill] = useState(false);
  const readiness = useRef<Readiness>({ physicsAt: 0, environment: false, circuit: false, settleTimer: 0 });

  const onPhysicsReady = useCallback(() => {
    readiness.current.physicsAt = performance.now();
  }, []);
  const onEnvironmentSettled = useCallback(() => {
    readiness.current.environment = true;
  }, []);
  const onCircuitSettled = useCallback(() => {
    readiness.current.circuit = true;
  }, []);

  useEffect(() => {
    world.orb.still = still;
  }, [world, still]);

  useEffect(() => {
    const state = readiness.current;
    return () => {
      window.clearTimeout(state.settleTimer);
      motion.engine.worldReady = false;
      motion.orb.visible = false;
    };
  }, []);

  useFrame(() => {
    const r = readiness.current;
    // Reduced motion: the orb settles out of sight for SETTLE_MS, then physics pauses and the
    // shader clock stops. Checked per frame, because the preference can switch on at run time.
    if (motion.capabilities.reducedMotion && r.settleTimer === 0) {
      r.settleTimer = window.setTimeout(() => setStill(true), SETTLE_MS);
    }
    // Ready once the orb has drawn (Rapier loaded, first world frame ran) and its reflections
    // and the circuitry are in place, so the boot wave never plays over an empty scene.
    if (
      !motion.engine.worldReady &&
      r.physicsAt > 0 &&
      ((r.environment && r.circuit) || performance.now() - r.physicsAt > READY_TIMEOUT_MS)
    ) {
      motion.engine.worldReady = true;
    }
  }, FRAME_ORDER.late);

  return (
    <>
      <Lights />
      <VoidBackdrop fogColor={FOG_COLOUR} fogNear={ORB_FOG_NEAR} fogFar={ORB_FOG_FAR} />
      <HiddenReflections image={REFLECTION_IMAGE} intensity={REFLECTION_INTENSITY} onSettled={onEnvironmentSettled} />
      <PracticeReflections images={PRACTICE_IMAGES} target={practiceEnvironments} />
      <CameraRig world={world} fieldResolution={config.fieldResolution} />
      {/* Rapier's WASM suspends: only the physics waits for it, never the boards or the pipeline. */}
      <Suspense fallback={null}>
        <Physics
          gravity={GRAVITY}
          timeStep={PHYSICS_STEP}
          interpolate={false}
          updatePriority={FRAME_ORDER.physics}
          paused={still}
        >
          <Orb config={config} controls={world.orb} practiceEnvironments={practiceEnvironments} onFirstFrame={onPhysicsReady} />
          <PointerBody controls={world.orb} />
        </Physics>
      </Suspense>
      <CircuitBoards config={config} world={world} onTextureSettled={onCircuitSettled} />
      <Droplets count={config.dropletCount} world={world} />
      <PartnerNodes world={world} />
      <ServiceLinks world={world} />
      <CellLinks world={world} />
    </>
  );
}
