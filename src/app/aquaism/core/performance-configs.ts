import type { SceneTier } from "../../motion/store";

/**
 * What the world builds for a tier, chosen once from the canvas's initial tier. The one live
 * change is the orb's grid: it starts at fieldResolution and steps down (72 -> 56 -> 48) when its
 * measured rebuild cost takes too much of the frame (field-governor.ts). Only the triangle
 * capacity is fixed at construction. The performance monitor retunes the render pipeline.
 */
export interface WorldConfig {
  /**
   * Marching-cubes cells per axis over the +-5 field at the start. The site's main CPU cost:
   * one rebuild (reset + 30 balls + update) of the vendored marching cubes is ~3.7 ms at 72,
   * ~1.8 ms at 56 and ~1.2 ms at 48 in Node on the dev machine (scratch f3/mc-bench.mjs).
   */
  fieldResolution: number;
  /**
   * Triangle capacity of the orb's buffers. Overflow drops triangles without a GL error, so this
   * is the measured worst case plus margin. Three loose clusters with every group swollen made
   * 5964 at res 72 and 2672 at 48 in the full box (scratch mc-worst); the merged orb in the
   * shrunk box makes more, ~7300 at its 2.9 floor at 72 and ~3400 at 48 (scratch W/mcbench),
   * more again swollen or splashed. A coarser live grid makes fewer. Only the vertices a rebuild
   * wrote are uploaded, so spare capacity costs memory (~1.6 MB at 13000), not bandwidth.
   */
  maxPolyCount: number;
  bodyCount: number;
  /** MeshPhysicalMaterial.dispersion: triples the transmission taps, so quality only. */
  dispersion: number;
  /** Glass beads: sparse, so they read as depth, not as a field of specks over the copy. */
  dropletCount: number;
  /** Boards in the scroll flight (the floor and the back wall are always drawn). */
  flightBoards: number;
  /** Side of the generated circuit texture; the layout is the same at every size. */
  circuitTextureSize: number;
}

const CONFIGS: Record<SceneTier, WorldConfig> = {
  quality: {
    fieldResolution: 72,
    maxPolyCount: 13000,
    bodyCount: 30,
    dispersion: 0.3,
    dropletCount: 40,
    flightBoards: 4,
    circuitTextureSize: 2048,
  },
  // Not a starting tier today (capabilities pick quality or performance), but a valid one.
  balanced: {
    fieldResolution: 64,
    maxPolyCount: 10400,
    bodyCount: 30,
    dispersion: 0,
    dropletCount: 32,
    flightBoards: 3,
    circuitTextureSize: 2048,
  },
  performance: {
    fieldResolution: 48,
    maxPolyCount: 6000,
    bodyCount: 30,
    dispersion: 0,
    dropletCount: 24,
    flightBoards: 2,
    circuitTextureSize: 1024,
  },
};

export function getWorldConfig(tier: SceneTier): WorldConfig {
  return CONFIGS[tier] ?? CONFIGS.quality;
}
