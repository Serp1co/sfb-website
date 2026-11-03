/*
 * The liquid-glass composite (spec 5.2 step 4): one full-screen pass that draws the scene and
 * every packed glass surface over it. TAPS (dispersion taps) is a #define set per tier.
 *
 * Coordinates: p is CSS px with a top-left origin (the space of client rects and pointer
 * coordinates), from gl_FragCoord via uCss / uRes; back to texture UV with a y flip. Every texture
 * read is textureLod(..., 0.0): none of the targets has mipmaps, and implicit-LOD lookups are
 * undefined inside the non-uniform branches below (the surface loop, the frost stage choice).
 *
 * Colour spaces: textures hold linear HDR. Glass is tone-mapped (acesFitted) to display-linear,
 * then everything that imitates CSS (the per-kind fills and tints, hairline, top highlight, rim, the
 * narrow-screen dim) is composited in sRGB-encoded space, exactly as the browser composites the CSS
 * it replaces, so a pane looks like its CSS pane at handover. The text ceiling and the copy guard
 * are measured in display-linear luminance (what WCAG contrast uses). Grain is added after the encode.
 *
 * Legibility: two ceilings, never the adaptive tint. Inside a pane the text ceiling holds everything
 * where the padding allows text; on the open scene, the guard holds the scene under each bare copy
 * rect (feathered round the rect), so text reads over any orb, board or bloom. Both roll off through
 * one soft shoulder rather than a clamp, and added light only fills the room the shoulder leaves.
 *
 * Energy (owner, 2026-11-02): a pane with one of the orb's bodies inside lights up on its border.
 * The rim and hairline turn electric blue (in the bevel band, where the padding keeps text out), a
 * soft glow spills just outside the edge (light on the scene, so under the copy guard) and a faint
 * one runs inside it toward the body (interior light, so under the text ceiling). With the pointer
 * over it or focus in it, thin arcs crawl round the outline and throw sparks, drawn last but only
 * within a few px of the edge; paused or with reduced motion the arcs stop and a static focus glow
 * stays. Hover (state y) is the pointer only; focus (state w) is keyboard :focus-visible inside, or
 * on touch screens the lit pane being read (nearest the view's centre).
 *
 * Under the CSS glass (uGlassOn 0: phones, and everyone until the WebGL glass takes over) the
 * surfaces are packed too, but the CSS draws the panes, their frost, edge and shadow. The composite
 * then draws only what lies outside every pane: the scene, the energised panes' outer glow, and the
 * electricity folded into a thin band just beyond the edge. Anything drawn on a pane would come back
 * blurred through its frost. While the scene runs the composite also draws the narrow-screen dim
 * the CSS overlay (.scene::after) hands over (uCssDim), after the copy guard where the overlay
 * scaled the canvas, so copy keeps its contrast and the energy light goes on top at full strength;
 * any share the overlay still draws, the light is pre-compensated for (energyLight).
 *
 * The electric logos (v3.2 hero, v3.3 every mark, v3.4 the hero tagline), from their signed
 * distance fields in one atlas (logo-field.ts, tagline-field.ts), all just outside the silhouette
 * (the DOM's glyphs cover the canvas under them). The hero, on the open scene round it in both
 * glass modes, has its electric border on all the time (v3.4): a crisp white outline of about 2 px
 * (its black letters and cobalt S dark against it, in place of the CSS outline that would sit over
 * the canvas) and, with motion, a crawling crackle, with no blue light round it at rest; charged
 * (the pointer over it: logo-energy.ts) an electric-blue glow swells from nothing and the crackle
 * lifts (the world's orb brightens behind it from motion.charge). The tagline, beside it on the
 * scene, has black letters too and the same outline at rest, thinner (the CSS one handed over);
 * hovered, the glow's swell and the crackle (without its sparks) go on top. The partner and
 * customer marks take the charged light and its hairline, over their band's glass, without an
 * outline. The bolts, sparks and the hero's thunder are the overlay's (logo-arcs.ts), drawn after
 * this pass.
 *
 * The water is read once in main (struct Water) but handed to functions as plain fields: ANGLE's
 * HLSL of a struct passed by value into a function called under a branch made FXC warn X4000
 * ("potentially uninitialized variable") although the struct is fully built.
 */

import { GLASS_KINDS, GLASS_TINTS, MAX_SURFACES } from "../../../glass/contract";
import {
  APPEAR,
  BACKGROUND,
  BOOT,
  ELECTRICITY,
  ENERGY,
  FROST,
  GUARD,
  LENS,
  LIGHT,
  LOGO_BORDER,
  LOGO_SLOTS,
  OUTPUT,
  RIPPLE,
  TAGLINE_BORDER,
  TAGLINE_SLOT,
  TINT,
} from "../glass-config";
import { GLSL_COMMON, glslFloat, glslVec2, glslVec3, hexToLinear, hexToSrgb } from "./common.glsl";

const vec3Of = (c: readonly [number, number, number]): string => glslVec3(c[0], c[1], c[2]);

const glintLight = (() => {
  const [x, y, z] = LIGHT.glintLight;
  const n = Math.hypot(x, y, z);
  return glslVec3(x / n, y / n, z / n);
})();

const rimKeyDir = (() => {
  const [x, y] = LIGHT.rimKeyDir;
  const n = Math.hypot(x, y);
  return glslVec2(x / n, y / n);
})();

const sheenAngle = (LIGHT.sheenAngleDeg * Math.PI) / 180;

/** Band surfaces get the clearer discs round their logo cells. */
const BAND_KIND = GLASS_KINDS.indexOf("band");

/** A pill's window is its bead (v3.2): flat, clearer glass round its droplet. */
const PILL_KIND = GLASS_KINDS.indexOf("pill");

