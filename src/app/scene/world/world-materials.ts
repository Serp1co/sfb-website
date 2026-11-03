/* ------------------------------------------------------------------ */
/*  Materials of the world's additive layers: the circuit boards, the  */
/*  droplets and the partner nodes. Colours are linear HDR into the    */
/*  pipeline's scene target (the composite tone-maps and blooms).      */
/* ------------------------------------------------------------------ */

import * as THREE from "three";
import {
  BOARD_FRAGMENT,
  BOARD_VERTEX,
  DROPLET_FRAGMENT,
  DROPLET_VERTEX,
  NODE_FRAGMENT,
  NODE_VERTEX,
} from "./shaders";
import { BOARD_FOG_FAR, BOARD_FOG_NEAR } from "./layers";

/** The scene palette's fog blue (DESIGN.md): distant traces recede into it before going black. */
export const FOG_COLOUR = 0x008cff;

/* -- Power-on (every layer: the GLSL helper is shared) ------------------ */
/** World units per second: the front clears the floor, flight and wall in ~2.5 s from the orb. */
export const POWER_SPEED = 14;
/** Width of the front (world units). */
const POWER_BAND = 4;
const POWER_DEFINES = { POWER_SPEED: glslFloat(POWER_SPEED), POWER_BAND: glslFloat(POWER_BAND) };

/* -- Circuit boards ----------------------------------------------------- */
/** Dim blue traces, cyan-white HDR pulses (they bloom), blue breathing nodes. */
const TRACE_COLOUR = new THREE.Color(0x0a2a6e);
/** Pulses are accents: bright enough to bloom, rare enough not to compete with the copy. */
const PULSE_COLOUR = new THREE.Color(0x9fe8ff).multiplyScalar(2.4);
const NODE_COLOUR = new THREE.Color(0x2f7dff).multiplyScalar(0.8);
const BOARD_DEFINES = {
  ...POWER_DEFINES,
  /** Pulse cycles per second along the phase, and the comet's head position and tail length (phase units). */
  PULSE_RATE: glslFloat(0.55),
  PULSE_HEAD: glslFloat(0.5),
  PULSE_TAIL: glslFloat(0.28),
  /** Texels per pixel over which pulses fade out: they only read near 1:1 (fwidth(uv) x size). */
  PULSE_FADE_START: glslFloat(0.9),
  PULSE_FADE_END: glslFloat(2.4),
  /** Size of the drifting regions that gate the pulses (per texture tile). */
  REGION_SCALE: glslFloat(3),
  /** Noise levels between which a region turns on: only the top of the noise pulses, so sparsely. */
  REGION_FROM: glslFloat(0.52),
  REGION_TO: glslFloat(0.8),
  /**
   * Depth of field: beyond DOF_NEAR (view depth, just behind the orb) the boards sample blurrier
   * mips, up to DOF_MAX_BIAS levels at DOF_FAR (the back wall), so the far circuitry reads as
   * depth instead of detail behind the copy; its pulses fade with it.
   */
  DOF_NEAR: glslFloat(8),
  DOF_FAR: glslFloat(26),
  DOF_MAX_BIAS: glslFloat(2.5),
  /** Patch size of the sparse flight boards (per board). */
  PATCH_SCALE: glslFloat(3.2),
  /**
   * B-channel level from which a node breathes: pads, vias and pins are painted at 1, chip
   * bodies at 40/255 and their outlines at up to 130/255 (circuit-texture.ts), so those stay steady.
   */
  NODE_BREATHE_FROM: glslFloat(0.6),
  /** Extra brightness near the orb (exp(-d / 5)). */
  ORB_GLOW: glslFloat(1.4),
  /** Brightness of the power-on flash at the front: half, so it never whites out the claim (review K3). */
  POWER_FLASH: glslFloat(0.45),
};

