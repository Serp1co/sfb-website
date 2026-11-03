"use client";

/*
 * The 2D circuitry placed in 3D depth: a floor receding into the fog below the orb, a faint
 * back wall, and the scroll flight, sparse boards that come out of the fog toward the camera as
 * the page scrolls and fade before they reach the orb. All of them sit in the opaque render
 * list, so the orb's transmission refracts them: the globe has circuitry inside.
 */

import { useEffect, useMemo, useState, type JSX } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { motion } from "../../motion/store";
import { FRAME_ORDER } from "../../aquaism/core/frame-order";
import { smoothstep } from "../../aquaism/core/math";
import type { WorldConfig } from "../../aquaism/core/performance-configs";
import { paintCircuit } from "./circuit-texture";
import {
  FLIGHT_BASE_Z,
  FLIGHT_CENTRE_Y,
  FLIGHT_FADE_IN,
  FLIGHT_FADE_OUT,
  FLIGHT_FAR,
  FLIGHT_NEAR,
  FLIGHT_ORB_CLEARANCE,
  FLIGHT_SIZE,
  FLIGHT_SPAN,
  FLOOR_CENTRE_Z,
  FLOOR_SIZE,
  FLOOR_TILE,
  FLOOR_Y,
  WALL_CENTRE_Y,
  WALL_SIZE,
  WALL_TILE,
  WALL_Z,
} from "./layers";
import { createBoardMaterial, powerSeconds, type BoardUniforms } from "./world-materials";
import type { WorldState } from "./world-state";

/** Fixed seed: the same board on every visit. */
const CIRCUIT_SEED = 72026;
/** The texture is painted in an idle period, at the latest this long after mount. */
const IDLE_TIMEOUT_MS = 400;
const IDLE_FALLBACK_MS = 120;

/**
 * Layer brightness before the pose's emphasis: the floor carries the circuitry, the flight is a
 * sparse passing layer and the wall a faint haze. The wall and the flight sit behind the copy, so
 * they stay low (they were too bright and busy there).
 */
const FLOOR_GAIN = 1;
const FLIGHT_GAIN = 0.6;
const WALL_GAIN = 0.35;
/** Edge fades (fraction of the board's local uv) in x and y. */
const FLOOR_EDGE: [number, number] = [0.14, 0.04];
const WALL_EDGE: [number, number] = [0.12, 0.16];
const FLIGHT_EDGE: [number, number] = [0.2, 0.22];
/** Flight boards in the order a smaller tier keeps them (2 boards: 10 units apart). */
const FLIGHT_ORDER = [0, 2, 1, 3] as const;

type BoardMaterial = THREE.ShaderMaterial & { uniforms: BoardUniforms };

interface Board {
  mesh: THREE.Mesh<THREE.PlaneGeometry, BoardMaterial>;
  gain: number;
  /** Flight boards only: depth at zero travel. */
  baseZ: number | null;
}

interface BoardSet {
  floor: Board;
  wall: Board;
  flight: Board[];
  all: Board[];
}

