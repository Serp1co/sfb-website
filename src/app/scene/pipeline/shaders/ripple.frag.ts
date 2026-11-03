/*
 * One step of the ripple sim (spec 5.2 step 3). State texel: R = height, G = previous height,
 * B = frost wipe. Runs at a fixed 120 steps/s; the CPU decides how many steps a frame takes.
 *
 * - Every read is a texelFetch (nearest, exact texels): the scroll shift moves the field by WHOLE
 *   texels (the fractional rest is carried on the CPU), because resampling by a fraction of a texel
 *   every frame is a low-pass filter that erases the ripples while scrolling. Reads outside the
 *   texture (including the rows a shift brings in) are 0.
 * - Drops and the wipe decay are applied on the first step of a frame only (uniform counts are 0 on
 *   the others). The cursor brush is one capsule per step, along the path since the last step, so
 *   the wake is the same at any refresh rate.
 * - Pools (webgl mode): height is forced to 0 outside the packed surfaces, so each pane is its own
 *   pool and waves reflect off its walls. Open water (css mode): no walls inside the screen.
 * - Sponge: along every wall (a pool's inner edge, and the canvas edge in both modes) a band
 *   absorbs part of the water each step, so a wall returns one clear reflection, a faint second
 *   and nothing after. It scales height and previous height together: a pure amplitude loss
 *   that leaves the wave's speed alone (damping the new height only changes the local dispersion,
 *   and the band's edge then reflects). The rate is per step and the sim runs at a fixed 120
 *   steps/s, so it does not depend on the refresh rate; uSpongeRate carries the texel size, so the
 *   absorption per CSS px a wave travels does not depend on the tier either.
 * - Freeze (the scene clock is stopped): the field only shifts with the scroll, so frozen ripples
 *   stay on their panes; nothing propagates, decays or is injected.
 */

import { MAX_SURFACES } from "../../../glass/contract";
import { APPEAR, RIPPLE } from "../glass-config";
import { GLSL_COMMON, glslFloat } from "./common.glsl";

