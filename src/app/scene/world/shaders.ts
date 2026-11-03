/* ------------------------------------------------------------------ */
/*  GLSL for the world's own materials (GLSL3 ShaderMaterials). No     */
/*  imports, so the strings can be compiled outside the app. Numeric   */
/*  tunables arrive as #defines from the material modules.             */
/*                                                                     */
/*  All three are additive layers that output alpha 0 with            */
/*  premultipliedAlpha (blendFunc ONE, ONE): colour adds, and the      */
/*  render target's alpha stays 1, because the orb's transmission      */
/*  reads that alpha as its own opacity. None uses three's fog: they   */
/*  fade to black themselves (fadeToBlack).                            */
/*                                                                     */
/*  Names avoid three's prefix helpers (luminance, saturate,           */
/*  linearToOutputTexel, sRGBTransfer*, toneMapping).                  */
/* ------------------------------------------------------------------ */

const COMMON = /* glsl */ `
float worldHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float worldNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(worldHash(i), worldHash(i + vec2(1.0, 0.0)), u.x),
             mix(worldHash(i + vec2(0.0, 1.0)), worldHash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Recedes into the fog hue and then to black: an empty board stays black, a trace far away
// turns fog blue as it fades (three's fog would add the fog colour across the whole quad).
vec3 fadeToBlack(vec3 colour, float depth, vec2 fog, vec3 fogColour) {
  float f = smoothstep(fog.x, fog.y, depth);
  return mix(colour, fogColour * max(colour.r, max(colour.g, colour.b)), f) * (1.0 - f);
}

// x: powered (0..1) behind a front spreading from the orb at boot; y: the flash at the front.
vec2 powerOn(vec3 world, vec3 origin, float seconds) {
  if (seconds < 0.0) return vec2(0.0);
  float front = seconds * POWER_SPEED - distance(world, origin);
  float flash = front / POWER_BAND - 0.5;
  return vec2(smoothstep(0.0, POWER_BAND, front), exp(-flash * flash * 5.0));
}
`;

/* -- Circuit boards ------------------------------------------------------ */

export const BOARD_VERTEX = /* glsl */ `
uniform mat3 uUvTransform;
out vec2 vUv;
out vec2 vLocal;
out vec3 vWorld;
out float vDepth;

void main() {
  vLocal = uv;
  vUv = (uUvTransform * vec3(uv, 1.0)).xy;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 view = viewMatrix * world;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`;

export const BOARD_FRAGMENT = /* glsl */ `
uniform sampler2D uCircuit;
uniform float uTexels;
uniform float uTime;
uniform float uPowerT;
uniform vec3 uPowerOrigin;
uniform vec3 uOrb;
uniform float uGain;
uniform float uSparse;
uniform vec2 uSparseSeed;
uniform vec2 uEdge;
uniform vec3 uTraceColour;
uniform vec3 uPulseColour;
uniform vec3 uNodeColour;
uniform vec3 uFogColour;
uniform vec2 uFog;
in vec2 vUv;
in vec2 vLocal;
in vec3 vWorld;
in float vDepth;
out highp vec4 fragColor;
${COMMON}
void main() {
  // Every texture read and derivative stays in uniform control flow (undefined otherwise on ANGLE).
  // Depth of field: the farther behind the orb, the blurrier the mip (a bias, not a branch).
  float lodBias = DOF_MAX_BIAS * smoothstep(DOF_NEAR, DOF_FAR, vDepth);
  vec4 circuit = texture(uCircuit, vUv, lodBias);
  float trace = circuit.r;
  float node = circuit.b;
  float phase = circuit.g / max(circuit.r, 1.0 / 255.0);
  // Texels per pixel as sampled: the bias widens the footprint by 2^bias.
  vec2 density = fwidth(vUv) * uTexels * exp2(lodBias);
  float seamWidth = max(fwidth(circuit.g) - fwidth(circuit.r), 0.0);

  // Pulses: only where a texel is about a pixel (the phase is meaningless once mipmaps average
  // neighbouring traces), never across the sawtooth's wrap (a jump in G at constant R), and in
  // slowly drifting regions so the board pulses in sparse bursts, not everywhere at once.
  float near = 1.0 - smoothstep(PULSE_FADE_START, PULSE_FADE_END, max(density.x, density.y));
  float seam = 1.0 - smoothstep(0.15, 0.4, seamWidth);
  float region = smoothstep(REGION_FROM, REGION_TO, worldNoise(vUv * REGION_SCALE + vec2(uTime * 0.045, -uTime * 0.03)));
  float x = fract(phase - uTime * PULSE_RATE);
  float pulse = smoothstep(PULSE_HEAD - PULSE_TAIL, PULSE_HEAD, x) * (1.0 - smoothstep(PULSE_HEAD, PULSE_HEAD + 0.03, x));
  pulse *= trace * (1.0 - node) * near * seam * region;

  // Pads, vias and pins (full B) breathe, each 24-texel cell on its own phase. Chip bodies and
  // outlines (dim B) glow steadily at the breathing's mean: breathing them per cell would break
  // every chip into a mosaic of those cells.
  float pin = smoothstep(NODE_BREATHE_FROM, 1.0, node);
  float breathe = 0.55 + 0.45 * mix(0.0, sin(uTime * 1.1 + worldHash(floor(vUv * uTexels / 24.0)) * 6.2832), pin);
  float glow = 1.0 + ORB_GLOW * exp(-distance(vWorld, uOrb) / 5.0);
  vec3 colour = (uTraceColour * trace + uNodeColour * node * breathe) * glow + uPulseColour * pulse;

  vec2 power = powerOn(vWorld, uPowerOrigin, uPowerT);
  colour = colour * power.x + uPulseColour * trace * power.y * POWER_FLASH;

  // Sparse patches for the flight boards, and soft edges so no quad outline ever shows.
  float patches = mix(1.0, smoothstep(0.5, 0.62, worldNoise(vLocal * PATCH_SCALE + uSparseSeed)), uSparse);
  vec2 inset = min(vLocal, 1.0 - vLocal);
  float edge = smoothstep(0.0, max(uEdge.x, 1e-4), inset.x) * smoothstep(0.0, max(uEdge.y, 1e-4), inset.y);
  colour *= patches * edge * uGain;

  fragColor = vec4(fadeToBlack(colour, vDepth, uFog, uFogColour), 0.0);
}
`;

