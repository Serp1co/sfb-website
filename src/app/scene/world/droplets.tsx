"use client";

/*
 * Glass beads riding the same scroll travel as the boards: the near-field depth reference.
 * Instanced camera-facing quads rather than THREE.Points, whose size is capped by the hardware
 * (ALIASED_POINT_SIZE_RANGE) and which pop at the screen edges as their centre leaves the view.
 * Drift, depth of field, the pointer's push and the fade under bare text all run on the GPU; the
 * CPU only sets uniforms. Sparse and soft (bokeh), so they read as depth, not as specks.
 */

import { useEffect, useState, type JSX } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { ANCHORS, anchorRects } from "../../glass/contract";
import { motion } from "../../motion/store";
import { FRAME_ORDER } from "../../aquaism/core/frame-order";
import { createRandom, createSpring, omegaForSettle, smoothstep, stepSpring } from "../../aquaism/core/math";
import {
  DROPLET_COPY_RECTS,
  DROPLET_FAR,
  DROPLET_NEAR,
  createDropletMaterial,
  powerSeconds,
  type DropletUniforms,
} from "./world-materials";
import type { WorldState } from "./world-state";

/** Fixed seed: the same beads on every visit. */
const DROPLET_SEED = 9101;
/** Bead diameter at the focus plane, world units (~10 px at the hero's depth). */
const DROPLET_SIZE = 0.09;
/** Where the beads live around the view (world units), before drift. */
const DROPLET_SPREAD_X = 11;
const DROPLET_SPREAD_Y = 6.5;
/** Fade-in after the circuitry powers on, seconds. */
const DROPLET_FADE_IN = 1.4;
/** The pointer's push at its peak (NDC units, ~13 px at 900 px tall), eased in and out. */
const PUSH_STRENGTH = 0.03;
const PUSH_SETTLE = 0.5;

/** The bare text the beads fade under: the copy anchors and the practice title block. */
const COPY_ANCHORS = [ANCHORS.copy, ANCHORS.practiceCopy] as const;

interface DropletMesh {
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial & { uniforms: DropletUniforms }>;
  push: ReturnType<typeof createSpring>;
}

function createDroplets(count: number): DropletMesh {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(quad.getIndex());
  geometry.setAttribute("position", quad.getAttribute("position"));
  geometry.instanceCount = count;

  const random = createRandom(DROPLET_SEED);
  const base = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    base[i * 3] = (random() * 2 - 1) * DROPLET_SPREAD_X;
    base[i * 3 + 1] = (random() * 2 - 1) * DROPLET_SPREAD_Y;
    base[i * 3 + 2] = DROPLET_FAR + random() * (DROPLET_NEAR - DROPLET_FAR);
    for (let k = 0; k < 4; k++) seed[i * 4 + k] = random();
  }
  geometry.setAttribute("aBase", new THREE.InstancedBufferAttribute(base, 3));
  geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 4));

  const mesh = new THREE.Mesh(geometry, createDropletMaterial(DROPLET_SIZE));
  // The geometry's bounds are one quad at the origin; the beads are placed in the shader.
  mesh.frustumCulled = false;
  return { mesh, push: createSpring(0) };
}

/**
 * This frame's on-screen copy rects into the uniforms (client CSS px, x0 y0 x1 y1). With reduced
 * motion the scene is a still of the page's top, so the rects are taken where they are at scroll 0
 * (as the rig places the poses).
 */
function packCopyRects(u: DropletUniforms): void {
  const height = motion.viewport.height;
  const width = motion.viewport.width;
  const shift = motion.capabilities.reducedMotion ? motion.scroll.y : 0;
  let count = 0;
  for (const name of COPY_ANCHORS) {
    const rects = anchorRects.get(name);
    if (!rects) continue;
    for (const rect of rects) {
      if (count >= DROPLET_COPY_RECTS) break;
      if (!(rect.width > 0 && rect.height > 0)) continue;
      const y = rect.y + shift;
      if (y >= height || y + rect.height <= 0 || rect.x >= width || rect.x + rect.width <= 0) continue;
      u.uCopy.value[count++].set(rect.x, y, rect.x + rect.width, y + rect.height);
    }
  }
  u.uCopyCount.value = count;
}

export default function Droplets({ count, world }: { count: number; world: WorldState }): JSX.Element {
  const [droplets] = useState(() => createDroplets(count));

  useEffect(() => {
    const { mesh } = droplets;
    return () => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    };
  }, [droplets]);

  useFrame((state) => {
    const u = droplets.mesh.material.uniforms;
    const box = state.size;
    u.uTime.value = world.time;
    u.uTravel.value = world.travel;
    u.uFocus.value = world.focusDistance;
    u.uAspect.value = box.width / Math.max(box.height, 1);
    u.uViewport.value.set(box.left, box.top, Math.max(box.width, 1), Math.max(box.height, 1));
    const power = powerSeconds(world.powerStartMs, motion.time.now);
    u.uFade.value = power < 0 ? 0 : smoothstep(0, DROPLET_FADE_IN, power);
    packCopyRects(u);

    const pointer = motion.pointer;
    const pushing =
      !motion.capabilities.reducedMotion &&
      !motion.paused &&
      pointer.inside &&
      pointer.x > -9000 &&
      (pointer.type !== "touch" || pointer.down) &&
      box.width > 0;
    if (pushing) {
      u.uPointer.value.set(((pointer.x - box.left) / box.width) * 2 - 1, 1 - ((pointer.y - box.top) / box.height) * 2);
    }
    u.uPush.value = stepSpring(droplets.push, pushing ? PUSH_STRENGTH : 0, omegaForSettle(PUSH_SETTLE), motion.time.sceneDelta);
  }, FRAME_ORDER.late);

  return <primitive object={droplets.mesh} />;
}
