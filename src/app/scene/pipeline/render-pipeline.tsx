"use client";

/*
 * The render pipeline in the R3F tree: runs FramePipeline at useFrame priority 1, so it comes after
 * every world callback (priority <= 0, Rapier at -1) and takes over rendering from R3F (a positive
 * priority switches R3F's own gl.render off). The useFrame delta is scene time (the ticker's scene
 * clock: 0 while the visitor has paused the animation).
 */

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { SceneTier } from "../../motion/store";
import { FramePipeline } from "./frame-pipeline";

/** Runs after the world; any positive priority also turns off R3F's automatic render. */
const PIPELINE_PRIORITY = 1;

/**
 * Where the canvas finds the live pipeline: the reduced-motion still re-runs only its composite,
 * outside R3F's frame (nothing else in the scene needs to run for that). Null until the first frame.
 */
export interface PipelineHandle {
  current: FramePipeline | null;
}

export interface RenderPipelineProps {
  /** Pipeline tier; the performance monitor may change it at run time (the world keeps its own). */
  tier: SceneTier;
  /** Called once, on the first composite frame that shows the world. */
  onSceneReady?: () => void;
  handle: PipelineHandle;
}

export default function RenderPipeline({ tier, onSceneReady, handle }: RenderPipelineProps): null {
  const gl = useThree((state) => state.gl);
  const tierRef = useRef(tier);
  const readyRef = useRef(onSceneReady);

  useEffect(() => {
    tierRef.current = tier;
    readyRef.current = onSceneReady;
  }, [tier, onSceneReady]);

  // Created lazily in the frame and dropped on unmount, so a StrictMode remount builds a fresh one.
  useEffect(
    () => () => {
      handle.current?.dispose();
      handle.current = null;
    },
    [gl, handle],
  );

  useFrame((state, delta) => {
    const pipeline = (handle.current ??= new FramePipeline(gl, tierRef.current));
    if (pipeline.frame(state, delta, tierRef.current)) readyRef.current?.();
  }, PIPELINE_PRIORITY);

  return null;
}