/* -- Droplets: instanced camera-facing beads ------------------------------ */

export const DROPLET_VERTEX = /* glsl */ `
in vec3 aBase;
in vec4 aSeed;
uniform float uTime;
uniform float uTravel;
uniform float uFocus;
uniform float uSize;
uniform float uAspect;
uniform float uPush;
uniform float uFade;
uniform vec2 uPointer;
uniform vec4 uViewport;
uniform vec4 uCopy[MAX_COPY_RECTS];
uniform int uCopyCount;
out vec2 vCorner;
out float vAlpha;
out float vSoft;
out float vDepth;

// 1 clear of every copy rect, fading to 0 as the bead's disc reaches one (client CSS px): the
// beads never sparkle behind bare text.
float clearOfCopy(vec2 px, float radius) {
  float keep = 1.0;
  for (int i = 0; i < MAX_COPY_RECTS; i++) {
    if (i >= uCopyCount) break;
    vec4 rect = uCopy[i];
    vec2 gap = max(rect.xy - px, px - rect.zw);
    float outside = length(max(gap, 0.0)) + min(max(gap.x, gap.y), 0.0);
    keep *= smoothstep(0.0, COPY_FEATHER, outside - radius);
  }
  return keep;
}

void main() {
  vec3 p = aBase;
  p.x += sin(uTime * (0.05 + 0.07 * aSeed.x) + aSeed.y * 6.2832) * DRIFT * (0.4 + aSeed.z);
  p.y += cos(uTime * (0.04 + 0.05 * aSeed.z) + aSeed.w * 6.2832) * DRIFT * (0.4 + aSeed.x);
  float along = mod(p.z - DROPLET_FAR + uTravel + uTime * DRIFT_Z * aSeed.w, DROPLET_SPAN);
  p.z = DROPLET_FAR + along;

  vec4 view = viewMatrix * vec4(p, 1.0);
  float depth = max(-view.z, 0.001);
  // Cheap depth of field: away from the focus plane a bead grows, softens and dims.
  float defocus = abs(depth - uFocus) / depth;
  float size = uSize * (0.6 + 0.8 * aSeed.x) * (1.0 + defocus * DOF_GROW);
  vSoft = clamp(SOFT_MIN + defocus * DOF_SOFT, SOFT_MIN, SOFT_MAX);
  float ends = smoothstep(0.0, 2.0, along) * (1.0 - smoothstep(DROPLET_SPAN - 2.0, DROPLET_SPAN, along));
  vAlpha = smoothstep(NEAR_FADE_START, NEAR_FADE_END, depth) * ends * uFade / (1.0 + defocus * defocus * DOF_DIM);
  vDepth = depth;

  // A gentle push away from the pointer in screen space: a smooth lens, zero at the cursor.
  vec4 centre = projectionMatrix * view;
  vec2 d = centre.xy / centre.w - uPointer;
  d.x *= uAspect;
  float r = length(d);
  vec2 push = d / (r + PUSH_CORE) * uPush * exp(-r / PUSH_RADIUS);
  push.x /= uAspect;

  // Where the bead lands on screen (client CSS px) and its radius there.
  vec2 ndc = centre.xy / centre.w + push;
  vec2 px = uViewport.xy + vec2(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5) * uViewport.zw;
  float radiusPx = 0.5 * size * projectionMatrix[1][1] / depth * 0.5 * uViewport.w;
  vAlpha *= clearOfCopy(px, radiusPx);

  view.xy += position.xy * size;
  vCorner = position.xy * 2.0;
  gl_Position = projectionMatrix * view;
  gl_Position.xy += push * gl_Position.w;
}
`;