export const COMPOSITE_FRAG = /* glsl */ `
#define MAX_SURFACES ${MAX_SURFACES}
#define KIND_COUNT ${GLASS_KINDS.length}
#define TINT_COUNT ${GLASS_TINTS.length}
#define MAX_GUARDS ${GUARD.maxRects}
#define MAX_NODES ${FROST.maxNodeDiscs}
#define BAND_KIND ${BAND_KIND}
#define PILL_KIND ${PILL_KIND}
#define LOGO_SLOTS ${LOGO_SLOTS}
#define TAGLINE_SLOT ${TAGLINE_SLOT}
#ifndef TAPS
#define TAPS 6
#endif
out highp vec4 fragColor;

uniform sampler2D tScene;      // sceneRT, linear HDR
uniform sampler2D tFrostMid;   // middle frost stage (1/4 CSS)
uniform sampler2D tFrost;      // full frost (1/4 CSS)
uniform sampler2D tRipple;     // R height, G previous height, B wipe
uniform vec2 uCss;             // canvas CSS size (R3F's measured size)
uniform vec2 uRes;             // drawing buffer size
uniform vec2 uRippleTexel;     // one sim texel in UV
uniform vec2 uRippleTexelCss;  // one sim texel in CSS px
uniform float uRippleOn;       // 0 when the sim cannot run (no float targets) or is still
uniform float uGlassOn;        // 1 once the WebGL glass has taken over
uniform float uSceneFade;      // scene fade-in (0 -> 1, expo.out)
uniform float uBackgroundDim;  // narrow webgl viewports dim the scene term
uniform float uCssDim;         // css mode: the share of the narrow-screen dim the composite draws (0..1, 1: none), after the guard
uniform float uOverlayGain;    // css mode: 1 / the share of the canvas the CSS overlay dim still lets through (1: none)
uniform float uBloomThreshold;
uniform float uScrollSpeed;    // |scroll velocity|, CSS px/s
uniform float uSlosh;          // -1..1
uniform vec2 uPointer;         // client CSS px
uniform float uPointerOn;      // pointer inside and not touch
uniform vec2 uPress;           // last press, client CSS px
uniform float uPressRingSpeed; // CSS px/s: the ripple sim's wave speed
uniform float uBootT;          // seconds since activation, < 0 before
uniform vec2 uBootOrigin;
uniform float uFrame;          // frame counter (wrapped) for noise; holds while the scene clock is stopped
uniform int uCount;
uniform vec4 uRects[MAX_SURFACES];    // centre x, y, half width, half height
uniform vec4 uShape[MAX_SURFACES];    // radius, kind, tint, elevation
uniform vec4 uState[MAX_SURFACES];    // appear, hover, press, focus
uniform vec4 uWindows[MAX_SURFACES];  // window centre x, y, half width, half height (0 = none)
uniform vec4 uEnergy[MAX_SURFACES];   // energy 0..1, then the body inside: centre x, y, radius (0 = none)
uniform vec2 uElectricity;            // x: the border electricity's clock (scene s, wrapped), y: 1 if its arcs may crawl
uniform vec4 uKindLens[KIND_COUNT];   // bevelFrac, bwMin, bwMax, lensPx
uniform vec4 uKindLook[KIND_COUNT];   // dispersion, kindFrost, baseTint, rimStrength
uniform vec4 uKindMisc[KIND_COUNT];   // rippleGainPx, textInsetPx, 0, 0
uniform vec4 uKindFill[KIND_COUNT];   // the kind's own CSS fill: sRGB-encoded colour, 0
uniform vec4 uKindFillStops[KIND_COUNT]; // its alpha at the gradient start, middle stop, end; 0
uniform vec4 uTints[TINT_COUNT];      // sRGB-encoded colour, alpha (a flat fill replacing the kind's)
uniform vec4 uTintEdge[TINT_COUNT];   // hairline: sRGB-encoded colour, alpha
uniform vec4 uTintRim[TINT_COUNT];    // rim highlight: sRGB-encoded colour, 0
uniform int uGuardCount;
uniform vec4 uGuards[MAX_GUARDS];     // bare copy: centre x, y, half width, half height
uniform int uNodeCount;
uniform vec4 uNodes[MAX_NODES];       // logo cells: centre x, y, disc radius, 0
uniform sampler2D tLogoField;            // the logo atlas: each logo's signed distance (R, its viewBox units), or a blank stand-in
uniform vec4 uLogoRect[LOGO_SLOTS];      // per logo (0 the hero, 1 the tagline, 2-3 marks): its viewBox's box, left, top, width, height (CSS px); width 0 = none
uniform vec4 uLogoMap[LOGO_SLOTS];       // its padded field in the atlas: uv of the first texel's corner, uv size
uniform vec4 uLogoView[LOGO_SLOTS];      // its viewBox width, height, the field's pad (units), the crackle's scale
uniform vec4 uLogoLook[LOGO_SLOTS];      // backing (the hero's and the tagline's outline), rest border (the hero's), charge light, flash (0..1 each)
uniform float uTaglineLinePx;            // the tagline's line height (CSS px): its outline's scale

${GLSL_COMMON}

// Background
const float CA_CORNER_PX = ${glslFloat(BACKGROUND.caCornerPx)};
const float CA_SCROLL_PX = ${glslFloat(BACKGROUND.caScrollPx)};
const float CA_SCROLL_FULL = ${glslFloat(BACKGROUND.caScrollFullSpeed)};
const float BLOOM_KNEE = ${glslFloat(BACKGROUND.bloomKnee)};
const float BLOOM_STRENGTH = ${glslFloat(BACKGROUND.bloomStrength)};
const float VIGNETTE = ${glslFloat(BACKGROUND.vignette)};
const float SHADOW_OFFSET_Y = ${glslFloat(BACKGROUND.shadowOffsetY)};
const float SHADOW_INNER_PX = ${glslFloat(BACKGROUND.shadowInnerPx)};
const float SHADOW_OUTER_PX = ${glslFloat(BACKGROUND.shadowOuterPx)};
const float SHADOW_STRENGTH = ${glslFloat(BACKGROUND.shadowStrength)};
const vec3 SHADOW_SRGB = ${vec3Of(hexToSrgb(BACKGROUND.shadowColor))};
// Copy guard
const float GUARD_CEILING = ${glslFloat(GUARD.ceiling)};
const float GUARD_KNEE = ${glslFloat(GUARD.ceiling * GUARD.kneeFrac)};
const float GUARD_FEATHER_PX = ${glslFloat(GUARD.featherPx)};
// Lens
const float LENS_SLOPE_MAX = ${glslFloat(LENS.slopeMax)};
const float TILT_PX = ${glslFloat(LENS.tiltPx)};
const float TILT_CORE_PX = ${glslFloat(LENS.tiltCorePx)};
const float TILT_FALLOFF_PX = ${glslFloat(LENS.tiltFalloffPx)};
const float SLOSH_PX = ${glslFloat(LENS.sloshPx)};
const float RIPPLE_MAX_PX = ${glslFloat(LENS.rippleMaxPx)};
const float SPREAD_PER_TAP_PX = ${glslFloat(LENS.spreadPerTapPx)};
const float RIPPLE_GAIN_CSS = ${glslFloat(RIPPLE.rippleGainCss)};
const float RIPPLE_CLEAR_GAIN = ${glslFloat(RIPPLE.clearGain)};
const float RIPPLE_CLEAR_MAX = ${glslFloat(RIPPLE.clearMax)};
// Frost
const float WIPE_FROST = ${glslFloat(FROST.wipeFrost)};
const float RIM_FROST = ${glslFloat(FROST.rimFrost)};
const float WINDOW_FROST = ${glslFloat(FROST.windowFrost)};
const float WINDOW_WIPE_FROST = ${glslFloat(FROST.windowWipeFrost)};
const float WINDOW_HOVER_WIPE = ${glslFloat(FROST.windowHoverWipe)};
const float WINDOW_RADIUS_PX = ${glslFloat(FROST.windowRadiusPx)};
const float WINDOW_TINT_SCALE = ${glslFloat(FROST.windowTintScale)};
const float BEAD_FROST = ${glslFloat(FROST.beadFrost)};
const float NODE_FROST = ${glslFloat(FROST.nodeFrost)};
const float NODE_DISC_CORE = ${glslFloat(FROST.nodeDiscCore)};
// Tint
const vec3 NIGHT_LIN = ${vec3Of(hexToLinear(TINT.night))};
const float ADAPT_FLOOR = ${glslFloat(TINT.adaptFloor)};
const float ADAPT_SLOPE = ${glslFloat(TINT.adaptSlope)};
const float ADAPT_MAX = ${glslFloat(TINT.adaptMax)};
// Light
const vec2 SHEEN_DIR = ${glslVec2(Math.sin(sheenAngle), -Math.cos(sheenAngle))};
const float SHEEN_MID = ${glslFloat(LIGHT.sheenMid)};
const float SHEEN_SLOSH = ${glslFloat(LIGHT.sheenSloshShift)};
const float TOP_HIGHLIGHT_PX = ${glslFloat(LIGHT.topHighlightPx)};
const float TOP_HIGHLIGHT_ALPHA = ${glslFloat(LIGHT.topHighlightAlpha)};
const float CURSOR_GLOW = ${glslFloat(LIGHT.cursorGlow)};
const float CURSOR_GLOW_R = ${glslFloat(LIGHT.cursorGlowRadiusPx)};
const float CAUSTIC_GAIN = ${glslFloat(LIGHT.causticGain)};
const float CAUSTIC_ALPHA = ${glslFloat(LIGHT.causticAlpha)};
const vec3 CAUSTIC_SRGB = ${vec3Of(hexToSrgb(LIGHT.causticColor))};
const float GLINT_EXP = ${glslFloat(LIGHT.glintExponent)};
const float GLINT_STRENGTH = ${glslFloat(LIGHT.glintStrength)};
const float GLINT_BEND_FROM = ${glslFloat(LIGHT.glintBendFrom)};
const float GLINT_BEND_TO = ${glslFloat(LIGHT.glintBendTo)};
const vec3 GLINT_L = ${glintLight};
const float RIPPLE_NORMAL_GAIN = ${glslFloat(LIGHT.rippleNormalGain)};
const float TROUGH_DARKEN = ${glslFloat(LIGHT.troughDarken)};
const float PRESS_TAU = ${glslFloat(LIGHT.pressDecayTauS)};
const float PRESS_RING_ALPHA = ${glslFloat(LIGHT.pressRingAlpha)};
const float PRESS_RING_WIDTH_PX = ${glslFloat(LIGHT.pressRingWidthPx)};
const float PRESS_RING_START_PX = ${glslFloat(LIGHT.pressRingStartPx)};
const float PRESS_RING_TRAIL_PX = ${glslFloat(LIGHT.pressRingTrailPx)};
const float PRESS_RING_TRAIL_ALPHA = ${glslFloat(LIGHT.pressRingTrailAlpha)};
// The ripple sim's sponge, so the ring light fades into a wall as the water does
const float SPONGE_PX = ${glslFloat(RIPPLE.spongePx)};
const float SPONGE_SHARE = ${glslFloat(RIPPLE.spongeShare)};
const float SPONGE_NEPERS = ${glslFloat(RIPPLE.spongeNepers)};
const float WIPE_EDGE_GAIN = ${glslFloat(LIGHT.wipeEdgeGain)};
const float WIPE_EDGE_ALPHA = ${glslFloat(LIGHT.wipeEdgeAlpha)};
const float TEXT_CEILING = ${glslFloat(LIGHT.textCeiling)};
const float TEXT_KNEE = ${glslFloat(LIGHT.textCeiling * LIGHT.textKneeFrac)};
const float CEILING_RAMP_PX = ${glslFloat(LIGHT.ceilingRampPx)};
const vec2 RIM_KEY_DIR = ${rimKeyDir};
const float RIM_BASE = ${glslFloat(LIGHT.rimBase)};
const float RIM_KEY = ${glslFloat(LIGHT.rimKey)};
const float RIM_CURSOR_BOOST = ${glslFloat(LIGHT.rimCursorBoost)};
const float RIM_CURSOR_FALLOFF_PX = ${glslFloat(LIGHT.rimCursorFalloffPx)};
const float RIM_HOVER = ${glslFloat(LIGHT.rimHover)};
const float RIM_FOCUS = ${glslFloat(LIGHT.rimFocus)};
const float RIM_SLOSH = ${glslFloat(LIGHT.rimSlosh)};
const float HAIRLINE_PX = ${glslFloat(LIGHT.hairlinePx)};
const float HAIRLINE_HOVER = ${glslFloat(LIGHT.hairlineHover)};
const float CSS_RIPPLE_LIGHT = ${glslFloat(LIGHT.cssRippleLight)};
// Condense and boot
const float APPEAR_START_SCALE = ${glslFloat(APPEAR.startScale)};
const float APPEAR_ALPHA_RAMP = ${glslFloat(APPEAR.alphaRamp)};
const float APPEAR_WOBBLE_PX = ${glslFloat(APPEAR.wobblePx)};
const float APPEAR_WOBBLE_FREQ = ${glslFloat(APPEAR.wobbleFreq)};
const float BOOT_SPEED = ${glslFloat(BOOT.speedPxPerS)};
const float BOOT_BAND_PX = ${glslFloat(BOOT.bandPx)};
// Panel energy
const vec3 ENERGY_GLOW_SRGB = ${vec3Of(hexToSrgb(ENERGY.glowColor))};
const vec3 ENERGY_RIM_SRGB = ${vec3Of(hexToSrgb(ENERGY.rimColor))};
const float HALO_PX = ${glslFloat(ENERGY.haloPx)};
const float HALO_ALPHA = ${glslFloat(ENERGY.haloAlpha)};
const float HALO_FADE_FROM_PX = ${glslFloat(ENERGY.haloFadeFromPx)};
const float HALO_FOCUS = ${glslFloat(ENERGY.haloFocus)};
const float INNER_GLOW_PX = ${glslFloat(ENERGY.innerGlowPx)};
const float INNER_GLOW_ALPHA = ${glslFloat(ENERGY.innerGlowAlpha)};
const float INNER_FAR_SHARE = ${glslFloat(ENERGY.innerFarShare)};
const float INNER_BODY_FALLOFF_PX = ${glslFloat(ENERGY.innerBodyFalloffPx)};
const float RIM_ENERGY = ${glslFloat(ENERGY.rimEnergy)};
const float HAIRLINE_ENERGY_ALPHA = ${glslFloat(ENERGY.hairlineAlpha)};
const float HAIRLINE_FOCUS_ALPHA = ${glslFloat(ENERGY.hairlineFocus)};
// Border electricity
const vec3 ARC_SRGB = ${vec3Of(hexToSrgb(ELECTRICITY.arcColor))};
const vec3 ARC_CORE_SRGB = ${vec3Of(hexToSrgb(ELECTRICITY.arcCoreColor))};
const vec3 SPARK_SRGB = ${vec3Of(hexToSrgb(ELECTRICITY.sparkColor))};
const float ARC_ALPHA = ${glslFloat(ELECTRICITY.arcAlpha)};
const float ARC_GLOW_PX = ${glslFloat(ELECTRICITY.arcGlowPx)};
const float ARC_CORE_ALPHA = ${glslFloat(ELECTRICITY.arcCoreAlpha)};
const float ARC_WIDTH_PX = ${glslFloat(ELECTRICITY.arcWidthPx)};
const float ARC_AMP_PX = ${glslFloat(ELECTRICITY.arcAmpPx)};
const float ARC_WAVE_PX = ${glslFloat(ELECTRICITY.arcWavePx)};
const float ARC_DRIFT_CELLS = ${glslFloat(ELECTRICITY.arcDriftCells)};
const float ARC_RESHAPE_HZ = ${glslFloat(ELECTRICITY.arcReshapeHz)};
const float ARC_SEGMENT_PX = ${glslFloat(ELECTRICITY.arcSegmentPx)};
const float ARC_SEG_FROM = ${glslFloat(ELECTRICITY.arcSegFrom)};
const float ARC_SEG_TO = ${glslFloat(ELECTRICITY.arcSegTo)};
const float ARC_CRAWL_PX_S = ${glslFloat(ELECTRICITY.arcCrawlPxPerS)};
const float ARC_FLICKER_HZ = ${glslFloat(ELECTRICITY.arcFlickerHz)};
const float ARC_FLICKER_FLOOR = ${glslFloat(ELECTRICITY.arcFlickerFloor)};
const float ELECTRIC_FAR_SHARE = ${glslFloat(ELECTRICITY.farShare)};
const float ELECTRIC_POINTER_PX = ${glslFloat(ELECTRICITY.pointerFalloffPx)};
const float ELECTRIC_FOCUS_NEAR = ${glslFloat(ELECTRICITY.focusNear)};
const float ARC_CSS_LIFT_PX = ${glslFloat(ELECTRICITY.cssLiftPx)};
const float ELECTRIC_REACH_IN_PX = ${glslFloat(ELECTRICITY.reachInPx)};
const float ELECTRIC_REACH_OUT_PX = ${glslFloat(ELECTRICITY.reachOutPx)};
const float ELECTRIC_FADE_PX = ${glslFloat(ELECTRICITY.fadePx)};
const float SPARK_CELL_PX = ${glslFloat(ELECTRICITY.sparkCellPx)};
const float SPARK_RATE_HZ = ${glslFloat(ELECTRICITY.sparkRateHz)};
const float SPARK_LIFE = ${glslFloat(ELECTRICITY.sparkLife)};
const float SPARK_CHANCE = ${glslFloat(ELECTRICITY.sparkChance)};
const float SPARK_FAR_SHARE = ${glslFloat(ELECTRICITY.sparkFarShare)};
const float SPARK_RADIUS_PX = ${glslFloat(ELECTRICITY.sparkRadiusPx)};
const float SPARK_GLOW_PX = ${glslFloat(ELECTRICITY.sparkGlowPx)};
const float SPARK_GLOW_ALPHA = ${glslFloat(ELECTRICITY.sparkGlowAlpha)};
const float SPARK_START_PX = ${glslFloat(ELECTRICITY.sparkStartPx)};
const float SPARK_DRIFT_PX = ${glslFloat(ELECTRICITY.sparkDriftPx)};
const float SPARK_ALPHA = ${glslFloat(ELECTRICITY.sparkAlpha)};
// The electric logos
const float LOGO_REACH_PX = ${glslFloat(LOGO_BORDER.reachPx)};
const float LOGO_LINE_PX = ${glslFloat(LOGO_BORDER.linePx)};
const float LOGO_LINE_ALPHA = ${glslFloat(LOGO_BORDER.lineAlpha)};
const float LOGO_REST_CRACKLE = ${glslFloat(LOGO_BORDER.restCrackle)};
const float LOGO_GLOW_GAIN = ${glslFloat(LOGO_BORDER.glowGain)};
const float LOGO_FLASH_GLOW = ${glslFloat(LOGO_BORDER.flashGlow)};
const float LOGO_CRACKLE_AMP = ${glslFloat(LOGO_BORDER.crackleAmp)};
const float LOGO_ORB_FEED = ${glslFloat(LOGO_BORDER.orbFeed)};
const float LOGO_RUN_CYCLE_S = ${glslFloat(LOGO_BORDER.runCycleS)};
const float LOGO_RUN_FROM = ${glslFloat(LOGO_BORDER.runFrom)};
const float LOGO_RUN_TO = ${glslFloat(LOGO_BORDER.runTo)};
const vec3 OUTLINE_SRGB = ${vec3Of(hexToSrgb(LOGO_BORDER.outline.color))};
const float OUTLINE_ALPHA = ${glslFloat(LOGO_BORDER.outline.alpha)};
const float OUTLINE_GLOW_ALPHA = ${glslFloat(LOGO_BORDER.outline.glowAlpha)};
const float OUTLINE_GLOW_WIDTHS = ${glslFloat(LOGO_BORDER.outline.glowWidths)};
const float LOGO_OUTLINE_SHARE = ${glslFloat(LOGO_BORDER.outline.widthShare)};
// The hero tagline
const float TAG_OUTLINE_SHARE = ${glslFloat(TAGLINE_BORDER.outlineShare)};
const float TAG_REACH_PX = ${glslFloat(TAGLINE_BORDER.reachPx)};
const float TAG_GLOW_PX = ${glslFloat(TAGLINE_BORDER.glowPx)};
const float TAG_GLOW_GAIN = ${glslFloat(TAGLINE_BORDER.glowGain)};
// Output
const float GRAIN = ${glslFloat(OUTPUT.grain)};
// Beyond this distance from its box a surface contributes nothing here (shadow reach + AA).
const float SURFACE_REACH_PX = SHADOW_OUTER_PX + SHADOW_OFFSET_Y + APPEAR_WOBBLE_PX + 2.0;

// The water at a pixel, read once in main and shared by the scene and the glass (as plain fields:
// see the header on X4000).
struct Water {
  vec2 slope;      // height per CSS px (y-down)
  float height;    // signed height here
  float wipe;      // frost wipe, 0..1
  vec2 wipeSlope;  // wipe per CSS px: the wiped trail's edge
  float glint;
  float caustic;
};

vec2 toUv(vec2 q) {
  return vec2(q.x, uCss.y - q.y) / uCss;
}

// Interleaved gradient noise (Jimenez 2014), shifted per frame: hides the dispersion tap steps.
float ign(vec2 fragCoord) {
  return fract(52.9829189 * fract(dot(fragCoord, vec2(0.06711056, 0.00583715))));
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Triangular dither in [-1, 1].
float tpdf(vec2 fragCoord, float frame) {
  return hash12(fragCoord + frame * 7.137) + hash12(fragCoord.yx + 19.19 + frame * 3.731) - 1.0;
}

// Soft-knee bloom over the frost-blurred scene.
vec3 bloomOf(vec3 c) {
  float bright = max(c.r, max(c.g, c.b));
  float knee = uBloomThreshold * BLOOM_KNEE;
  float soft = clamp(bright - uBloomThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  return c * (max(soft, bright - uBloomThreshold) / max(bright, 1e-4)) * BLOOM_STRENGTH;
}

// Smooth RGB basis over the dispersion parameter t (red refracts least, blue most). Each channel
// is normalised by its own weight sum, so the taps always sum to white.
vec3 spectrum(float t) {
  return vec3(1.0 - smoothstep(0.0, 0.7, t), 0.5 - 0.5 * cos(2.0 * K_PI * t), smoothstep(0.3, 1.0, t)) + 1e-3;
}

// Alpha of a CSS linear-gradient(145deg, a0 0, a1 60%, a2 100%) over the box (flat when the stops
// match). The gradient line is CSS's: |w sin| + |h cos| long, through the centre. shift slides the
// gradient along its line (the slosh tilting the liquid's surface).
float fillAlpha(vec2 local, vec2 halfSize, vec3 stops, float shift) {
  float len = abs(2.0 * halfSize.x * SHEEN_DIR.x) + abs(2.0 * halfSize.y * SHEEN_DIR.y);
  float t = clamp(dot(local, SHEEN_DIR) / max(len, 1.0) + 0.5 + shift, 0.0, 1.0);
  return t < SHEEN_MID ? mix(stops.x, stops.y, t / SHEEN_MID) : mix(stops.y, stops.z, (t - SHEEN_MID) / (1.0 - SHEEN_MID));
}

// The CSS inner top highlight (box-shadow: inset 0 1px 0): the padding box (inside the 1 px border)
// minus itself moved 1 px down, so a 1 px line under the top edge that thins out round the corners.
float topHighlight(vec2 local, vec2 halfSize, float radius, float pxCss) {
  vec2 padHalf = max(halfSize - HAIRLINE_PX, vec2(0.0));
  float padRadius = max(radius - HAIRLINE_PX, 0.0);
  float inPad = clamp(0.5 - sdRoundBox(local, padHalf, padRadius) / pxCss, 0.0, 1.0);
  float inMoved = clamp(0.5 - sdRoundBox(local - vec2(0.0, TOP_HIGHLIGHT_PX), padHalf, padRadius) / pxCss, 0.0, 1.0);
  return max(inPad - inMoved, 0.0);
}

// How much of the copy guard applies at p: 1 inside any copy rect, easing to 0 GUARD_FEATHER_PX out.
float guardWeight(vec2 p) {
  float w = 0.0;
  for (int i = 0; i < MAX_GUARDS; ++i) {
    if (i >= uGuardCount) break;
    vec4 g = uGuards[i];
    vec2 q = abs(p - g.xy) - g.zw;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    w = max(w, 1.0 - smoothstep(0.0, GUARD_FEATHER_PX, d));
  }
  return w;
}

// Highlight shoulder for both legibility ceilings: identity up to the knee, then an exponential
// roll-off with slope 1 at the knee that approaches the ceiling but never reaches it. Never
// brighter than min(lum, ceiling), so it keeps every contrast a hard clamp keeps, but light above
// the knee keeps its gradients instead of flattening into plateaus at the ceiling.
float shoulder(float lum, float knee, float ceiling) {
  if (lum <= knee) return lum;
  float room = ceiling - knee;
  return knee + room * (1.0 - exp(-(lum - knee) / room));
}

// Scales a linear colour to a new luminance, so the hue is kept.
vec3 withLum(vec3 lin, float lum, float target) {
  return lin * (target / max(lum, 1e-6));
}

// A ceiling over a colour that light was added to (linBase -> lin, both linear), faded in by
// weight: the base goes through the shoulder with its hue kept, and the light fills only the room
// left on top, in its own colour. The luminance is exactly the shoulder of the whole (never above
// the ceiling) and nothing changes below the knee. Scaling base and light together let the white
// light set the hue wherever it was capped: a glint over a bright blue pane turned to grey.
vec3 underCeiling(vec3 linBase, vec3 lin, float weight, float knee, float ceiling) {
  float lumBase = lum709(linBase);
  float lum = lum709(lin);
  float target = mix(lum, shoulder(lum, knee, ceiling), weight);
  float lightLum = lum - lumBase;
  if (lightLum <= 1e-6) return withLum(lin, lum, target);
  float baseTarget = mix(lumBase, shoulder(lumBase, knee, ceiling), weight);
  return withLum(linBase, lumBase, baseTarget) + (lin - linBase) * ((target - baseTarget) / lightLum);
}

// How much of a wave front the water still carries at depth e inside a pane (CSS px from its edge)
// and at p near the canvas edge, after crossing the sim's sponge from the band's inner edge: its
// (1 - depth / width)^2 absorption integrates to (1 - depth / width)^3 of the band's nepers, the
// same at any band width. The front reaches a wall at e^-SPONGE_NEPERS of itself.
float spongeTransmission(float e, float shortHalf, vec2 p) {
  float band = max(min(SPONGE_PX, SPONGE_SHARE * shortHalf), 1.0);
  float edge = min(min(p.x, uCss.x - p.x), min(p.y, uCss.y - p.y));
  float depth = min(clamp(e / band, 0.0, 1.0), clamp(edge / SPONGE_PX, 0.0, 1.0));
  float toWall = 1.0 - depth;
  return exp(-SPONGE_NEPERS * toWall * toWall * toWall);
}

// Logo bands: 1 within the core of any logo cell's disc, easing to 0 at its radius.
float nodeMask(vec2 p) {
  float m = 0.0;
  for (int i = 0; i < MAX_NODES; ++i) {
    if (i >= uNodeCount) break;
    vec4 n = uNodes[i];
    m = max(m, 1.0 - smoothstep(NODE_DISC_CORE * n.z, n.z, distance(p, n.xy)));
  }
  return m;
}

// Light in sRGB-encoded space as a screen blend: it brightens what it lands on and never darkens
// it (a mix toward a coloured light would pull a bright channel down to the light's own).
vec3 screenLight(vec3 enc, vec3 light) {
  return 1.0 - (1.0 - enc) * (1.0 - clamp(light, 0.0, 1.0));
}

// The panel energy's light (sRGB-encoded) over what is drawn: the screen blend. Under the CSS glass
// dims may still scale the value after this to a share t = 1 / gain (the composite's own narrow-
// screen dim, then whatever the CSS overlay still draws), so the light is drawn such that, after
// them, it is the screen blend over the dimmed scene, as the WebGL glass shows it:
// t * (enc + light * (1 / t - enc)) = screen(t * enc, light). gain 1: the plain screen blend. The
// value may exceed 1 by up to the gain: the later dims bring it back (a CSS overlay can only pass
// what the canvas holds, so there the final clamp keeps the old saturation of a near-white core).
vec3 energyLight(vec3 enc, vec3 light, float gain) {
  if (uGlassOn > 0.5) return screenLight(enc, light);
  return enc + clamp(light, 0.0, 1.0) * (gain - enc);
}

// The sRGB transfer both ways over [0, top] (encoded) instead of [0, 1]: css mode's copy guard runs
// before the composite's own dim brings the light back under 1, so light up to 1 / uCssDim must pass
// it unclipped (a clip only where the guard is on would draw a seam round every copy rect). top 1
// is exactly srgbDecode / srgbEncode, so the WebGL glass and the overlay's own dim are unchanged.
vec3 srgbDecodeUpTo(vec3 c, float top) {
  c = clamp(c, 0.0, top);
  return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, vec3(lessThanEqual(c, vec3(0.04045))));
}

vec3 srgbEncodeUpTo(vec3 c, float top) {
  // The linear value that encodes to top; exactly 1 for top 1 (a GPU's divide may not give 1 there).
  c = clamp(c, 0.0, top > 1.0 ? pow((top + 0.055) / 1.055, 2.4) : 1.0);
  return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
}

// i mod n for whole numbers i and n >= 1, exact: the half offset keeps the quotient clear of its
// rounding edge (mod() can return n itself there, a seam in a ring of noise).
float wrapIndex(float i, float n) {
  return i - n * floor((i + 0.5) / n);
}

// Value noise over a ring of n lattice cells (x in cells, any real): periodic, so a pattern closes
// round an outline without a seam. Linear between the lattice values: a jagged path.
float ringNoise(float x, float n, float seed) {
  float i = floor(x);
  return mix(hash12(vec2(wrapIndex(i, n), seed)), hash12(vec2(wrapIndex(i + 1.0, n), seed)), x - i);
}

// The same eased between the lattice values: runs with soft ends.
float ringNoiseSmooth(float x, float n, float seed) {
  float i = floor(x);
  float f = x - i;
  return mix(hash12(vec2(wrapIndex(i, n), seed)), hash12(vec2(wrapIndex(i + 1.0, n), seed)), f * f * (3.0 - 2.0 * f));
}

// Where q (box-local) lies along a rounded box's outline: the arc length of the nearest outline
// point, clockwise on screen from the top edge's left end (x), and the outline's length (y). Meant
// for points near the outline: a corner arc owns the region beyond both inner half sizes.
vec2 outlinePosition(vec2 q, vec2 h, float r) {
  float a = max(h.x - r, 0.0);
  float b = max(h.y - r, 0.0);
  float quarter = 0.5 * K_PI * r;
  float len = 4.0 * (a + b + quarter);
  vec2 aq = abs(q);
  float s;
  if (aq.x > a && aq.y > b) {
    vec2 v = q - vec2(q.x < 0.0 ? -a : a, q.y < 0.0 ? -b : b);
    if (q.x >= 0.0 && q.y < 0.0) s = 2.0 * a + r * atan(v.x, -v.y);
    else if (q.x >= 0.0) s = 2.0 * a + 2.0 * b + quarter + r * atan(v.y, v.x);
    else if (q.y >= 0.0) s = 4.0 * a + 2.0 * b + 2.0 * quarter + r * atan(-v.x, v.y);
    else s = 4.0 * a + 4.0 * b + 3.0 * quarter + r * atan(-v.y, -v.x);
  } else if (aq.x > a || (aq.y <= b && h.x - aq.x < h.y - aq.y)) {
    s = q.x >= 0.0 ? 2.0 * a + quarter + (q.y + b) : 4.0 * a + 2.0 * b + 3.0 * quarter + (b - q.y);
  } else {
    s = q.y < 0.0 ? q.x + a : 2.0 * a + 2.0 * b + 2.0 * quarter + (a - q.x);
  }
  return vec2(s, len);
}

// The border's electricity round a pane's outline: two thin arcs (a near-white core in a soft blue
// sheath), each a jagged path that jumps to a new shape many times a second (the crackle), lit in
// runs that crawl round the outline (the strands in opposite directions) and flicker, plus a few
// sparks flying off the edge. q: box-local, d: signed distance to the outline, CSS px; near: the
// pointer's proximity, 1 at the pointer; reachIn: how far inside it may reach. beyond: the CSS glass
// draws the pane (css mode), so the arcs fold outward to ride at least ARC_CSS_LIFT_PX beyond the
// edge and the caller masks the pane itself off (no inner fade here). sRGB-encoded light for a
// screen blend, at full strength (the caller scales it), faded out toward both ends of its band.
vec3 electricity(vec2 q, vec2 halfSize, float radius, float d, float near, float reachIn, bool beyond, float pxCss) {
  vec2 outline = outlinePosition(q, halfSize, radius);
  float s = outline.x;
  float len = max(outline.y, 1.0);
  float t = uElectricity.x;
  float width = max(ARC_WIDTH_PX, pxCss);
  float nPath = max(floor(len / ARC_WAVE_PX + 0.5), 3.0);
  float nRun = max(floor(len / ARC_SEGMENT_PX + 0.5), 2.0);
  float flickTick = wrapIndex(floor(t * ARC_FLICKER_HZ), 251.0);
  float sheath = 0.0;
  float core = 0.0;
  for (int k = 0; k < 2; ++k) {
    float fk = float(k);
    float seed = wrapIndex(floor(t * ARC_RESHAPE_HZ + 0.5 * fk), 61.0) + 64.0 * fk;
    float x = s * nPath / len + t * ARC_DRIFT_CELLS;
    float off = ARC_AMP_PX * (1.4 * (ringNoise(x, nPath, seed) - 0.5) + 0.6 * (ringNoise(3.0 * x, 3.0 * nPath, seed + 0.5) - 0.5));
    // Folded, the path keeps its jag and its reach (up to ARC_AMP_PX) but leaps off the edge and back.
    if (beyond) off = ARC_CSS_LIFT_PX + abs(off);
    float across = (d - off) / width;
    float xr = (s - t * ARC_CRAWL_PX_S * (k == 0 ? 1.0 : -0.6)) * nRun / len + 0.37 * fk * nRun;
    float run = smoothstep(ARC_SEG_FROM, ARC_SEG_TO, ringNoiseSmooth(xr, nRun, 17.0 + fk));
    float flicker = mix(ARC_FLICKER_FLOOR, 1.0, hash12(vec2(wrapIndex(floor(xr), nRun) + 0.25, flickTick + 0.5 + 257.0 * fk)));
    float lit = run * flicker;
    core += lit * exp(-across * across);
    sheath += lit * exp(-abs(d - off) / ARC_GLOW_PX);
  }
  // Sparks: one slot per cell of outline, re-rolled at its own phase; a lit one flies off the edge.
  float nSpark = max(floor(len / SPARK_CELL_PX + 0.5), 1.0);
  float cellLen = len / nSpark;
  float cell = min(floor(s / cellLen), nSpark - 1.0);
  float cycle = t * SPARK_RATE_HZ + hash12(vec2(cell + 0.5, 3.7));
  float epoch = wrapIndex(floor(cycle), 89.0);
  float life = fract(cycle) / SPARK_LIFE;
  float sparkCore = 0.0;
  float sparkGlow = 0.0;
  if (life < 1.0 && hash12(vec2(cell + 0.25, epoch + 7.0)) < SPARK_CHANCE * mix(SPARK_FAR_SHARE, 1.0, near)) {
    float at = (cell + 0.2 + 0.6 * hash12(vec2(cell + 0.75, epoch + 11.0))) * cellLen;
    vec2 dv = vec2(s - at, d - (SPARK_START_PX + SPARK_DRIFT_PX * life));
    float r = max(SPARK_RADIUS_PX, pxCss);
    float fade = (1.0 - life) * (1.0 - life);
    sparkCore = exp(-dot(dv, dv) / (r * r)) * fade;
    sparkGlow = exp(-length(dv) / SPARK_GLOW_PX) * fade;
  }
  vec3 arcs = ARC_SRGB * (sheath * ARC_ALPHA) + ARC_CORE_SRGB * (core * ARC_CORE_ALPHA);
  vec3 sparks = ARC_SRGB * (sparkGlow * SPARK_GLOW_ALPHA) + SPARK_SRGB * (sparkCore * SPARK_ALPHA);
  float inBand = (beyond ? 1.0 : smoothstep(-reachIn, ELECTRIC_FADE_PX - reachIn, d))
               * (1.0 - smoothstep(ELECTRIC_REACH_OUT_PX - ELECTRIC_FADE_PX, ELECTRIC_REACH_OUT_PX, d));
  return (arcs * mix(ELECTRIC_FAR_SHARE, 1.0, near) + sparks) * inBand;
}

// The scene behind the glass: chromatic aberration, bloom, vignette, fade, shadows, the energised
// panes' outer glow, then the copy guard (sRGB-encoded out). waterSlope, glint, caustic: the water's.
vec3 shadeBackground(vec2 p, vec2 waterSlope, float glint, float caustic, float shadowK, float halo) {
  vec2 q = p;
  if (uGlassOn < 0.5) q += clampLength(-waterSlope * RIPPLE_GAIN_CSS, RIPPLE_MAX_PX);
  vec2 centre = 0.5 * uCss;
  vec2 fromCentre = p - centre;
  float rho = length(fromCentre) / max(length(centre), 1.0);
  float ca = (CA_CORNER_PX + CA_SCROLL_PX * clamp(uScrollSpeed / CA_SCROLL_FULL, 0.0, 1.0)) * rho;
  vec2 caDir = fromCentre / max(length(fromCentre), 1e-3);
  vec3 hdr = vec3(
    textureLod(tScene, toUv(q - caDir * (0.5 * ca)), 0.0).r,
    textureLod(tScene, toUv(q), 0.0).g,
    textureLod(tScene, toUv(q + caDir * (0.5 * ca)), 0.0).b
  );
  hdr += bloomOf(textureLod(tFrost, toUv(q), 0.0).rgb);
  vec3 display = acesFitted(hdr) * ((1.0 - VIGNETTE * rho * rho) * uSceneFade);
  // The narrow-screen dim replaces the CSS rgba(0,0,0,0.4) overlay, which scales the encoded colour.
  vec3 enc = srgbEncode(display) * uBackgroundDim;
  // In css mode the water lies on the scene itself; its light is kept apart for the guard.
  vec3 lit = enc;
  if (uGlassOn < 0.5) {
    lit = mix(lit, CAUSTIC_SRGB, caustic * CAUSTIC_ALPHA * CSS_RIPPLE_LIGHT);
    lit = mix(lit, vec3(1.0), glint * GLINT_STRENGTH * CSS_RIPPLE_LIGHT);
  }
  enc = mix(enc, SHADOW_SRGB, shadowK);
  lit = mix(lit, SHADOW_SRGB, shadowK);
  // An energised pane's outer glow is light on the scene: it lies over the shadow, and under the
  // guard below like the water's light, so it can never cost bare copy its contrast. Under the CSS
  // glass it is drawn for both dims still to come (the composite's own below, any overlay after).
  if (halo > 0.0) lit = energyLight(lit, ENERGY_GLOW_SRGB * (HALO_ALPHA * halo), uOverlayGain / uCssDim);

  // Bare copy: whatever passes behind it, the scene under it stays under the guard ceiling, and
  // the water's light only fills the room the shoulder leaves, as inside a pane. In css mode the
  // light may sit above 1 here, up to what the dim below brings back under it (top).
  float top = 1.0 / uCssDim;
  float guard = uGuardCount > 0 ? guardWeight(p) : 0.0;
  if (guard > 0.0) lit = srgbEncodeUpTo(underCeiling(srgbDecodeUpTo(enc, top), srgbDecodeUpTo(lit, top), guard, GUARD_KNEE, GUARD_CEILING), top);
  // The narrow-screen dim the CSS overlay hands over (css mode; 1 otherwise, the WebGL glass dims
  // the scene term above): here, after the guard, as the overlay scaled the whole canvas, so bare
  // copy keeps exactly the contrast it had, and the light above lands as the plain screen blend.
  return lit * uCssDim;
}

// One glass surface at p (sRGB-encoded out). waterSlope .. caustic: the water's (struct Water's fields).
vec3 shadeGlass(vec2 p, vec4 R, vec4 S, vec4 T, vec4 W, vec4 E, vec2 halfSize, float radius, float d, float pxCss,
                vec2 waterSlope, float height, float wipe, vec2 wipeSlope, float glint, float caustic) {
  int kind = clamp(int(S.y + 0.5), 0, KIND_COUNT - 1);
  int tint = clamp(int(S.z + 0.5), 0, TINT_COUNT - 1);
  vec4 kLens = uKindLens[kind];
  vec4 kLook = uKindLook[kind];
  vec4 kMisc = uKindMisc[kind];
  vec2 local = p - R.xy;
  float shortHalf = min(halfSize.x, halfSize.y);

  // Lens: bevel width, then the analytic outward normal of the box rounded with r_lens = max(r, bw)
  // (the true radius would put a mitred crease across the bevel at each corner).
  float bw = min(clamp(kLens.x * 2.0 * shortHalf, kLens.y, kLens.z), shortHalf);
  float rLens = clamp(max(radius, bw), 0.0, shortHalf);
  vec2 qL = abs(local) - halfSize + rLens;
  float e = max(-(min(max(qL.x, qL.y), 0.0) + length(max(qL, 0.0)) - rLens), 0.0);
  vec2 side = vec2(local.x < 0.0 ? -1.0 : 1.0, local.y < 0.0 ? -1.0 : 1.0);
  vec2 nOut = side * ((qL.x > 0.0 && qL.y > 0.0) ? normalize(qL) : (qL.x > qL.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0)));
  float slope = e < bw ? min((bw - e) / sqrt(max(e * (2.0 * bw - e), 1e-3)), LENS_SLOPE_MAX) : 0.0;

  // Clear window onto the live body (scaled with the condensing surface).
  float windowMask = 0.0;
  if (W.z > 0.0) {
    float scale = halfSize.x / max(R.z, 1e-3);
    vec2 wHalf = W.zw * scale;
    float dw = sdRoundBox(p - (R.xy + (W.xy - R.xy) * scale), wHalf, min(WINDOW_RADIUS_PX, min(wHalf.x, wHalf.y)));
    windowMask = clamp(0.5 - dw / pxCss, 0.0, 1.0);
  }
  // A pill's bead window (v3.2) is flat glass: a pill is bevel through its whole height, and the
  // bevel's lens stretched the droplet behind the bead into an upright lens shape, not a ball.
  float bead = kind == PILL_KIND ? windowMask : 0.0;

  // Refraction offset: samples inward at the rim (content splays outward), ripples, slosh, tilt.
  vec2 off = -nOut * (slope * kLens.w * (1.0 - bead));
  off += clampLength(-waterSlope * kMisc.x, RIPPLE_MAX_PX);
  off += vec2(0.0, uSlosh * SLOSH_PX);
  vec2 toPointer = p - uPointer;
  float pointerDist = length(toPointer);
  off += toPointer / (pointerDist + TILT_CORE_PX) * (TILT_PX * T.y * uPointerOn * exp(-pointerDist / TILT_FALLOFF_PX));

  float rimMask = pow(1.0 - clamp(e / bw, 0.0, 1.0), 1.5);

  // Frost: choose the blur stage rather than crossfading sharp into blurred.
  float frostAmt = kLook.y * mix(1.0, WIPE_FROST, wipe) * mix(1.0, RIM_FROST, rimMask);
  // Logo bands: a clearer disc round each logo cell, so its lit circuit node shows behind it.
  if (kind == BAND_KIND && uNodeCount > 0) frostAmt = mix(frostAmt, min(frostAmt, NODE_FROST), nodeMask(p));
  // A hovered window counts as wiped: the swell behind it stays sharp for the whole hover.
  float windowWipe = max(wipe, WINDOW_HOVER_WIPE * T.y);
  frostAmt = mix(frostAmt, mix(WINDOW_FROST, BEAD_FROST, bead) * mix(1.0, WINDOW_WIPE_FROST, windowWipe), windowMask);
  // Crests and troughs sharpen the view through them: water reads through clarity, not only light.
  frostAmt *= 1.0 - clamp(abs(height) * RIPPLE_CLEAR_GAIN, 0.0, RIPPLE_CLEAR_MAX);
  bool firstStage = frostAmt < 0.5;
  float stageMix = firstStage ? smoothstep(0.0, 0.5, frostAmt) : smoothstep(0.5, 1.0, frostAmt);

  // Spectral dispersion along the refraction, concentrated at the rim, spread clamped in px,
  // tap positions jittered per pixel and frame.
  float offLen = length(off);
  vec2 dir = offLen > 1e-4 ? off / offLen : vec2(0.0);
  float spread = min(kLook.x * rimMask * offLen, SPREAD_PER_TAP_PX * float(TAPS));
  float jitter = ign(gl_FragCoord.xy + 5.588238 * uFrame);
  vec3 sum = vec3(0.0);
  vec3 weights = vec3(0.0);
  vec3 blurSum = vec3(0.0);
  for (int k = 0; k < TAPS; ++k) {
    float t = (float(k) + jitter) / float(TAPS);
    vec2 uv = toUv(p + off + dir * ((t - 0.5) * spread));
    vec3 lower;
    vec3 upper;
    if (firstStage) {
      lower = textureLod(tScene, uv, 0.0).rgb;
      upper = textureLod(tFrostMid, uv, 0.0).rgb;
    } else {
      lower = textureLod(tFrostMid, uv, 0.0).rgb;
      upper = textureLod(tFrost, uv, 0.0).rgb;
    }
    vec3 wt = spectrum(t);
    sum += mix(lower, upper, stageMix) * wt;
    weights += wt;
    blurSum += upper;
  }
  vec3 glassHdr = sum / weights;
  vec3 frostSample = blurSum / float(TAPS);

  // Tone-map, then the adaptive night tint (display-linear: its strength reads the same over the
  // bright orb and over black).
  vec3 display = acesFitted(glassHdr) * uSceneFade;
  float lumD = lum709(acesFitted(frostSample)) * uSceneFade;
  float tintA = clamp(kLook.z + ADAPT_SLOPE * max(lumD - ADAPT_FLOOR, 0.0), kLook.z, ADAPT_MAX);
  display = mix(display, NIGHT_LIN, tintA * mix(1.0, WINDOW_TINT_SCALE, windowMask));

  // The CSS fill this pane replaces, in sRGB space like the CSS rgba (not inside a window): the
  // kind's own fill (the panel sheen, the ghost button's white, the pill's blue) or, for a tinted
  // surface, its tint instead, as the CSS tint classes replace the background. The slosh slides the
  // sheen like a tilting liquid surface.
  vec3 enc = srgbEncode(display);
  float fill = 1.0 - windowMask;
  vec3 fillRgb = uKindFill[kind].rgb;
  vec3 fillStops = uKindFillStops[kind].xyz;
  if (tint > 0) {
    fillRgb = uTints[tint].rgb;
    fillStops = vec3(uTints[tint].a);
  }
  enc = mix(enc, fillRgb, fillAlpha(local, halfSize, fillStops, uSlosh * SHEEN_SLOSH) * fill);

  // Interior light: cursor glow, caustics, glints, the press ring, the wiped trail's meniscus. All
  // of it before the text ceiling, so none of it can cost text contrast. The unlit pane is kept:
  // the ceiling gives the light only the room left above it.
  vec3 linBase = srgbDecode(enc);
  enc = mix(enc, vec3(1.0), CURSOR_GLOW * T.y * uPointerOn * exp(-dot(toPointer, toPointer) / (2.0 * CURSOR_GLOW_R * CURSOR_GLOW_R)));
  enc = mix(enc, CAUSTIC_SRGB, caustic * CAUSTIC_ALPHA);
  enc = mix(enc, vec3(1.0), glint * GLINT_STRENGTH);
  if (T.z > 0.001) {
    // The press's age, read back from its exponential decay, puts the light on the sim's wave
    // front: constant speed, a leading and a trailing crest, a slow fade (water, not an ink ripple).
    // It draws the outgoing front only, and fades into the sponge with the water's own front: the
    // one reflection a wall returns shows in the water's light, never as a ring of this one.
    float age = -PRESS_TAU * log(max(T.z, 1e-3));
    float ringR = PRESS_RING_START_PX + uPressRingSpeed * age;
    float r = distance(p, uPress);
    float lead = (r - ringR) / PRESS_RING_WIDTH_PX;
    float trail = (r - ringR + PRESS_RING_TRAIL_PX) / PRESS_RING_WIDTH_PX;
    float ring = (exp(-lead * lead) + PRESS_RING_TRAIL_ALPHA * exp(-trail * trail)) * spongeTransmission(-d, shortHalf, p);
    enc = mix(enc, vec3(1.0), clamp(ring * sqrt(T.z) * PRESS_RING_ALPHA, 0.0, 1.0));
  }
  enc = mix(enc, vec3(1.0), clamp(length(wipeSlope) * WIPE_EDGE_GAIN, 0.0, 1.0) * WIPE_EDGE_ALPHA);
  // A body inside: a faint electric-blue glow from the edge inward, strongest along the part of the
  // edge nearest the body. Interior light, so the text ceiling below holds it like the rest.
  float energy = clamp(E.x, 0.0, 1.0);
  if (energy > 0.0) {
    float toBody = E.w > 0.0 ? exp(-max(distance(p, E.yz) - E.w, 0.0) / INNER_BODY_FALLOFF_PX) : 0.0;
    float inner = energy * INNER_GLOW_ALPHA * exp(-max(-d, 0.0) / INNER_GLOW_PX) * mix(INNER_FAR_SHARE, 1.0, toBody);
    enc = screenLight(enc, ENERGY_GLOW_SRGB * inner);
  }

  // Text ceiling, after all interior light: display-linear luminance stays under TEXT_CEILING
  // wherever the padding allows text, ramping in just outside it. Through the shoulder, a crest, a
  // glint or the sharp scene a wipe reveals over a bright pane keeps a gradient instead of a flat
  // grey plateau. Windows carry no text.
  float eTrue = -d;
  float inset = min(bw, kMisc.y);
  float ceilW = smoothstep(inset - CEILING_RAMP_PX, inset, eTrue) * (1.0 - windowMask);
  enc = srgbEncode(underCeiling(linBase, srgbDecode(enc), ceilW, TEXT_KNEE, TEXT_CEILING));

  // Troughs darken. Darkening never costs contrast, so it comes after the ceiling, where it still
  // shows over the capped orb.
  enc *= 1.0 - TROUGH_DARKEN * clamp(-height, 0.0, 1.0);

  // Rim and hairline, display space, after the ceiling (the padding keeps text out of the band).
  // A tinted surface carries its tint on these edges. The slosh brightens the leading rim and dims
  // the trailing one: a meniscus on the crisp edges, which read through any frost.
  float cursorLight = uPointerOn * exp(-pointerDist / RIM_CURSOR_FALLOFF_PX);
  float lift = (1.0 + RIM_CURSOR_BOOST * cursorLight) * (1.0 + RIM_HOVER * T.y + RIM_FOCUS * T.w);
  // With a body inside, both edges turn electric blue and brighten (the hairline more with hover or
  // focus: the static focus cue, which the arcs in main add to while they may move).
  float rim = pow(rimMask, 3.0) * (RIM_BASE + RIM_KEY * max(dot(nOut, RIM_KEY_DIR), 0.0)) * kLook.w * lift;
  rim *= (1.0 + RIM_SLOSH * uSlosh * nOut.y) * (1.0 + RIM_ENERGY * energy);
  enc = mix(enc, mix(uTintRim[tint].rgb, ENERGY_RIM_SRGB, energy), clamp(rim, 0.0, 1.0));
  float hairline = 1.0 - smoothstep(HAIRLINE_PX - pxCss, HAIRLINE_PX, eTrue);
  vec4 edge = uTintEdge[tint];
  float edgeAlpha = edge.a * (1.0 + HAIRLINE_HOVER * T.y + RIM_FOCUS * T.w);
  edgeAlpha = mix(edgeAlpha, HAIRLINE_ENERGY_ALPHA, energy) + HAIRLINE_FOCUS_ALPHA * energy * clamp(max(T.y, T.w), 0.0, 1.0);
  enc = mix(enc, mix(edge.rgb, ENERGY_GLOW_SRGB, energy), clamp(hairline * edgeAlpha, 0.0, 1.0));
  enc = mix(enc, vec3(1.0), topHighlight(local, halfSize, radius, pxCss) * TOP_HIGHLIGHT_ALPHA);
  return enc;
}

// A logo's signed distance at u (its viewBox units, y down), in units, negative inside a glyph, from
// its slot of the atlas (map: the slot's uv corner and size; view: viewBox size, pad). Past the
// slot's padded box it adds the distance to the box: an upper bound that keeps growing smoothly, so
// the halo's tail fades out instead of ending on the box's edge. The clamp keeps every read half a
// texel inside the slot, so the filter never reaches a neighbour. texel: one texel, in units.
float logoDistance(vec2 u, vec4 map, vec4 view, vec2 texel) {
  vec2 c = clamp(u, 0.5 * texel - view.z, view.xy + view.z - 0.5 * texel);
  vec2 s = (c + view.z) / (view.xy + 2.0 * view.z);
  return textureLod(tLogoField, map.xy + s * map.zw, 0.0).r + length(u - c);
}

// Value noise on a square lattice (x in cells), seeded: ringNoise for an outline with no perimeter
// to run round. Linear between the lattice values (a jagged path) or eased (runs with soft ends).
// A seed moves the lattice by whole tens of cells, past the logo's extent, so seeds never repeat.
float latticeNoise(vec2 x, float seed, bool eased) {
  vec2 i = floor(x) + vec2(17.0, 31.0) * seed;
  vec2 f = fract(x);
  if (eased) f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float e = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, e, f.x), f.y);
}

// The lockup's outline at distance outside (CSS px past the glyphs' edge) for a line widthPx wide:
// the line at full light out to its width, ending over one device px (crisp, as the hairlines end),
// then the glow it gives off, from about half its light, falling off over a few of its widths. The
// larger of the two, so the line's edge stays a step, not a sum. The light's share, 0..1.
float brandOutline(float outside, float widthPx, float pxCss) {
  float line = OUTLINE_ALPHA * (1.0 - smoothstep(widthPx, widthPx + pxCss, outside));
  float glow = OUTLINE_GLOW_ALPHA * exp(-max(outside - widthPx, 0.0) / (OUTLINE_GLOW_WIDTHS * widthPx));
  return max(line, glow);
}

// The crackle along a logo's outline: electricity() for a free shape. The same two strands of
// arcs, folded to ride just outside the silhouette (the glyphs sit over the canvas), on a 2D
// lattice in CSS px instead of round a perimeter, at LOGO_CRACKLE_AMP of the panels' wander: a
// fine hum on the edge (the bolts are the overlay's). The lit runs crawl along the outline's local
// tangent (the field's normal turned a quarter), each for one LOGO_RUN_CYCLE_S, fading in and out
// (two cycles half a period apart cross-fade), and the sparks take one slot per lattice cell of
// the nearest outline point. q: logo-local CSS px, d: signed distance (CSS px), n: the outward
// normal, near: the pointer's proximity, scale: the lattice's share of the panels' (a small mark's
// is finer), withSparks: with the sparks (the tagline's border has none, owner 2026-11-02 evening:
// "without the sparkles"; a spark is a point that glints, the runs crawl). sRGB-encoded light at
// full strength.
vec3 logoElectricity(vec2 q, float d, vec2 n, float near, float pxCss, float scale, bool withSparks) {
  float t = uElectricity.x;
  float width = max(ARC_WIDTH_PX, pxCss);
  vec2 tangent = vec2(-n.y, n.x);
  float flickTick = wrapIndex(floor(t * ARC_FLICKER_HZ), 251.0);
  float sheath = 0.0;
  float core = 0.0;
  for (int k = 0; k < 2; ++k) {
    float fk = float(k);
    float seed = wrapIndex(floor(t * ARC_RESHAPE_HZ + 0.5 * fk), 61.0) + 64.0 * fk;
    vec2 x = q / (ARC_WAVE_PX * scale);
    float off = ARC_AMP_PX * LOGO_CRACKLE_AMP * scale * (1.4 * (latticeNoise(x, seed, false) - 0.5) + 0.6 * (latticeNoise(3.0 * x, seed + 0.5, false) - 0.5));
    off = ARC_CSS_LIFT_PX + abs(off);
    float across = (d - off) / width;
    float travel = ARC_CRAWL_PX_S * LOGO_RUN_CYCLE_S * scale * (k == 0 ? 1.0 : -0.6);
    float lit = 0.0;
    for (int j = 0; j < 2; ++j) {
      float phase = t / LOGO_RUN_CYCLE_S + 0.5 * float(j);
      float f = fract(phase);
      float cycle = wrapIndex(floor(phase), 97.0);
      vec2 xr = (q - tangent * (travel * (f - 0.5))) / (ARC_SEGMENT_PX * scale);
      float run = smoothstep(LOGO_RUN_FROM, LOGO_RUN_TO, latticeNoise(xr, 131.0 + 2.0 * cycle + fk, true));
      float flicker = mix(ARC_FLICKER_FLOOR, 1.0, hash12(floor(xr) + vec2(0.25 + 5.0 * cycle, flickTick + 0.5 + 257.0 * fk)));
      lit += (1.0 - abs(2.0 * f - 1.0)) * run * flicker;
    }
    core += lit * exp(-across * across);
    sheath += lit * exp(-abs(d - off) / ARC_GLOW_PX);
  }
  // Sparks: one slot per lattice cell of the nearest outline point, re-rolled at its own phase; a
  // lit one sits where the outline passes its random point and flies off the edge as it fades.
  float sparkCore = 0.0;
  float sparkGlow = 0.0;
  if (withSparks) {
    vec2 foot = q - n * d;
    float sparkCellPx = SPARK_CELL_PX * scale;
    vec2 cell = floor(foot / sparkCellPx);
    float sparkCycle = t * SPARK_RATE_HZ + hash12(cell + 3.7);
    float epoch = wrapIndex(floor(sparkCycle), 89.0);
    float life = fract(sparkCycle) / SPARK_LIFE;
    if (life < 1.0 && hash12(cell + vec2(0.25, epoch + 7.0)) < SPARK_CHANCE * mix(SPARK_FAR_SHARE, 1.0, near)) {
      vec2 at = (cell + 0.2 + 0.6 * vec2(hash12(cell + vec2(0.75, epoch + 11.0)), hash12(cell + vec2(epoch + 13.0, 0.5)))) * sparkCellPx;
      vec2 dv = vec2(dot(at - foot, tangent), d - (SPARK_START_PX + SPARK_DRIFT_PX * life));
      float r = max(SPARK_RADIUS_PX, pxCss);
      float fade = (1.0 - life) * (1.0 - life);
      sparkCore = exp(-dot(dv, dv) / (r * r)) * fade;
      sparkGlow = exp(-length(dv) / SPARK_GLOW_PX) * fade;
    }
  }
  vec3 arcs = ARC_SRGB * (sheath * ARC_ALPHA) + ARC_CORE_SRGB * (core * ARC_CORE_ALPHA);
  vec3 sparks = ARC_SRGB * (sparkGlow * SPARK_GLOW_ALPHA) + SPARK_SRGB * (sparkCore * SPARK_ALPHA);
  float inBand = 1.0 - smoothstep(ELECTRIC_REACH_OUT_PX - ELECTRIC_FADE_PX, ELECTRIC_REACH_OUT_PX, d);
  return (arcs * mix(ELECTRIC_FAR_SHARE, 1.0, near) + sparks) * inBand;
}

// Logo i's outline over what is drawn round it (sRGB-encoded in and out). Slots: 0 the hero,
// TAGLINE_SLOT the hero's tagline, the rest the charging marks. The hero's border is on at rest
// (its rest level is its fade-in, v3.4): the crisp white outline of about 2 px (the black letters
// and the cobalt S dark against it) and, while motion is allowed, the crawling crackle; there is no
// blue light round it at rest (owner, 2026-11-02 evening). A charge (the pointer over it; the
// world's orb brightens behind it from motion.charge) swells the electric-blue glow from nothing
// and lifts the crackle, and a bigger discharge's flash lifts the glow, never the thunder (a click
// or a tap: the overlay's bolts, no flash, owner 2026-11-02 evening). All of them are light in the
// screen blend, so their order does not change the sum. The tagline: the same outline at rest,
// thinner (its black letters dark against it), and hovered the glow's swell and the crackle without
// its sparks on top. A mark: the charged light and its hairline only (no outline). Drawn after the
// composite's own dim (only an overlay still drawn is compensated for).
// open: the share of the pixel no pane covers.
vec3 shadeLogo(vec3 enc, vec2 p, float pxCss, float open, int i) {
  vec4 R = uLogoRect[i];
  vec4 M = uLogoMap[i];
  vec4 V = uLogoView[i];
  vec4 L = uLogoLook[i];
  bool text = i == TAGLINE_SLOT;
  vec2 q = p - R.xy;
  // The image keeps its viewBox's proportions: its width alone sets the scale (the box's height is
  // rounded to whole px by the layout measure).
  float unitPx = max(R.z / V.x, 1e-3);
  vec2 u = q / unitPx;
  vec2 texel = (V.xy + 2.0 * V.z) / max(M.zw * vec2(textureSize(tLogoField, 0)), vec2(1.0));
  vec2 hx = vec2(texel.x, 0.0);
  vec2 hy = vec2(0.0, texel.y);
  float d = logoDistance(u, M, V, texel) * unitPx;
  vec2 g = vec2(logoDistance(u + hx, M, V, texel) - logoDistance(u - hx, M, V, texel), logoDistance(u + hy, M, V, texel) - logoDistance(u - hy, M, V, texel)) / (2.0 * texel);
  vec2 n = g / max(length(g), 1e-3);
  float fadeIn = open * uSceneFade;
  float rest = L.y * fadeIn;
  float light = L.z * fadeIn;
  float flash = L.w * fadeIn;
  float halo = L.x * open;
  // The tagline has no rest border of its own: at rest it is the outline only.
  float lit = (text ? 0.0 : rest) + light + flash;
  if (i == 0 && LOGO_ORB_FEED > 0.0 && light > 0.0) {
    // Charged, the scene behind brightens within the reach (it feeds the logo; 0 while the world's orb does it).
    vec2 fromBox = max(R.xy - p, p - R.xy - R.zw);
    enc *= 1.0 + LOGO_ORB_FEED * light * (1.0 - smoothstep(0.0, LOGO_REACH_PX, max(max(fromBox.x, fromBox.y), 0.0)));
  }
  float outside = max(d, 0.0);
  float reach = text ? TAG_REACH_PX : LOGO_REACH_PX;
  float swell = light + LOGO_FLASH_GLOW * flash;
  if (swell > 0.0) {
    float glow = (text ? TAG_GLOW_GAIN : LOGO_GLOW_GAIN) * HALO_ALPHA * exp(-outside / (text ? TAG_GLOW_PX : HALO_PX));
    glow *= (1.0 - smoothstep(min(HALO_FADE_FROM_PX, 0.5 * reach), reach, outside)) * swell;
    enc = energyLight(enc, ENERGY_GLOW_SRGB * glow, uOverlayGain);
  }
  if (i <= TAGLINE_SLOT && halo > 0.0) {
    // The outline: its width a share of the logo's height or of the tagline's line height, so the
    // lockup keeps one look at every size, and never under a device px. At the backing's level (its
    // fade-in, not the scene's): it is the lockup's legibility, handed over from the CSS outline
    // (sections.css).
    float widthPx = max(text ? TAG_OUTLINE_SHARE * uTaglineLinePx : LOGO_OUTLINE_SHARE * unitPx * V.y, pxCss);
    float outline = brandOutline(outside, widthPx, pxCss) * halo;
    enc = energyLight(enc, OUTLINE_SRGB * (outline * (1.0 - smoothstep(0.5 * reach, reach, outside))), uOverlayGain);
  }
  if (lit <= 0.0) return enc;
  // The pale hairline: a charged mark's only. The hero's and the tagline's white outline covers it.
  if (i > TAGLINE_SLOT) {
    float lineMask = 1.0 - smoothstep(LOGO_LINE_PX, LOGO_LINE_PX + pxCss, outside);
    enc = energyLight(enc, ENERGY_RIM_SRGB * (LOGO_LINE_ALPHA * min(light + flash, 1.0) * lineMask), uOverlayGain);
  }
  float crackle = max(text ? 0.0 : LOGO_REST_CRACKLE * rest, light);
  if (uElectricity.y > 0.5 && crackle > 0.0 && outside < ELECTRIC_REACH_OUT_PX) {
    // As on a focused pane: the whole outline runs at FOCUS_NEAR, the pointer lifts it near itself.
    float near = max(uPointerOn * exp(-distance(p, uPointer) / ELECTRIC_POINTER_PX), ELECTRIC_FOCUS_NEAR);
    enc = energyLight(enc, logoElectricity(q, d, n, near, pxCss, V.w, !text) * crackle, uOverlayGain);
  }
  return enc;
}

void main() {
  vec2 pxToCss = uCss / uRes;
  float pxCss = pxToCss.x;
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) * pxToCss;

  // Ripple field: height and wipe slopes per CSS px (y-down) by central differences, curvature.
  Water w = Water(vec2(0.0), 0.0, 0.0, vec2(0.0), 0.0, 0.0);
  float lap = 0.0;
  if (uRippleOn > 0.5) {
    vec2 uv = toUv(p);
    vec4 here = textureLod(tRipple, uv, 0.0);
    vec2 east = textureLod(tRipple, uv + vec2(uRippleTexel.x, 0.0), 0.0).rb;
    vec2 west = textureLod(tRipple, uv - vec2(uRippleTexel.x, 0.0), 0.0).rb;
    vec2 above = textureLod(tRipple, uv + vec2(0.0, uRippleTexel.y), 0.0).rb;
    vec2 below = textureLod(tRipple, uv - vec2(0.0, uRippleTexel.y), 0.0).rb;
    vec2 inv = 0.5 / uRippleTexelCss;
    w.slope = vec2((east.x - west.x) * inv.x, (below.x - above.x) * inv.y);
    w.wipeSlope = vec2((east.y - west.y) * inv.x, (below.y - above.y) * inv.y);
    lap = (east.x + west.x - 2.0 * here.r) / (uRippleTexelCss.x * uRippleTexelCss.x)
        + (above.x + below.x - 2.0 * here.r) / (uRippleTexelCss.y * uRippleTexelCss.y);
    w.height = here.r;
    w.wipe = clamp(here.b, 0.0, 1.0);
  }
  vec3 n3 = normalize(vec3(-w.slope * RIPPLE_NORMAL_GAIN, 1.0));
  // Glints only where the water bends: a weak wave meets the light's angle on its flat flank (the
  // inflection) and would mirror it as a broad leaf of grey, while a strong wave meets it near its
  // crest, where the bend makes the highlight a thin line.
  w.glint = pow(max(dot(reflect(-GLINT_L, n3), vec3(0.0, 0.0, 1.0)), 0.0), GLINT_EXP)
          * smoothstep(GLINT_BEND_FROM, GLINT_BEND_TO, abs(lap));
  w.caustic = clamp(-lap * CAUSTIC_GAIN, 0.0, 1.0);

  // Boot wave: the glass condenses outward from the orb. The CSS glass has its panes all there.
  bool cssGlass = uGlassOn < 0.5;
  float bootA = cssGlass ? 1.0 : (uBootT < 0.0 ? 0.0 : smoothstep(0.0, BOOT_BAND_PX, BOOT_SPEED * uBootT - distance(p, uBootOrigin)));

  // Surfaces: the nearest one (most inside) is drawn; every one casts its shadow, and every
  // energised one its outer glow (the strongest wins, so neighbours' glows meet without a seam).
  // Under the CSS glass the nearest one only places the electricity and masks the panes off; the
  // CSS draws every pane whole (no condense) with its own shadow.
  int best = -1;
  float bestD = 1e6;
  float bestAlpha = 0.0;
  float bestRadius = 0.0;
  vec2 bestHalf = vec2(0.0);
  vec4 bestR = vec4(0.0);
  vec4 bestS = vec4(0.0);
  vec4 bestT = vec4(0.0);
  vec4 bestW = vec4(0.0);
  vec4 bestE = vec4(0.0);
  float shadowK = 0.0;
  float halo = 0.0;
  for (int i = 0; i < MAX_SURFACES; ++i) {
    if (i >= uCount) break;
    vec4 R = uRects[i];
    vec2 rel = p - R.xy;
    vec2 outside = abs(rel) - R.zw;
    if (max(outside.x, outside.y) > SURFACE_REACH_PX) continue;
    vec4 S = uShape[i];
    vec4 T = uState[i];
    float a = cssGlass ? 1.0 : clamp(T.x, 0.0, 1.0);
    float alpha = smoothstep(0.0, APPEAR_ALPHA_RAMP, a) * bootA;
    if (alpha <= 0.0) continue;
    vec2 halfSize = R.zw * mix(APPEAR_START_SCALE, 1.0, a);
    float shortHalf = min(halfSize.x, halfSize.y);
    float radius = mix(shortHalf, min(S.x, shortHalf), a);
    float d = sdRoundBox(rel, halfSize, radius) + sin(a * APPEAR_WOBBLE_FREQ) * (1.0 - a) * APPEAR_WOBBLE_PX;
    if (!cssGlass) {
      float ds = sdRoundBox(rel - vec2(0.0, SHADOW_OFFSET_Y), halfSize, radius);
      shadowK = max(shadowK, (1.0 - smoothstep(SHADOW_INNER_PX, SHADOW_OUTER_PX, ds)) * S.w * SHADOW_STRENGTH * alpha);
    }
    float energy = clamp(uEnergy[i].x, 0.0, 1.0) * alpha;
    if (energy > 0.0) {
      float beyond = max(d, 0.0);
      float fade = 1.0 - smoothstep(HALO_FADE_FROM_PX, SURFACE_REACH_PX, beyond);
      halo = max(halo, energy * (1.0 + HALO_FOCUS * clamp(max(T.y, T.w), 0.0, 1.0)) * exp(-beyond / HALO_PX) * fade);
    }
    if (d < bestD) {
      best = i;
      bestD = d;
      bestAlpha = alpha;
      bestRadius = radius;
      bestHalf = halfSize;
      bestR = R;
      bestS = S;
      bestT = T;
      bestW = uWindows[i];
      bestE = uEnergy[i];
    }
  }

  vec3 glass = vec3(0.0);
  float glassW = 0.0;
  if (!cssGlass && best >= 0 && bestD < pxCss) {
    glass = shadeGlass(p, bestR, bestS, bestT, bestW, bestE, bestHalf, bestRadius, bestD, pxCss, w.slope, w.height, w.wipe, w.wipeSlope, w.glint, w.caustic);
    glassW = clamp(0.5 - bestD / pxCss, 0.0, 1.0) * bestAlpha;
  }
  // Under the CSS glass the energy keeps off every pane, from a device px outside its edge (the
  // frost would blur anything on the pane back in as a smear), and fades in with the scene.
  float paneFree = cssGlass && best >= 0 ? clamp(bestD / pxCss, 0.0, 1.0) : 1.0;
  float open = cssGlass ? paneFree * uSceneFade : 1.0;
  vec3 color = glass;
  if (glassW < 1.0) {
    vec3 scene = shadeBackground(p, w.slope, w.glint, w.caustic, shadowK, halo * open);
    // The hero logo's outline and its tagline's, on the open scene round them (both glass modes):
    // under the WebGL glass the mix below keeps them off the panes, under the CSS glass the pane-free share does.
    vec4 heroBox = uLogoRect[0];
    if (heroBox.z > 0.0 && paneFree > 0.0) {
      vec2 fromBox = max(heroBox.xy - p, p - heroBox.xy - heroBox.zw);
      if (max(fromBox.x, fromBox.y) < LOGO_REACH_PX) scene = shadeLogo(scene, p, pxCss, paneFree, 0);
    }
    vec4 taglineBox = uLogoRect[TAGLINE_SLOT];
    if (taglineBox.z > 0.0 && paneFree > 0.0) {
      vec2 fromBox = max(taglineBox.xy - p, p - taglineBox.xy - taglineBox.zw);
      if (max(fromBox.x, fromBox.y) < TAG_REACH_PX) scene = shadeLogo(scene, p, pxCss, paneFree, TAGLINE_SLOT);
    }
    color = mix(scene, glass, glassW);
  }

  // A charged partner or customer mark (v3.3), over its band's glass and the scene alike: its light
  // only, no halo. Under the CSS glass the band's frost lies over the canvas and softens it.
  for (int i = TAGLINE_SLOT + 1; i < LOGO_SLOTS; ++i) {
    vec4 box = uLogoRect[i];
    if (box.z <= 0.0) continue;
    vec2 fromBox = max(box.xy - p, p - box.xy - box.zw);
    if (max(fromBox.x, fromBox.y) < LOGO_REACH_PX) color = shadeLogo(color, p, pxCss, 1.0, i);
  }

  // The border's electricity, over glass and scene alike: the pointer over a pane with a body
  // inside, or focus in it. After both ceilings, but it is gone 12 px outside the edge (bare copy
  // sits further out) and, inside, before the kind's text inset (12 px, or a pill's 10); under the
  // CSS glass it is outside only.
  float reachIn = best >= 0 ? min(ELECTRIC_REACH_IN_PX, uKindMisc[clamp(int(bestS.y + 0.5), 0, KIND_COUNT - 1)].y) : 0.0;
  if (best >= 0 && uElectricity.y > 0.5 && bestD > (cssGlass ? 0.0 : -reachIn) && bestD < ELECTRIC_REACH_OUT_PX) {
    float hover = clamp(bestT.y, 0.0, 1.0);
    float focus = clamp(bestT.w, 0.0, 1.0);
    float charge = clamp(bestE.x, 0.0, 1.0) * max(hover, focus) * bestAlpha * open;
    if (charge > 0.002) {
      // The arcs lean toward the pointer on a hovered pane. Focus (keyboard, or the touch reading:
      // the focus channel, never hover) has no pointer to lean toward: the whole outline runs at
      // FOCUS_NEAR. A hover easing out after the pointer left the window keeps its lean, not this.
      float near = max(uPointerOn * exp(-distance(p, uPointer) / ELECTRIC_POINTER_PX), ELECTRIC_FOCUS_NEAR * focus);
      // Drawn after the composite's own dim: only an overlay still drawn is left to compensate.
      color = energyLight(color, electricity(p - bestR.xy, bestHalf, bestRadius, bestD, near, reachIn, cssGlass, pxCss) * charge, uOverlayGain);
    }
  }

  // Dither after the encode (linear-space grain would speckle the black).
  color = clamp(color, 0.0, 1.0) + tpdf(gl_FragCoord.xy, uFrame) * GRAIN;
  fragColor = vec4(color, 1.0);
}
`;
