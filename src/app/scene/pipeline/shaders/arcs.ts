/*
 * The electric logos' overlay (v3.3, logo-arcs.ts): bolts, sparks and flashes, drawn over the
 * composite onto the canvas with a screen blend (the composite's own light is a screen blend in
 * sRGB-encoded space too). Geometry is in CSS px (top-left origin, the space of client rects);
 * position.z says what a vertex belongs to: 0 a strip (a bolt, a branch, a spark's streak), whose
 * aProf.y runs -1..1 across it, 1 a flash's disc, whose aProf.xy runs -1..1 over it. aProf.z is the
 * light, aProf.w a strip's sheath falloff (CSS px; 0 for LOGO_ARCS.glowPx: the thunder's is wider);
 * aSize the strip's half width and its core's Gaussian half width (CSS px).
 */

import { LOGO_ARCS } from "../glass-config";
import { glslFloat, glslVec3, hexToSrgb } from "./common.glsl";

const vec3Of = (c: readonly [number, number, number]): string => glslVec3(c[0], c[1], c[2]);

export const ARCS_VERT = /* glsl */ `
uniform vec2 uCss;

in vec4 aProf;
in vec2 aSize;
out vec4 vProf;
out vec2 vSize;
out float vKind;

void main() {
  vProf = aProf;
  vSize = aSize;
  vKind = position.z;
  gl_Position = vec4(position.x / uCss.x * 2.0 - 1.0, 1.0 - position.y / uCss.y * 2.0, 0.0, 1.0);
}
`;

export const ARCS_FRAG = /* glsl */ `
in vec4 vProf;
in vec2 vSize;
in float vKind;
out highp vec4 fragColor;

// The scene's fade-in, x 1 / the share of the canvas a CSS overlay dim still lets through.
uniform float uGain;

const vec3 CORE_SRGB = ${vec3Of(hexToSrgb(LOGO_ARCS.coreColor))};
const vec3 GLOW_SRGB = ${vec3Of(hexToSrgb(LOGO_ARCS.glowColor))};
const vec3 FLASH_SRGB = ${vec3Of(hexToSrgb(LOGO_ARCS.flashColor))};
const float CORE_ALPHA = ${glslFloat(LOGO_ARCS.coreAlpha)};
const float GLOW_ALPHA = ${glslFloat(LOGO_ARCS.glowAlpha)};
const float GLOW_PX = ${glslFloat(LOGO_ARCS.glowPx)};

void main() {
  vec3 light;
  if (vKind < 0.5) {
    // A strip: a white-hot Gaussian core in an exponential electric-blue sheath, faded out before
    // the strip's edge so no quad edge ever shows.
    float across = abs(vProf.y) * vSize.x;
    float core = exp(-(across * across) / max(vSize.y * vSize.y, 1e-4));
    float glowPx = vProf.w > 0.0 ? vProf.w : GLOW_PX;
    float sheath = exp(-across / glowPx) * (1.0 - smoothstep(0.6, 1.0, abs(vProf.y)));
    light = CORE_SRGB * (core * CORE_ALPHA) + GLOW_SRGB * (sheath * GLOW_ALPHA);
  } else {
    // A flash: a soft disc, gone before the quad's edge.
    float r = length(vProf.xy);
    light = FLASH_SRGB * (exp(-4.0 * r * r) * (1.0 - smoothstep(0.75, 1.0, r)));
  }
  fragColor = vec4(clamp(light * (vProf.z * uGain), 0.0, 1.0), 1.0);
}
`;