export const RIPPLE_STEP_FRAG = /* glsl */ `
#define MAX_SURFACES ${MAX_SURFACES}
#define MAX_DROPS ${RIPPLE.maxDrops}
out highp vec4 fragColor;

uniform sampler2D tState;
uniform ivec2 uSize;
uniform vec2 uCss;
uniform int uShift;          // whole texels, + = content moved up the screen (scrolling down)
uniform float uFreeze;       // 1: shift only (the scene clock is stopped)
uniform float uDamping;
uniform float uPools;        // 1 = webgl pools, 0 = open water
uniform float uWipeDecay;    // exp(-dt / refog) on the first step of a frame, 1 otherwise
uniform int uDropCount;
uniform vec4 uDrops[MAX_DROPS];  // x, y (CSS px, top-left), radius, amplitude
uniform float uStrokeOn;     // 1: this step carries a cursor stroke
uniform vec4 uStrokeA;       // segment ax, ay, bx, by (CSS px)
uniform vec4 uStrokeB;       // wave radius, wave amplitude, wipe radius, wipe strength
uniform float uSpongeRate;   // nepers / profile integral * CSS px a long wave travels per step
uniform int uCount;
uniform vec4 uRects[MAX_SURFACES];
uniform vec4 uShape[MAX_SURFACES];
uniform vec4 uState[MAX_SURFACES];

${GLSL_COMMON}

const float HEIGHT_CLAMP = ${glslFloat(RIPPLE.heightClamp)};
const float APPEAR_START_SCALE = ${glslFloat(APPEAR.startScale)};
const float SPONGE_PX = ${glslFloat(RIPPLE.spongePx)};
const float SPONGE_SHARE = ${glslFloat(RIPPLE.spongeShare)};

vec4 fetchState(ivec2 c) {
  c.y -= uShift;
  if (c.x < 0 || c.y < 0 || c.x >= uSize.x || c.y >= uSize.y) return vec4(0.0);
  return texelFetch(tState, c, 0);
}

// Cosine drop profile: 1 at the centre, 0 at the radius, smooth both ends.
float bump(float d, float radius) {
  return d < radius ? 0.5 + 0.5 * cos(K_PI * d / radius) : 0.0;
}

float segmentDistance(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  return length(p - a - ab * t);
}

// The pools, in the same condensing shape the composite draws (a pane's pool grows with it): how
// deep q lies in the water as a share of its sponge band (1 = past the band), and that band's
// width. The deepest pane wins, so a pane inside another adds no inner wall. x < 0: in no pool.
vec2 poolDepth(vec2 q) {
  float depth = -1.0;
  float width = SPONGE_PX;
  for (int i = 0; i < MAX_SURFACES; ++i) {
    if (i >= uCount) break;
    float a = clamp(uState[i].x, 0.0, 1.0);
    if (a <= 0.0) continue;
    vec2 halfSize = uRects[i].zw * mix(APPEAR_START_SCALE, 1.0, a);
    float shortHalf = min(halfSize.x, halfSize.y);
    float radius = mix(shortHalf, min(uShape[i].x, shortHalf), a);
    float inside = -sdRoundBox(q - uRects[i].xy, halfSize, radius);
    if (inside <= 0.0) continue;
    float band = max(min(SPONGE_PX, SPONGE_SHARE * shortHalf), 1.0);
    float share = min(inside / band, 1.0);
    if (share > depth) {
      depth = share;
      width = band;
    }
  }
  return vec2(depth, width);
}

void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 s = fetchState(c);
  if (uFreeze > 0.5) {
    fragColor = vec4(s.rgb, 1.0);
    return;
  }
  float sum = fetchState(c + ivec2(1, 0)).r + fetchState(c - ivec2(1, 0)).r
            + fetchState(c + ivec2(0, 1)).r + fetchState(c - ivec2(0, 1)).r;
  // 2-D leapfrog wave step at C^2 = 0.5 (the stability limit), damped.
  float height = (sum * 0.5 - s.g) * uDamping;
  float previous = s.r;
  float wipe = s.b * uWipeDecay;

  // Texel centre in CSS px, top-left origin (texture v runs bottom-up).
  vec2 texelCss = uCss / vec2(uSize);
  vec2 q = vec2((float(c.x) + 0.5) * texelCss.x, uCss.y - (float(c.y) + 0.5) * texelCss.y);

  // Walls, and the sponge along them. The canvas edge is no wall (the water runs on off screen: a
  // band's sides, a pane cut by the viewport), but reads beyond it are 0 and reflect, so it
  // absorbs too.
  bool wet = true;
  float depth = 1.0;
  float band = SPONGE_PX;
  if (uPools > 0.5) {
    vec2 pool = poolDepth(q);
    wet = pool.x >= 0.0;
    depth = pool.x;
    band = pool.y;
  }
  float edge = min(min(q.x, uCss.x - q.x), min(q.y, uCss.y - q.y));
  float edgeDepth = clamp(edge / SPONGE_PX, 0.0, 1.0);
  if (edgeDepth < depth) {
    depth = edgeDepth;
    band = SPONGE_PX;
  }
  if (wet && depth < 1.0) {
    float toWall = 1.0 - depth;
    float keep = exp(-uSpongeRate * toWall * toWall / band);
    height *= keep;
    previous *= keep;
  }

  // Drops raise the surface at rest (height and previous height together), so they radiate a ring.
  float lift = 0.0;
  for (int i = 0; i < MAX_DROPS; ++i) {
    if (i >= uDropCount) break;
    lift += uDrops[i].w * bump(distance(q, uDrops[i].xy), uDrops[i].z);
  }
  if (uStrokeOn > 0.5) {
    float d = segmentDistance(q, uStrokeA.xy, uStrokeA.zw);
    lift += uStrokeB.y * bump(d, uStrokeB.x);
    wipe = max(wipe, uStrokeB.w * bump(d, uStrokeB.z));
  }
  height = clamp(height + lift, -HEIGHT_CLAMP, HEIGHT_CLAMP);
  previous = clamp(previous + lift, -HEIGHT_CLAMP, HEIGHT_CLAMP);

  if (!wet) {
    height = 0.0;
    previous = 0.0;
  }
  fragColor = vec4(height, previous, clamp(wipe, 0.0, 1.0), 1.0);
}
`;
