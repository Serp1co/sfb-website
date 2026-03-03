"use client";

import { OrbitControls, Environment } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import Metaballs from "./metaballs";
import MouseBall from "./mouse-ball";
import { PerformanceConfig, getPerformanceConfig } from "./performance-configs";
import React from "react";

interface MetaballSimulationProps {
  config?: Partial<PerformanceConfig>;
  showDebugInfo?: boolean;
  enableOrbitControls?: boolean;
  enableEnvironment?: boolean;
  environmentPreset?: 'sunset' | 'dawn' | 'night' | 'warehouse' | 'forest' | 'apartment' | 'studio' | 'city' | 'park' | 'lobby';
}

const MetaballSimulation: React.FC<MetaballSimulationProps> = ({ 
  config,
  enableOrbitControls = true,
  enableEnvironment = false,
  environmentPreset = 'city'
}) => {
  const performanceConfig = getPerformanceConfig('quality', config);  // Default to quality
  
  return (
    <>
      {/* Lighting water effect */}
      <hemisphereLight 
        args={[0x00bbff, 0xaa00ff]}  // Sky blue to purple gradient
        intensity={0.2} 
      />
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 5, 5]} intensity={0.5} />
      
      {/* Optional orbit controls */}
      {enableOrbitControls && (
        <OrbitControls 
          enableDamping
          dampingFactor={0.1}
          enableZoom={false}
        />
      )}
      
      <Physics 
        gravity={[0, 0, 0]}
        timeStep={1/60}
        interpolate={false}
        updatePriority={-1}
      >
        <Metaballs config={performanceConfig} />
        <MouseBall />
      </Physics>
      
      {/* Optional environment */}
      {enableEnvironment && (
        <Environment preset={environmentPreset} />
      )}
    </>
  );
};

export default MetaballSimulation;