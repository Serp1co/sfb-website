"use client";

import { Environment } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import React, { useRef, useMemo, useEffect } from "react";
import { RGBELoader, EXRLoader } from "three/examples/jsm/Addons.js";
import * as THREE from "three";

export const AnimatedBackground: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.1) * 0.2;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.05;
    }
  });
  return (
    <mesh ref={meshRef} position={[0, 0, -10]} scale={20}>
      <icosahedronGeometry args={[1, 2]} />
      <meshBasicMaterial 
        color={0x001122} 
        wireframe 
        transparent 
        opacity={0.2}
      />
    </mesh>
  );
};

export const GradientBackground: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const fragmentShader = `
    uniform float time;
    varying vec2 vUv;
    void main() {
      vec3 color1 = vec3(0.0, 0.1, 0.3);
      vec3 color2 = vec3(0.3, 0.0, 0.2);
      vec3 color = mix(color1, color2, vUv.y + sin(time + vUv.x * 3.0) * 0.1);
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  useFrame((state) => {
    if (meshRef.current) {
      (meshRef.current.material as THREE.ShaderMaterial).uniforms.time.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0, -15]} scale={[30, 30, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={{
          time: { value: 0 }
        }}
      />
    </mesh>
  );
};

export const BackgroundSphere: React.FC<{ hue?: number }> = ({ hue = 0.565 }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  const [geometry] = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(8, 3);
    const bgSphereColors: number[] = [];
    const positions = geo.attributes.position;
    const len = positions.count;
    for (let i = 0; i < len; i++) {
      const z = -positions.getZ(i);
      const color = new THREE.Color().setHSL(hue, 1, Math.pow(z * 0.08, 3));
      bgSphereColors.push(color.r, color.g, color.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(bgSphereColors, 3));
    return [geo, bgSphereColors];
  }, [hue]);

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshBasicMaterial 
        side={THREE.BackSide}
        vertexColors
        fog={false}
      />
    </mesh>
  );
};

export const HDRBackground: React.FC<{ 
  path: string; 
  blur?: number;
  format?: 'hdr' | 'exr' | 'jpg' | 'png';
  visible?: boolean;  // Controls if background is visible to camera
  intensity?: number;  // Environment intensity for reflections
  exposure?: number;   // Exposure adjustment for HDR
}> = ({ 
  path, 
  blur = 0.05, 
  format = 'hdr', 
  visible = false, 
  intensity = 1,
  exposure = 1
}) => {
  const { scene, gl } = useThree();
  
  useEffect(() => {
    let loader: RGBELoader | EXRLoader | THREE.TextureLoader;
    switch(format) {
      case 'hdr':
        loader = new RGBELoader();
        break;
      case 'exr':
        loader = new EXRLoader();
        break;
      case 'jpg':
      case 'png':
      default:
        loader = new THREE.TextureLoader();
        break;
    }
    
    loader.load(
      path,
      (texture) => {
        // For HDR/EXR formats, use the texture directly as environment
        if (format === 'hdr' || format === 'exr') {
          // Set proper mapping for HDR
          texture.mapping = THREE.EquirectangularReflectionMapping;
          
          // Apply the texture directly for HDR formats
          // This preserves the HDR data properly
          scene.environment = texture;
          scene.environmentIntensity = intensity;
          
          if (visible) {
            scene.background = texture;
            scene.backgroundBlurriness = blur;
            scene.backgroundIntensity = exposure;
          }
        } else {
          // For regular images (JPG/PNG), use the cube camera approach
          // since they need to be converted to environment maps
          
          // Create a cube render target
          const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(1024, {
            format: THREE.RGBAFormat,
            generateMipmaps: true,
            minFilter: THREE.LinearMipmapLinearFilter,
            colorSpace: THREE.SRGBColorSpace
          });

          // Create cube camera
          const cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget);

          // Create a temporary scene
          const tempScene = new THREE.Scene();
          
          // Set color space for JPG/PNG
          texture.colorSpace = THREE.SRGBColorSpace;
          
          // Create sphere with emissive material for proper lighting
          const sphereGeo = new THREE.SphereGeometry(100, 64, 32);
          const sphereMat = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.BackSide
          });
          
          const sphere = new THREE.Mesh(sphereGeo, sphereMat);
          tempScene.add(sphere);

          // Render to cube camera
          cubeCamera.position.set(0, 0, 0);
          cubeCamera.update(gl, tempScene);

          // Apply the converted environment
          scene.environment = cubeRenderTarget.texture;
          scene.environmentIntensity = intensity;

          if (visible) {
            scene.background = cubeRenderTarget.texture;
            scene.backgroundBlurriness = blur;
          }

          // Cleanup temp geometry
          sphereGeo.dispose();
          sphereMat.dispose();
        }
        
        // Apply tone mapping to the renderer for HDR content
        if (format === 'hdr' || format === 'exr') {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = exposure;
        }
      },
      undefined,
      (error) => {
        console.error('Error loading HDR/image:', error);
      }
    );
    
    // Cleanup
    return () => {
      scene.environment = null;
      scene.environmentIntensity = 1;
      scene.background = null;
      scene.backgroundBlurriness = 0;
      scene.backgroundIntensity = 1;
      // Reset tone mapping
      gl.toneMapping = THREE.NoToneMapping;
      gl.toneMappingExposure = 1;
    };
  }, [path, blur, format, scene, gl, visible, intensity, exposure]);
  
  return null;
};

export const DreiImageBackground: React.FC<{ path: string; blur?: number }> = ({ path, blur = 0.05 }) => {
  return <Environment files={path} background blur={blur} />;
};
