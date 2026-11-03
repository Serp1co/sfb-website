"use client";

/*
 * What the orb reflects and what it floats in.
 *
 * HiddenReflections: the circuit-board photo becomes the scene's environment (reflections and
 * the clearcoat's sheen on the orb) without ever being drawn as a background. It is the original
 * orb's look: the image on the inside of a sphere, captured by a cube camera, at intensity 10.
 * The prefiltered (PMREM) map the physical material samples is built here, in the image's load
 * task, and not lazily by three inside the first frame that draws the orb (a ~200 ms hitch in
 * the master tick at boot, review m14). The cube capture is released once it has been filtered.
 *
 * PracticeReflections: the same capture for the three practice photos, kept off the scene: in
 * Services each of the orb's three bodies reflects its own practice's photo (owner decision
 * 2026-11-02), through a material of its own (orb.tsx). Smaller cubes: the photos are 709 px wide.
 *
 * VoidBackdrop: the black clear colour and the blue depth fog. Three's fog only reaches
 * built-in materials with fog enabled, which in this world is the orb alone: the circuit layers
 * are ShaderMaterials that fade to black themselves (an additive quad under three's fog would
 * add the fog colour over its whole area).
 */

import { useEffect } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";

/**
 * Cube face size. The source is 960 px wide, so each 90-degree face holds ~240 source px: 256
 * keeps all of its detail. It also sets the size of the PMREM built from it (HalfFloat, ~6 MB).
 */
const ENV_CUBE_SIZE = 256;
const ENV_SPHERE_RADIUS = 50;
const ENV_SPHERE_SEGMENTS = [64, 32] as const;
/** A practice photo is 709 px wide, ~180 px per cube face: 128 keeps it (each PMREM ~1.5 MB, not ~6). */
const PRACTICE_CUBE_SIZE = 128;

/**
 * Captures an image on the inside of a sphere into a cube and prefilters it for the physical
 * material (PMREM). Disposes the image texture; null if the prefilter failed.
 */
function buildEnvironment(gl: THREE.WebGLRenderer, texture: THREE.Texture, size: number): THREE.WebGLRenderTarget | null {
  texture.colorSpace = THREE.SRGBColorSpace;
  // No mipmaps (the PMREM does the filtering) and no depth buffer: the sphere covers every
  // texel, and a depth buffer here was ~1.5 MB allocated and never read (review m15).
  const cube = new THREE.WebGLCubeRenderTarget(size, {
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    colorSpace: THREE.SRGBColorSpace,
    depthBuffer: false,
  });
  // No depth test either: the pipeline may have turned off autoClear.
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(ENV_SPHERE_RADIUS, ...ENV_SPHERE_SEGMENTS),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, depthTest: false, depthWrite: false }),
  );
  const stage = new THREE.Scene();
  stage.add(sphere);
  new THREE.CubeCamera(0.1, ENV_SPHERE_RADIUS * 2, cube).update(gl, stage);
  sphere.geometry.dispose();
  sphere.material.dispose();
  texture.dispose();

  const pmrem = new THREE.PMREMGenerator(gl);
  try {
    return pmrem.fromCubemap(cube.texture);
  } catch (error) {
    // No reflections is a duller orb, not a broken scene.
    console.error("Orb environment failed", error);
    return null;
  } finally {
    pmrem.dispose();
    cube.dispose();
  }
}

interface HiddenReflectionsProps {
  image: string;
  /** scene.environmentIntensity. */
  intensity: number;
  /** Called once the environment is in place, or the image failed (the world can start without it). */
  onSettled?: () => void;
}

export function HiddenReflections({ image, intensity, onSettled }: HiddenReflectionsProps): null {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    let cancelled = false;
    let environment: THREE.WebGLRenderTarget | null = null;

    new THREE.TextureLoader().load(
      image,
      (texture) => {
        if (cancelled) {
          texture.dispose();
          return;
        }
        environment = buildEnvironment(gl, texture, ENV_CUBE_SIZE);
        if (environment) {
          scene.environment = environment.texture;
          scene.environmentIntensity = intensity;
        }
        onSettled?.();
      },
      undefined,
      () => {
        if (!cancelled) onSettled?.();
      },
    );

    return () => {
      cancelled = true;
      if (environment) {
        if (scene.environment === environment.texture) scene.environment = null;
        environment.dispose();
      }
    };
  }, [gl, scene, image, intensity, onSettled]);

  return null;
}

/** The practice photos' environments, filled as they load (SERVICE_SLUGS order); read by the orb each frame. */
export interface PracticeEnvironments {
  textures: [THREE.Texture | null, THREE.Texture | null, THREE.Texture | null];
}

export function createPracticeEnvironments(): PracticeEnvironments {
  return { textures: [null, null, null] };
}

interface PracticeReflectionsProps {
  /** One image per practice, SERVICE_SLUGS order. */
  images: readonly [string, string, string];
  target: PracticeEnvironments;
}

/** Loads the three practice photos as environments into `target` (never onto the scene). */
export function PracticeReflections({ images, target }: PracticeReflectionsProps): null {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    let cancelled = false;
    const built: (THREE.WebGLRenderTarget | null)[] = [null, null, null];
    const loader = new THREE.TextureLoader();
    images.forEach((image, k) => {
      loader.load(
        image,
        (texture) => {
          if (cancelled) {
            texture.dispose();
            return;
          }
          const environment = buildEnvironment(gl, texture, PRACTICE_CUBE_SIZE);
          built[k] = environment;
          target.textures[k] = environment ? environment.texture : null;
        },
        undefined,
        // A missing photo leaves that body on the circuit's reflection.
        () => undefined,
      );
    });
    return () => {
      cancelled = true;
      for (let k = 0; k < built.length; k++) {
        if (target.textures[k] === built[k]?.texture) target.textures[k] = null;
        built[k]?.dispose();
      }
    };
  }, [gl, images, target]);

  return null;
}

interface VoidBackdropProps {
  fogColor: THREE.ColorRepresentation;
  fogNear: number;
  fogFar: number;
}

export function VoidBackdrop({ fogColor, fogNear, fogFar }: VoidBackdropProps): null {
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const previousBackground = scene.background;
    const previousFog = scene.fog;
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);
    return () => {
      scene.background = previousBackground;
      scene.fog = previousFog;
    };
  }, [scene, fogColor, fogNear, fogFar]);

  return null;
}
