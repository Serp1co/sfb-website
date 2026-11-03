/*
 * One vertex shader for every pipeline pass: a single triangle that covers the target
 * (positions (-1,-1), (3,-1), (-1,3)), so there is no diagonal seam and no wasted quad half.
 * `position` is declared by three's ShaderMaterial prefix; vUv is (0,0) bottom-left.
 */
export const FULLSCREEN_VERT = /* glsl */ `
out vec2 vUv;

void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