function glslFloat(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

/**
 * Additive, but in the OPAQUE render list (transparent: false): three's transmission pass draws
 * only opaque objects into the texture the orb refracts, so this is what puts the circuitry
 * inside the globe. premultipliedAlpha makes AdditiveBlending blendFunc(ONE, ONE), and the
 * shaders output alpha 0, so the target's alpha stays 1 (the orb reads it as its opacity).
 */
function additiveOpaque(material: THREE.ShaderMaterial): THREE.ShaderMaterial {
  material.transparent = false;
  material.blending = THREE.AdditiveBlending;
  material.premultipliedAlpha = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.toneMapped = false;
  material.fog = false;
  return material;
}

export interface BoardMaterialOptions {
  texture: THREE.Texture;
  texels: number;
  gain: number;
  sparse: number;
  sparseSeed: [number, number];
  edge: [number, number];
}

export type BoardUniforms = {
  uCircuit: THREE.IUniform<THREE.Texture>;
  uTexels: THREE.IUniform<number>;
  uTime: THREE.IUniform<number>;
  uPowerT: THREE.IUniform<number>;
  uPowerOrigin: THREE.IUniform<THREE.Vector3>;
  uOrb: THREE.IUniform<THREE.Vector3>;
  uGain: THREE.IUniform<number>;
  uSparse: THREE.IUniform<number>;
  uSparseSeed: THREE.IUniform<THREE.Vector2>;
  uEdge: THREE.IUniform<THREE.Vector2>;
  uUvTransform: THREE.IUniform<THREE.Matrix3>;
  uTraceColour: THREE.IUniform<THREE.Color>;
  uPulseColour: THREE.IUniform<THREE.Color>;
  uNodeColour: THREE.IUniform<THREE.Color>;
  uFogColour: THREE.IUniform<THREE.Color>;
  uFog: THREE.IUniform<THREE.Vector2>;
};

export function createBoardMaterial(options: BoardMaterialOptions): THREE.ShaderMaterial & { uniforms: BoardUniforms } {
  const uniforms: BoardUniforms = {
    uCircuit: { value: options.texture },
    uTexels: { value: options.texels },
    uTime: { value: 0 },
    uPowerT: { value: -1 },
    uPowerOrigin: { value: new THREE.Vector3() },
    uOrb: { value: new THREE.Vector3() },
    uGain: { value: options.gain },
    uSparse: { value: options.sparse },
    uSparseSeed: { value: new THREE.Vector2(...options.sparseSeed) },
    uEdge: { value: new THREE.Vector2(...options.edge) },
    uUvTransform: { value: new THREE.Matrix3() },
    uTraceColour: { value: TRACE_COLOUR },
    uPulseColour: { value: PULSE_COLOUR },
    uNodeColour: { value: NODE_COLOUR },
    uFogColour: { value: new THREE.Color(FOG_COLOUR) },
    uFog: { value: new THREE.Vector2(BOARD_FOG_NEAR, BOARD_FOG_FAR) },
  };
  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: BOARD_VERTEX,
    fragmentShader: BOARD_FRAGMENT,
    defines: BOARD_DEFINES,
    uniforms,
  });
  return Object.assign(additiveOpaque(material), { uniforms });
}

/* -- Droplets ------------------------------------------------------------ */

/** Bare-text rects the droplets keep clear of (the composite also darkens the scene under them). */
export const DROPLET_COPY_RECTS = 8;

/** The depth band the beads fly through (world z), wrapping like the boards. */
export const DROPLET_FAR = -18;
export const DROPLET_NEAR = 4;
const DROPLET_COLOUR = new THREE.Color(0xbfefff);
const DROPLET_DEFINES = {
  ...POWER_DEFINES,
  DROPLET_FAR: glslFloat(DROPLET_FAR),
  DROPLET_SPAN: glslFloat(DROPLET_NEAR - DROPLET_FAR),
  /** Sideways drift (world units) and a slow forward creep (units/s) on top of the scroll travel. */
  DRIFT: glslFloat(0.35),
  DRIFT_Z: glslFloat(0.12),
  /** Depth of field: growth, softness and dimming per unit of relative defocus. */
  DOF_GROW: glslFloat(2),
  DOF_SOFT: glslFloat(0.55),
  DOF_DIM: glslFloat(0.8),
  SOFT_MIN: glslFloat(0.12),
  SOFT_MAX: glslFloat(0.92),
  /** Beads fade in from this view depth (they would otherwise fill the lens). */
  NEAR_FADE_START: glslFloat(0.6),
  NEAR_FADE_END: glslFloat(2.5),
  /** Pointer push lens (NDC): zero at the cursor, peak near PUSH_CORE, gone by ~3 x PUSH_RADIUS. */
  PUSH_CORE: glslFloat(0.05),
  PUSH_RADIUS: glslFloat(0.18),
  /** Bokeh, not rings: a faint glassy body, a soft wide edge a little brighter, a small glint. */
  BEAD_BODY: glslFloat(0.1),
  BEAD_RIM: glslFloat(0.3),
  BEAD_GLINT: glslFloat(0.8),
  /** Copy rects a bead fades under (the most the droplets pass), and the fade's feather (CSS px). */
  MAX_COPY_RECTS: String(DROPLET_COPY_RECTS),
  COPY_FEATHER: glslFloat(24),
};

