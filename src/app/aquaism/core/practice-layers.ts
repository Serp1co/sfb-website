/* ------------------------------------------------------------------ */
/*  The Services bodies' practice reflections (owner decision          */
/*  2026-11-02): each of the three bodies reflects its practice's      */
/*  photo. The orb's one marching-cubes mesh is drawn again with three */
/*  materials (shared geometry: no extra CPU), clones of the orb's     */
/*  own with a photo as environment, each blended over the base where  */
/*  its body is: a soft Voronoi split of the three bodies' centres.    */
/*                                                                     */
/*  Stack: the base (the circuit's reflection), then layers 0, 1, 2.   */
/*  Layer k's alpha is its weight over the weights drawn so far, its   */
/*  own included, so over-compositing leaves each layer at exactly its */
/*  weight and the base at 1 - practiceMix.                            */
/* ------------------------------------------------------------------ */

import * as THREE from "three";

/** Seam softness of the three bodies' regions (world units): the photos cross-fade over about this much. */
export const PRACTICE_SEAM = 0.14;
/**
 * The practice photos' environment intensity. The circuit photo is darker (sRGB mean 64 in blue
 * against 96-125 for the practices), so it takes 10; 6 keeps each photo at a little more than
 * parity, so the three bodies read as three practices.
 */
export const PRACTICE_ENV_INTENSITY = 6;

/** Uniforms the practice layers share (uLayer is each layer's own). */
export interface PracticeUniforms {
  /** The three bodies' centres in render (world) space, SERVICE_SLUGS order. */
  uBodyCentres: { value: THREE.Vector3[] };
  /** 0..1: how much of the orb the practice layers cover. */
  uPracticeMix: { value: number };
  uSeam: { value: number };
}

export function createPracticeUniforms(): PracticeUniforms {
  return {
    uBodyCentres: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
    uPracticeMix: { value: 0 },
    uSeam: { value: PRACTICE_SEAM },
  };
}

/** Fragment code of a practice layer: its alpha from the three bodies' soft Voronoi weights (see the header). */
export const PRACTICE_LAYER_PARS = /* glsl */ `
uniform vec3 uBodyCentres[3];
uniform float uPracticeMix;
uniform float uSeam;
uniform int uLayer;
float practiceLayerAlpha() {
  float d0 = distance(vWorldPosition, uBodyCentres[0]);
  float d1 = distance(vWorldPosition, uBodyCentres[1]);
  float d2 = distance(vWorldPosition, uBodyCentres[2]);
  float nearest = min(d0, min(d1, d2));
  float w0 = exp((nearest - d0) / uSeam);
  float w1 = exp((nearest - d1) / uSeam);
  float w2 = exp((nearest - d2) / uSeam);
  float p = uPracticeMix / (w0 + w1 + w2);
  float mine = uLayer == 0 ? w0 : (uLayer == 1 ? w1 : w2);
  float below = (1.0 - uPracticeMix) + p * (uLayer >= 1 ? w0 : 0.0) + p * (uLayer >= 2 ? w1 : 0.0);
  return p * mine / max(below + p * mine, 1e-4);
}
`;

/**
 * A practice layer: a clone of the orb's material, blended over the base (and the layers before
 * it) at the same depth: same geometry, same matrices, so LessEqual passes exactly where the base
 * was drawn. The first layer writes depth, for the frames where the base has dropped out and it
 * draws first. Its environment (the photo) is set later, when it has loaded.
 */
export function createPracticeLayer(base: THREE.MeshPhysicalMaterial, layer: number, shared: PracticeUniforms): THREE.MeshPhysicalMaterial {
  const material = base.clone();
  material.transparent = true;
  material.depthWrite = layer === 0;
  material.envMapIntensity = PRACTICE_ENV_INTENSITY;
  const own = { uLayer: { value: layer } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, own);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <transmission_pars_fragment>", `#include <transmission_pars_fragment>\n${PRACTICE_LAYER_PARS}`)
      // Outside its region nothing of the (costly) transmission is computed.
      .replace("void main() {", "void main() {\n  float layerAlpha = practiceLayerAlpha();\n  if (layerAlpha < 0.004) discard;")
      .replace("#include <opaque_fragment>", "#include <opaque_fragment>\n  gl_FragColor.a *= layerAlpha;");
  };
  // One program for the three layers: only their uniforms differ.
  material.customProgramCacheKey = () => "orb-practice-layer";
  return material;
}
