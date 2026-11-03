/*
 * The direct fallback's copy (a pipeline program failed to link): the scene alone, from the sceneRT
 * to the canvas, tone-mapped and encoded the way three draws it straight to the screen with R3F's
 * defaults (ACES filmic at exposure 1, sRGB output). The canvas has no depth buffer (it is only ever
 * a target for full-screen passes), so even this fallback renders the world into the sceneRT first.
 * Deliberately tiny: it is what still draws when a bigger program would not link. uDim is the
 * narrow-screen dim the CSS overlay has handed over (1 while the overlay draws it, or on wide
 * screens), applied to the encoded colour as the overlay would.
 */

import { GLSL_COMMON } from "./common.glsl";

export const PRESENT_FRAG = /* glsl */ `
in vec2 vUv;
out highp vec4 fragColor;

uniform sampler2D tScene;
uniform float uDim;

${GLSL_COMMON}

void main() {
  fragColor = vec4(srgbEncode(acesFitted(textureLod(tScene, vUv, 0.0).rgb)) * uDim, 1.0);
}
`;