export type DropletUniforms = {
  uTime: THREE.IUniform<number>;
  uTravel: THREE.IUniform<number>;
  uFocus: THREE.IUniform<number>;
  uSize: THREE.IUniform<number>;
  uAspect: THREE.IUniform<number>;
  uPush: THREE.IUniform<number>;
  uFade: THREE.IUniform<number>;
  uPointer: THREE.IUniform<THREE.Vector2>;
  uColour: THREE.IUniform<THREE.Color>;
  uFogColour: THREE.IUniform<THREE.Color>;
  uFog: THREE.IUniform<THREE.Vector2>;
  /** Canvas box in client CSS px: left, top, width, height. */
  uViewport: THREE.IUniform<THREE.Vector4>;
  /** Visible copy rects in client CSS px (x0, y0, x1, y1), and how many are set. */
  uCopy: THREE.IUniform<THREE.Vector4[]>;
  uCopyCount: THREE.IUniform<number>;
};

/**
 * Beads draw after the orb (transparent list), in front of it: they are not refracted by it and
 * do not need to be. Still additive with alpha 0, so the scene target's alpha stays 1.
 */
export function createDropletMaterial(size: number): THREE.ShaderMaterial & { uniforms: DropletUniforms } {
  const uniforms: DropletUniforms = {
    uTime: { value: 0 },
    uTravel: { value: 0 },
    uFocus: { value: 5 },
    uSize: { value: size },
    uAspect: { value: 1 },
    uPush: { value: 0 },
    uFade: { value: 0 },
    uPointer: { value: new THREE.Vector2(9, 9) },
    uColour: { value: DROPLET_COLOUR },
    uFogColour: { value: new THREE.Color(FOG_COLOUR) },
    uFog: { value: new THREE.Vector2(BOARD_FOG_NEAR, BOARD_FOG_FAR) },
    uViewport: { value: new THREE.Vector4(0, 0, 1, 1) },
    uCopy: { value: Array.from({ length: DROPLET_COPY_RECTS }, () => new THREE.Vector4()) },
    uCopyCount: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: DROPLET_VERTEX,
    fragmentShader: DROPLET_FRAGMENT,
    defines: DROPLET_DEFINES,
    uniforms,
    transparent: true,
    blending: THREE.AdditiveBlending,
    premultipliedAlpha: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });
  return Object.assign(material, { uniforms });
}

/* -- Partner nodes ------------------------------------------------------- */

/**
 * The nodes sit behind the logo bands, where the composite clears the frost around each logo:
 * bright enough (HDR, so they bloom) to read through it while the partners pose is up.
 */
const NODE_TRACE_COLOUR = new THREE.Color(0x1d4fae).multiplyScalar(0.9);
/**
 * A junction's quad: its half size in CSS px (writers size it by this), room for the falloff round
 * the solder dot, which is JUNCTION_DOT_RADIUS_PX in radius: a 5 px point (logo-v3-2.md: 4-6 px).
 */
