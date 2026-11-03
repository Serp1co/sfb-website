/*
 * Dual-Kawase frost chain (Bjorge 2015), sized in CSS px so the frost is the same at any DPR.
 *
 * - FIRST: sceneRT -> the first level. The reduction ratio there is not 2 (it depends on the DPR
 *   and the tier's sceneRT scale), and a 5-tap Kawase filter skips source texels at ratios above 2,
 *   so bright highlights would alias and flicker. Instead an N x N grid of bilinear taps one source
 *   texel apart (N = ceil(ratio)) covers the whole footprint. It also drops NaN/Inf and clamps the
 *   HDR peak, so one bad pixel from a scene shader can never smear across the frost.
 * - DOWN: the classic 5-tap down filter, corners at half a destination texel times the offset.
 * - UP: the classic 8-tap up filter, taps at half a source texel times the offset.
 */

/** Most taps per axis in the first pass (ratio 6: DPR 1.5 starting at 1/4). */
export const FIRST_PASS_MAX_TAPS = 6;

/** HDR peak kept by the first pass: far above anything the scene lights produce, well below half-float max. */
const HDR_PEAK = "64.0";

export const BLUR_FIRST_FRAG = /* glsl */ `
#define MAX_TAPS ${FIRST_PASS_MAX_TAPS}
in vec2 vUv;
out highp vec4 fragColor;

uniform sampler2D tSrc;
uniform vec2 uSrcTexel;
uniform int uTaps;

// Inf and NaN have every exponent bit set. A bit test, not isnan()/isinf(): Direct3D's compiler
// assumes NaN-free maths and deletes those calls (warning X3577), which would void the guard on
// Windows, where most visitors are.
bool finite3(vec3 c) {
  uvec3 exponent = floatBitsToUint(c) & uvec3(0x7F800000u);
  return all(notEqual(exponent, uvec3(0x7F800000u)));
}

void main() {
  vec3 sum = vec3(0.0);
  float centre = 0.5 * float(uTaps - 1);
  for (int y = 0; y < MAX_TAPS; ++y) {
    if (y >= uTaps) break;
    for (int x = 0; x < MAX_TAPS; ++x) {
      if (x >= uTaps) break;
      vec3 c = textureLod(tSrc, vUv + (vec2(float(x), float(y)) - centre) * uSrcTexel, 0.0).rgb;
      // A select, not mix(): NaN * 0 is still NaN.
      c = finite3(c) ? clamp(c, 0.0, ${HDR_PEAK}) : vec3(0.0);
      sum += c;
    }
  }
  fragColor = vec4(sum / float(uTaps * uTaps), 1.0);
}
`;

export const BLUR_DOWN_FRAG = /* glsl */ `
in vec2 vUv;
out highp vec4 fragColor;

uniform sampler2D tSrc;
uniform vec2 uHalf;

void main() {
  vec3 sum = textureLod(tSrc, vUv, 0.0).rgb * 4.0;
  sum += textureLod(tSrc, vUv - uHalf, 0.0).rgb;
  sum += textureLod(tSrc, vUv + uHalf, 0.0).rgb;
  sum += textureLod(tSrc, vUv + vec2(uHalf.x, -uHalf.y), 0.0).rgb;
  sum += textureLod(tSrc, vUv - vec2(uHalf.x, -uHalf.y), 0.0).rgb;
  fragColor = vec4(sum * 0.125, 1.0);
}
`;

export const BLUR_UP_FRAG = /* glsl */ `
in vec2 vUv;
out highp vec4 fragColor;

uniform sampler2D tSrc;
uniform vec2 uHalf;

void main() {
  vec3 sum = textureLod(tSrc, vUv + vec2(-2.0 * uHalf.x, 0.0), 0.0).rgb;
  sum += textureLod(tSrc, vUv + vec2(2.0 * uHalf.x, 0.0), 0.0).rgb;
  sum += textureLod(tSrc, vUv + vec2(0.0, 2.0 * uHalf.y), 0.0).rgb;
  sum += textureLod(tSrc, vUv + vec2(0.0, -2.0 * uHalf.y), 0.0).rgb;
  sum += textureLod(tSrc, vUv + vec2(-uHalf.x, uHalf.y), 0.0).rgb * 2.0;
  sum += textureLod(tSrc, vUv + vec2(uHalf.x, uHalf.y), 0.0).rgb * 2.0;
  sum += textureLod(tSrc, vUv + vec2(uHalf.x, -uHalf.y), 0.0).rgb * 2.0;
  sum += textureLod(tSrc, vUv + vec2(-uHalf.x, -uHalf.y), 0.0).rgb * 2.0;
  fragColor = vec4(sum / 12.0, 1.0);
}
`;