function scheduleIdle(task: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(task, { timeout: IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(task, IDLE_FALLBACK_MS);
  return () => window.clearTimeout(handle);
}

function createCircuitTexture(gl: THREE.WebGLRenderer, size: number): THREE.CanvasTexture {
  const canvas = paintCircuit(size, CIRCUIT_SEED);
  const texture = new THREE.CanvasTexture(canvas);
  // Data, not colour: no sRGB decode on upload or sampling.
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // Mipmaps: the boards' depth of field samples blurrier levels with distance (shaders.ts).
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // The floor is seen at a grazing angle; anisotropy keeps its traces from smearing into haze.
  texture.anisotropy = gl.capabilities.getMaxAnisotropy();
  // Upload now (and build the mipmaps) rather than inside the first frame that draws a board.
  gl.initTexture(texture);
  // The GPU copy is all that is drawn from now on: release the canvas's 16 MB (at 2048) of
  // pixels (review m15). three re-reads it only if needsUpdate is set again, which nothing does.
  canvas.width = 1;
  canvas.height = 1;
  return texture;
}

function createBoard(
  geometry: THREE.PlaneGeometry,
  texture: THREE.Texture,
  texels: number,
  gain: number,
  sparse: number,
  sparseSeed: [number, number],
  edge: [number, number],
  baseZ: number | null,
): Board {
  const material = createBoardMaterial({ texture, texels, gain, sparse, sparseSeed, edge });
  return { mesh: new THREE.Mesh(geometry, material), gain, baseZ };
}

function createBoards(texture: THREE.Texture, texels: number, flightCount: number): BoardSet {
  const floor = createBoard(new THREE.PlaneGeometry(FLOOR_SIZE[0], FLOOR_SIZE[1]), texture, texels, FLOOR_GAIN, 0, [0, 0], FLOOR_EDGE, null);
  floor.mesh.rotation.x = -Math.PI / 2;
  // Height from the rig every frame (world.floorY): lower in portrait.
  floor.mesh.position.set(0, FLOOR_Y, FLOOR_CENTRE_Z);

  const wall = createBoard(new THREE.PlaneGeometry(WALL_SIZE[0], WALL_SIZE[1]), texture, texels, WALL_GAIN, 0, [0, 0], WALL_EDGE, null);
  wall.mesh.position.set(0, WALL_CENTRE_Y, WALL_Z);
  wall.mesh.material.uniforms.uUvTransform.value.setUvTransform(0.21, 0.43, WALL_SIZE[0] / WALL_TILE, WALL_SIZE[1] / WALL_TILE, Math.PI / 2, 0.5, 0.5);

  const flightGeometry = new THREE.PlaneGeometry(FLIGHT_SIZE[0], FLIGHT_SIZE[1]);
  const flight: Board[] = [];
  for (const index of FLIGHT_ORDER.slice(0, Math.min(flightCount, FLIGHT_ORDER.length))) {
    // Same texture, a different window onto it and a quarter turn each, so no two boards match.
    const board = createBoard(flightGeometry, texture, texels, FLIGHT_GAIN, 1, [index * 3.7, index * 1.9], FLIGHT_EDGE, FLIGHT_BASE_Z[index]);
    board.mesh.position.set(0, FLIGHT_CENTRE_Y, FLIGHT_BASE_Z[index]);
    board.mesh.material.uniforms.uUvTransform.value.setUvTransform(
      0.37 * index,
      0.61 * index,
      1,
      FLIGHT_SIZE[1] / FLIGHT_SIZE[0],
      (index * Math.PI) / 2,
      0.5,
      0.5,
    );
    flight.push(board);
  }
  return { floor, wall, flight, all: [floor, wall, ...flight] };
}

function disposeBoards(set: BoardSet): void {
  const geometries = new Set<THREE.BufferGeometry>();
  for (const board of set.all) {
    geometries.add(board.mesh.geometry);
    board.mesh.material.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
}

function wrap(value: number, span: number): number {
  return ((value % span) + span) % span;
}

interface CircuitBoardsProps {
  config: WorldConfig;
  world: WorldState;
  /** Called once the texture is ready (or failed): part of the world's readiness. */
  onTextureSettled?: () => void;
}

export default function CircuitBoards({ config, world, onTextureSettled }: CircuitBoardsProps): JSX.Element | null {
  const gl = useThree((state) => state.gl);
  const size = config.circuitTextureSize;
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    let done = false;
    const cancel = scheduleIdle(() => {
      if (done) return;
      done = true;
      try {
        setTexture(createCircuitTexture(gl, size));
      } catch (error) {
        // No circuitry is a lesser scene, not a broken one: the orb still floats in the void.
        console.error("Circuit texture failed", error);
      }
      onTextureSettled?.();
    });
    return () => {
      done = true;
      cancel();
    };
  }, [gl, size, onTextureSettled]);

  useEffect(() => () => texture?.dispose(), [texture]);

  const boards = useMemo(() => (texture ? createBoards(texture, size, config.flightBoards) : null), [texture, size, config.flightBoards]);
  useEffect(() => () => (boards ? disposeBoards(boards) : undefined), [boards]);

  useFrame(() => {
    if (!boards) return;
    const time = world.time;
    const power = powerSeconds(world.powerStartMs, motion.time.now);
    const emphasis = world.boardEmphasis;
    for (const board of boards.all) {
      const u = board.mesh.material.uniforms;
      u.uTime.value = time;
      u.uPowerT.value = power;
      u.uPowerOrigin.value.copy(world.powerOrigin);
      u.uOrb.value.copy(world.orb.centre);
      u.uGain.value = board.gain * emphasis;
    }

    // The floor's circuitry runs toward the camera with the scroll, in step with the flight.
    boards.floor.mesh.position.y = world.floorY;
    boards.floor.mesh.material.uniforms.uUvTransform.value.setUvTransform(
      0,
      world.travel / FLOOR_TILE,
      FLOOR_SIZE[0] / FLOOR_TILE,
      FLOOR_SIZE[1] / FLOOR_TILE,
      0,
      0,
      0,
    );

    // Flight: wrapped over the span, faded out of the fog and before the orb.
    const end = Math.min(FLIGHT_NEAR, world.orb.centre.z - FLIGHT_ORB_CLEARANCE);
    for (const board of boards.flight) {
      const z = FLIGHT_FAR + wrap((board.baseZ ?? FLIGHT_FAR) - FLIGHT_FAR + world.travel, FLIGHT_SPAN);
      const weight =
        smoothstep(FLIGHT_FAR, FLIGHT_FAR + FLIGHT_FADE_IN, z) * (1 - smoothstep(end - FLIGHT_FADE_OUT, end, z));
      board.mesh.position.z = z;
      board.mesh.visible = weight > 0.002;
      board.mesh.material.uniforms.uGain.value = board.gain * emphasis * weight;
    }
  }, FRAME_ORDER.late);

  if (!boards) return null;
  return (
    <>
      <primitive object={boards.floor.mesh} />
      <primitive object={boards.wall.mesh} />
      {boards.flight.map((board, i) => (
        <primitive key={i} object={board.mesh} />
      ))}
    </>
  );
}