export const JUNCTION_QUAD_PX = 9;
const JUNCTION_DOT_RADIUS_PX = 2.5;
const NODE_PULSE_COLOUR = new THREE.Color(0x9fe8ff).multiplyScalar(2.6);
const PARTNER_NODE_COLOUR = new THREE.Color(0x4aa3ff).multiplyScalar(2);
/** World units of trace per pulse (the writers keep a reshaping trace's pulses in step with it). */
export const TRACE_PULSE_PERIOD = 1.6;
const NODE_DEFINES = {
  ...POWER_DEFINES,
  /** World units of trace per pulse, and pulses per second, running from the orb out to the nodes. */
  TRACE_PULSE_PERIOD: glslFloat(TRACE_PULSE_PERIOD),
  TRACE_PULSE_RATE: glslFloat(0.7),
  /** A hovered logo's node brightens this much more at full flare. */
  NODE_FLARE: glslFloat(3),
  /** The soft halo around each node, relative to its core. */
  NODE_HALO: glslFloat(0.6),
  /** Extra pulse colour at a growing trace's tip (its first appearance), in pulse units. */
  TRACE_TIP_SPARK: glslFloat(1.6),
  /**
   * Junctions (a round via where traces meet a body): the solder dot's edge as a share of the
   * quad, and the white-hot centre's radius on the same scale.
   */
  JUNCTION_CORE: glslFloat(JUNCTION_DOT_RADIUS_PX / JUNCTION_QUAD_PX),
  JUNCTION_HOT_RADIUS: glslFloat((0.6 * JUNCTION_DOT_RADIUS_PX) / JUNCTION_QUAD_PX),
  /**
   * Its light: the dot in node blue (HDR, so it blooms a little, like the board's vias), the hot
   * centre in pulse white over it, and a soft electric-blue falloff decaying this fast (per quad
   * half size) round it, faint enough that the point stays a point.
   */
  JUNCTION_DOT: glslFloat(0.9),
  JUNCTION_HOT: glslFloat(0.7),
  JUNCTION_GLOW: glslFloat(0.4),
  JUNCTION_FALLOFF: glslFloat(4.5),
};


export type NodeUniforms = {
  uTime: THREE.IUniform<number>;
  /** The nodes' weight and the traces' (the partners pose; the service circuitry's for its own material). */
  uWeight: THREE.IUniform<number>;
  uTraceWeight: THREE.IUniform<number>;
  /** 0..1: the pulses along the traces (they start once a first appearance has drawn the traces in). */
  uPulse: THREE.IUniform<number>;
  uPowerT: THREE.IUniform<number>;
  uPowerOrigin: THREE.IUniform<THREE.Vector3>;
  uTraceColour: THREE.IUniform<THREE.Color>;
  uPulseColour: THREE.IUniform<THREE.Color>;
  uNodeColour: THREE.IUniform<THREE.Color>;
  uFogColour: THREE.IUniform<THREE.Color>;
  uFog: THREE.IUniform<THREE.Vector2>;
};

export function createNodeMaterial(): THREE.ShaderMaterial & { uniforms: NodeUniforms } {
  const uniforms: NodeUniforms = {
    uTime: { value: 0 },
    uWeight: { value: 0 },
    uTraceWeight: { value: 0 },
    uPulse: { value: 1 },
    uPowerT: { value: -1 },
    uPowerOrigin: { value: new THREE.Vector3() },
    uTraceColour: { value: NODE_TRACE_COLOUR },
    uPulseColour: { value: NODE_PULSE_COLOUR },
    uNodeColour: { value: PARTNER_NODE_COLOUR },
    uFogColour: { value: new THREE.Color(FOG_COLOUR) },
    uFog: { value: new THREE.Vector2(BOARD_FOG_NEAR, BOARD_FOG_FAR) },
  };
  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: NODE_VERTEX,
    fragmentShader: NODE_FRAGMENT,
    defines: NODE_DEFINES,
    uniforms,
    // Trace quads wind with their direction; both faces must draw.
    side: THREE.DoubleSide,
  });
  return Object.assign(additiveOpaque(material), { uniforms });
}

/**
 * Seconds since the circuitry powered on (performance.now() clock), or -1 before: before it is
 * scheduled, and before a scheduled start (the power-on waits POWER_DELAY_MS after activation).
 * A one-shot boot effect on the wall clock; while paused the rig latches it complete.
 */
export function powerSeconds(powerStartMs: number, nowSeconds: number): number {
  if (!(powerStartMs > 0)) return -1;
  const seconds = nowSeconds - powerStartMs / 1000;
  return seconds >= 0 ? seconds : -1;
}
