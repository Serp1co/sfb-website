"use client";

import {useTexture} from "@react-three/drei";
import {useThree} from "@react-three/fiber";
import {JSX, useEffect} from "react";
import * as THREE from "three";

// Hidden environment for reflections only (not visible to camera)
export function HiddenReflectionEnvironment({
  imagePath,
  backgroundVisible = false,
  intensity = 1
}: {
  imagePath: string;
  backgroundVisible?: boolean;
  intensity?: number;
}): JSX.Element | null {
  const { scene, gl } = useThree();
  const texture = useTexture(imagePath);

  useEffect(() => {
    // Create a cube render target for environment mapping
    const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(512, {
      format: THREE.RGBAFormat,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      colorSpace: THREE.SRGBColorSpace
    });

    // Create cube camera
    const cubeCamera = new THREE.CubeCamera(0.1, 100, cubeRenderTarget);

    // Create a temporary scene with the image
    const tempScene = new THREE.Scene();
    const sphereGeo = new THREE.SphereGeometry(50, 64, 32);
    const sphereMat = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    tempScene.add(sphere);

    // Render to cube camera
    cubeCamera.position.set(0, 0, 0);
    cubeCamera.update(gl, tempScene);

    // IMPORTANT: Only set environment, NOT background
    // This makes reflections work without showing the environment
    scene.environment = cubeRenderTarget.texture;
    scene.environmentIntensity = intensity;

    // Only set background if explicitly requested
    if (backgroundVisible) {
      scene.background = cubeRenderTarget.texture;
      scene.backgroundBlurriness = 0.02;
    }

    return () => {
      scene.environment = null;
      scene.environmentIntensity = 1;
      if (backgroundVisible) {
        scene.background = null;
      }
      cubeRenderTarget.dispose();
    };
  }, [texture, scene, gl, backgroundVisible, intensity]);

  return null;
}

// Static background that doesn't affect reflections
export function StaticBackground({
  color,
  gradient
}: {
  color?: string;
  gradient?: { from: string; to: string };
}): JSX.Element | null {
  const { scene } = useThree();

  useEffect(() => {
    if (gradient) {
      // Create gradient texture
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 512;
      const context = canvas.getContext('2d')!;
      const gradientFill = context.createLinearGradient(0, 0, 0, 512);
      gradientFill.addColorStop(0, gradient.from);
      gradientFill.addColorStop(1, gradient.to);
      context.fillStyle = gradientFill;
      context.fillRect(0, 0, 2, 512);

      const gradientTexture = new THREE.CanvasTexture(canvas);
      gradientTexture.needsUpdate = true;
      scene.background = gradientTexture;

      return () => {
        gradientTexture.dispose();
        scene.background = null;
      };
    } else if (color) {
      scene.background = new THREE.Color(color);
      return () => {
        scene.background = null;
      };
    }
  }, [scene, color, gradient]);

  return null;
}

// Combine hidden reflections with fog for depth
export function AdvancedFakeReflectionSetup({
  reflectionImage,
  backgroundColor,
  fogColor = "#001122",
  isFogEnabled = true,
  fogNear = 10,
  fogFar = 50
}: {
  reflectionImage: string;
  backgroundColor: string | { from: string; to: string };
  isFogEnabled?: boolean;
  fogColor?: string;
  fogNear?: number;
  fogFar?: number;
}): JSX.Element {
  const { scene } = useThree();
  // Setup fog for depth effect
  useEffect(() => {
    if(isFogEnabled) {
    scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);
    return () => {
      scene.fog = null;
    };
  }
  }, [scene, isFogEnabled, fogColor, fogNear, fogFar]);

  return (
    <>
      {/* Hidden environment for water reflections */}
      <HiddenReflectionEnvironment
        imagePath={reflectionImage}
        backgroundVisible={false}
        intensity={2}  // Boost for stronger reflections
      />

      {/* Visible background */}
      {typeof backgroundColor === 'string' ? (
        <StaticBackground color={backgroundColor} />
      ) : (
        <StaticBackground gradient={backgroundColor} />
      )}
    </>
  );
}
