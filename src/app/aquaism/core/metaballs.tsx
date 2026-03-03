"use client";
import { useFrame } from "@react-three/fiber";
import React, { useState, useRef, useEffect } from "react";
import { PerformanceConfig } from "./performance-configs";
import * as THREE from "three";
import PhysicsBody from "./physics-body";
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';

const colorPalette = [0x0067b1, 0x4e99ce, 0x9bcbeb, 0x55d7e2, 0xffffff, 0x9ca9b2, 0x4e6676, 0xf69230, 0xf5d81f];

const Metaballs: React.FC<{ config: PerformanceConfig }> = ({ config }) => {
  const [metaballs] = useState(() => {
    const metaMat = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      transmission: 1.0, // Full transmission for water effect
      thickness: 1.0, // Affects refraction depth
      roughness: 0.0, // Glass-like clarity
      metalness: 0.0, // No metallic properties
      transparent: true, // Required for transmission
      ior: 1.33, // Index of refraction (water = 1.33)
      clearcoat: 1.0, // Additional glossy layer
      clearcoatRoughness: 0.0,
    });
   
    const mb = new MarchingCubes(
      config.metaballResolution,
      metaMat,
      true, // Enable UVs - important for material
      true, // Enable colors
      8200 // Max poly count
    );
   
    mb.scale.setScalar(5);
    mb.isolation = 1000;
   
    return mb;
  });

  const positionsRef = useRef<THREE.Vector3[]>([]);
  const colorsRef = useRef<THREE.Color[]>([]);
  const frameCounter = useRef(0);
  
  // Track bodies with stable IDs to prevent recreation
  const [bodyData, setBodyData] = useState<Array<{
    id: string;
    initialPosition: [number, number, number];
    color: THREE.Color;
  }>>([]);

  const updateBodyPosition = (index: number, position: THREE.Vector3) => {
    if (positionsRef.current[index]) {
      positionsRef.current[index] = position;
    }
  };

  const numBodies = config.numBodies;

  // Generate initial body data only when needed
  useEffect(() => {
    setBodyData(current => {
      const newData = [...current];
      
      // If we need more bodies, add them
      if (newData.length < numBodies) {
        const range = 6;
        for (let i = newData.length; i < numBodies; i++) {
          newData.push({
            id: `body-${Date.now()}-${i}`, // Stable unique ID
            initialPosition: [
              Math.random() * range - range * 0.5,
              Math.random() * range - range * 0.5 + 3,
              Math.random() * range - range * 0.5
            ],
            color: new THREE.Color(colorPalette[Math.floor(Math.random() * colorPalette.length)])
          });
        }
      }
      // If we have too many bodies, remove extras
      else if (newData.length > numBodies) {
        newData.splice(numBodies);
      }
      
      return newData;
    });
  }, [numBodies]);

  // Update refs when body data changes
  useEffect(() => {
    // Resize arrays while preserving existing positions
    const currentPositions = positionsRef.current;
    const newPositions = new Array(bodyData.length);
    
    for (let i = 0; i < bodyData.length; i++) {
      // Preserve existing position if available, otherwise create new
      newPositions[i] = currentPositions[i] || new THREE.Vector3();
    }
    
    positionsRef.current = newPositions;
    colorsRef.current = bodyData.map(d => d.color);
  }, [bodyData]);

  // Update metaball resolution if it changes
  useEffect(() => {
    if (metaballs.resolution !== config.metaballResolution) {
      // Note: MarchingCubes doesn't have a direct way to update resolution
      console.warn('Metaball resolution change requires recreation');
    }
  }, [config.metaballResolution, metaballs]);

  useFrame(() => {
    frameCounter.current++;
   
    if (frameCounter.current % config.updateFrequency === 0) {
      metaballs.reset();
      const strength = 0.5;
      const subtract = 10;
     
      const positions = positionsRef.current;
      const colors = colorsRef.current;
     
      for (let i = 0; i < positions.length && i < bodyData.length; i++) {
        const pos = positions[i];
        if (pos) {
          metaballs.addBall(
            pos.x,
            pos.y,
            pos.z,
            strength,
            subtract,
            colors[i]
          );
        }
      }
     
      metaballs.update();
    }
  });

  return (
    <>
      <primitive object={metaballs} />
     
      {bodyData.map((data, i) => (
        <PhysicsBody
          key={data.id} // Stable key prevents remounting
          initialPosition={data.initialPosition}
          updatePosition={(position) => updateBodyPosition(i, position)}
        />
      ))}
    </>
  );
};

export default Metaballs;