export const DROPLET_FRAGMENT = /* glsl */ `
uniform vec3 uColour;
uniform vec3 uFogColour;
uniform vec2 uFog;
in vec2 vCorner;
in float vAlpha;
in float vSoft;
in float vDepth;
out highp vec4 fragColor;
${COMMON}
void main() {
  float r = length(vCorner);
  float disc = 1.0 - smoothstep(1.0 - vSoft, 1.0, r);
  // A lens's out-of-focus highlight: the edge is only a little brighter and wide, never a ring.
  float rimWidth = 0.22 + 0.3 * vSoft;
  float rim = (r - (0.8 - 0.25 * vSoft)) / rimWidth;
  vec2 g = vCorner - vec2(-0.32, 0.36);
  float glint = exp(-dot(g, g) * 18.0) * (1.0 - vSoft);
  float light = (BEAD_BODY + BEAD_RIM * exp(-rim * rim)) * disc + BEAD_GLINT * glint;
  fragColor = vec4(fadeToBlack(uColour * light * vAlpha, vDepth, uFog, uFogColour), 0.0);
}
`;

/* -- Partner nodes and their traces (and the service circuitry's) -------- */

export const NODE_VERTEX = /* glsl */ `
in vec4 aData;
in vec2 aLocal;
out vec4 vData;
out vec2 vLocal;
out vec3 vWorld;
out float vDepth;

void main() {
  vData = aData;
  vLocal = aLocal;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 view = viewMatrix * world;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`;

export const NODE_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uWeight;
uniform float uTraceWeight;
uniform float uPulse;
uniform float uPowerT;
uniform vec3 uPowerOrigin;
uniform vec3 uTraceColour;
uniform vec3 uPulseColour;
uniform vec3 uNodeColour;
uniform vec3 uFogColour;
uniform vec2 uFog;
// x: arclength from the orb (traces) or a phase (nodes, junctions); y: 0 trace, 1 node, 2 junction;
// z: flare; w: across the trace (-1..1), or a node's or junction's presence (0..1).
// vLocal: a node's or junction's corner (-1..1); on a trace, x is the growing tip's spark (1 at the tip).
in vec4 vData;
in vec2 vLocal;
in vec3 vWorld;
in float vDepth;
out highp vec4 fragColor;
${COMMON}
void main() {
  float flare = vData.z;
  // The junction's edge width, taken here in uniform control flow (a derivative in a branch is
  // undefined on ANGLE, and FXC warns about it).
  float r = length(vLocal);
  float aa = max(fwidth(r), 1e-4);
  vec3 colour;
  float weight;
  if (vData.y < 0.5) {
    float core = 1.0 - smoothstep(0.35, 1.0, abs(vData.w));
    float x = fract(vData.x / TRACE_PULSE_PERIOD - uTime * TRACE_PULSE_RATE);
    float pulse = smoothstep(0.55, 0.7, x) * (1.0 - smoothstep(0.7, 0.73, x)) * uPulse;
    float spark = vLocal.x * vLocal.x * TRACE_TIP_SPARK;
    colour = (uTraceColour * (1.0 + flare) + uPulseColour * (pulse * (1.0 + 2.0 * flare) + spark)) * core;
    weight = uTraceWeight;
  } else if (vData.y < 1.5) {
    float ring = (r - 0.62) / 0.11;
    float shape = (1.0 - smoothstep(0.2, 0.34, r)) + exp(-ring * ring) + NODE_HALO * exp(-r * 3.2);
    float breathe = 0.6 + 0.4 * sin(uTime * 1.4 + vData.x);
    colour = uNodeColour * shape * breathe * (1.0 + NODE_FLARE * flare) * (1.0 - smoothstep(0.9, 1.0, r));
    weight = uWeight * vData.w;
  } else {
    // A junction where traces meet a body (junctions.md; logo-v3-2.md: "a point, not a block"): a
    // small round via, a solder dot with a white-hot centre in a soft electric-blue falloff, like
    // the circuit texture's vias. The traces run into its centre. The dot's edge is at JUNCTION_CORE
    // of the quad; the falloff fades out before the quad's edge, so no square ever shows.
    float solder = 1.0 - smoothstep(JUNCTION_CORE - aa, JUNCTION_CORE + aa, r);
    float hot = exp(-(r * r) / (JUNCTION_HOT_RADIUS * JUNCTION_HOT_RADIUS));
    float falloff = exp(-r * JUNCTION_FALLOFF) * (1.0 - smoothstep(0.55, 1.0, r));
    float breathe = 0.85 + 0.15 * sin(uTime * 1.1 + vData.x);
    colour = (uNodeColour * (JUNCTION_DOT * solder + JUNCTION_GLOW * falloff) + uPulseColour * (JUNCTION_HOT * hot)) * breathe;
    weight = uWeight * vData.w;
  }
  vec2 power = powerOn(vWorld, uPowerOrigin, uPowerT);
  fragColor = vec4(fadeToBlack(colour * weight * power.x, vDepth, uFog, uFogColour), 0.0);
}
`;
