"use client";

import { forwardRef } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { AdvancedFakeReflectionSetup } from "../aquaism/backgrounds/reflective-background";
import { HDRBackground } from "../aquaism/backgrounds/background-loader";
import MetaballSimulation from "../aquaism/core/metaball-simulation";
import { getPerformanceConfig } from "../aquaism/core/performance-configs";

/**
 * Fixed-position fullscreen canvas that renders the metaball / reflection scene.
 * Accepts a ref so the parent can wire up event-forwarding.
 */
const CanvasBackground = forwardRef<HTMLDivElement>(function CanvasBackground(_, ref) {
  return (
    <div ref={ref} className="fixed inset-0 w-full h-full" style={{ zIndex: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 75 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          outputColorSpace: THREE.SRGBColorSpace,
          powerPreference: "high-performance",
        }}
        dpr={[1, 1.5]}
        performance={{ min: 0.5, max: 1 }}
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
        <MetaballSimulation config={getPerformanceConfig("quality")} />
      </Canvas>
    </div>
  );
});

export default CanvasBackground;
