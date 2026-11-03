/*
 * GLSL helpers shared by the pipeline shaders, and the formatters that inline glass-config
 * values as GLSL literals (so the TS config stays the single source of every number).
 *
 * three prefixes every GLSL3 ShaderMaterial with `#version 300 es`, precision statements and its
 * own helpers: `luminance`, `sRGBTransferEOTF/OETF`, `LinearTransferOETF`, `linearToOutputTexel`
 * (and `saturate`/`toneMapping` when tone mapping is on). Helper names here never collide with
 * them, and nothing here depends on three's chunks being present.
 */

/** A finite number as a GLSL float literal (always with a decimal point or exponent). */
export function glslFloat(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`glslFloat: ${value} is not finite`);
  const text = String(value);
  return /[.eE]/.test(text) ? text : `${text}.0`;
}

export function glslVec2(x: number, y: number): string {
  return `vec2(${glslFloat(x)}, ${glslFloat(y)})`;
}

export function glslVec3(x: number, y: number, z: number): string {
  return `vec3(${glslFloat(x)}, ${glslFloat(y)}, ${glslFloat(z)})`;
}

/** "#rrggbb" -> sRGB-encoded channels 0..1. */
export function hexToSrgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`hexToSrgb: ${hex} is not #rrggbb`);
  const n = Number.parseInt(match[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** sRGB-encoded channel -> linear (the IEC 61966-2-1 curve the GPU helpers also use). */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function hexToLinear(hex: string): [number, number, number] {
  const [r, g, b] = hexToSrgb(hex);
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

/** Helpers for the composite (and anything else that needs them). */
export const GLSL_COMMON = /* glsl */ `
const float K_PI = 3.14159265358979;

// Rec. 709 luminance of a linear colour (named to avoid three's prefixed luminance()).
float lum709(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// Linear -> sRGB-encoded, per channel, for colours in [0, 1].
vec3 srgbEncode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
}

// sRGB-encoded -> linear.
vec3 srgbDecode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, vec3(lessThanEqual(c, vec3(0.04045))));
}

// three r186 ACESFilmicToneMapping at exposure 1, matrices copied verbatim
// (tonemapping_pars_fragment.glsl.js). Kept self-contained: with toneMapped: false three
// declares neither toneMappingExposure nor saturate().
vec3 acesFitted(vec3 c) {
  const mat3 I = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 O = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  c *= 1.0 / 0.6;
  c = I * c;
  vec3 a = c * (c + 0.0245786) - 0.000090537;
  vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081;
  return clamp(O * (a / b), 0.0, 1.0);
}

// Signed distance to a rounded box centred at the origin (negative inside).
float sdRoundBox(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
}

vec2 clampLength(vec2 v, float maxLength) {
  float l = length(v);
  return l > maxLength ? v * (maxLength / l) : v;
}
`;
