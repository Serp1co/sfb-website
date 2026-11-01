"use client";

import { useEffect, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { AdvancedFakeReflectionSetup } from "../aquaism/backgrounds/reflective-background";
import { HDRBackground } from "../aquaism/backgrounds/background-loader";
import MetaballSimulation from "../aquaism/core/metaball-simulation";
import { getPerformanceConfig } from "../aquaism/core/performance-configs";
import { useCoarsePointer, usePrefersReducedMotion } from "../hooks";

/** How long the scene runs out of sight, with reduced motion, before it is shown as a still frame. */
const SETTLE_MS = 6000;

/**
 * With reduced motion the loop only runs on demand. Keep requesting frames
 * (hidden, see below) so the blobs gather into the orb, then stop on that frame.
 */
function SettleThenFreeze({ ms }: { ms: number }) {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const start = performance.now();
    let frame = 0;
    const tick = () => {
      invalidate();
      if (performance.now() - start < ms) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [invalidate, ms]);

  return null;
}

/**
 * The marching-cubes grid is allocated once, so the quality tier has to be
 * known before the scene mounts. Phones get the lighter tier: the grid is a
 * CPU cost paid every frame, 48^3 cells instead of 72^3.
 */
function pickPreset(): "performance" | "quality" {
  const lightweight =
    window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(max-width: 768px)").matches;
  return lightweight ? "performance" : "quality";
}

/**
 * The metaball / reflection scene. Loaded after the page (client-only, see
 * SiteShell) so the content is readable and interactive without waiting for
 * three.js and the physics engine.
 */
export default function SceneCanvas() {
  const reducedMotion = usePrefersReducedMotion();
  const coarsePointer = useCoarsePointer();
  const [preset] = useState(pickPreset);
  const [revealed, setRevealed] = useState(false);

  // Normal motion shows the scene at once. Reduced motion lets it settle out of
  // sight first, so the visitor never sees the blobs move, only the finished orb.
  useEffect(() => {
    if (!reducedMotion) {
      setRevealed(true);
      return;
    }
    const timer = setTimeout(() => setRevealed(true), SETTLE_MS);
    return () => {
      clearTimeout(timer);
      setRevealed(false);
    };
  }, [reducedMotion]);

  return (
    <div className="scene-fade" data-reveal={revealed ? "shown" : "hidden"} data-still={reducedMotion}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 75 }}
        frameloop={reducedMotion ? "demand" : "always"}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          outputColorSpace: THREE.SRGBColorSpace,
          powerPreference: "high-performance",
        }}
        dpr={coarsePointer ? [1, 1.25] : [1, 1.5]}
        performance={{ min: 0.5, max: 1 }}
        onCreated={({ gl }) => {
          // Production only: skip the per-program shader log query. It prints harmless driver
          // warnings (for example Direct3D's X4122) and costs a GPU round-trip per compile.
          // Development keeps the check so real shader errors still show.
          if (process.env.NODE_ENV === "production") gl.debug.checkShaderErrors = false;
        }}
      >
        <AdvancedFakeReflectionSetup
          reflectionImage="/hero-bg-ultra-low.jpg"
          backgroundColor="#000000"
          fogColor="#008cff"
          fogNear={5}
          fogFar={20}
          isFogEnabled
        />
        <HDRBackground
          path="/hero-bg-ultra-low.jpg"
          format="jpg"
          blur={0.02}
          visible={false}
          exposure={10}
          intensity={10}
        />
        {/* Touch has no pointer to orbit with, and a swipe should scroll the page. */}
        <MetaballSimulation config={getPerformanceConfig(preset)} enableOrbitControls={!coarsePointer} />
        {reducedMotion && <SettleThenFreeze ms={SETTLE_MS} />}
      </Canvas>
    </div>
  );
}
