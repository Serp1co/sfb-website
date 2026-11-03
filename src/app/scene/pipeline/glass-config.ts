/* ------------------------------------------------------------------ */
/*  Every tunable of the render pipeline and the liquid-glass          */
/*  composite, one line each on why. Lengths are CSS px, times are     */
/*  seconds, colours are sRGB unless a name says "Lin".                */
/*                                                                     */
/*  Numbers marked "calibrated" were measured by simulating the exact  */
/*  scheme the shaders run (fixed-rate ripple sim, the blur chain with */
/*  bilinear taps, the slosh oscillator fed by Lenis-like flicks),     */
/*  not tuned by eye.                                                  */
/* ------------------------------------------------------------------ */

import type { GlassKind, GlassTint } from "../../glass/contract";
import type { SceneTier } from "../../motion/store";

/* ------------------------------ Per kind ------------------------------ */

/**
 * A CSS glass fill as the composite redraws it, so at handover the WebGL pane looks like the CSS
 * pane it replaces: a 145deg linear gradient of one sRGB colour (flat when the three stops match),
 * composited in sRGB space like the CSS rgba.
 */
export interface FillLook {
  /** sRGB 0-255. */
  rgb: readonly [number, number, number];
  /** Alpha at the gradient's start, at LIGHT.sheenMid, and at its end. */
  stops: readonly [number, number, number];
}

/** The CSS --glass-fill of panels and cards: white 14 % -> 5 % (at 60 %) -> 8 %. */
const SHEEN_FILL: FillLook = { rgb: [255, 255, 255], stops: [0.14, 0.05, 0.08] };

export interface KindLook {
  /** Bevel width as a fraction of the surface's short side: how thick the glass reads at its rim. */
  bevelFrac: number;
  /** Bevel never thinner than this, so small surfaces still read as glass. */
  bwMin: number;
  /** Bevel never wider than this, so big panels stay calm in the middle. */
  bwMax: number;
  /** Refraction at full bevel slope: how far content splays outward at the rim. */
  lensPx: number;
  /** Colour spread along the refraction, relative to its length (rim only). */
  dispersion: number;
  /** Frost at rest (1 = the full 20 px CSS-equivalent blur). */
  kindFrost: number;
  /** Least night tint over a dark scene; the adaptive tint only ever adds to it. */
  baseTint: number;
  /** Rim highlight strength (display space): the edge catches the key light. */
  rimStrength: number;
  /** Ripple slope -> refraction px (calibrated: a fast cursor wake peaks near 4 px). */
  rippleGainPx: number;
  /**
   * Distance from the edge to the nearest text pixel the padding allows. The text-contrast ceiling
   * is fully on from here inwards; only the band outside it (and windows) may glow brighter.
   */
  textInsetPx: number;
  /** The kind's own CSS fill (an untinted surface); a data-glass-tint replaces it, as in the CSS. */
  fill: FillLook;
}

export const KIND_LOOK: Readonly<Record<GlassKind, KindLook>> = {
  // About panels and the practice CTA card: 32 px padding (24 px below 720 px).
  panel: { bevelFrac: 0.1, bwMin: 14, bwMax: 36, lensPx: 26, dispersion: 0.35, kindFrost: 1, baseTint: 0.42, rimStrength: 0.3, rippleGainPx: 90, textInsetPx: 22, fill: SHEEN_FILL },
  // Doors (16 px vertical padding), service, contact and feature cards (24-32 px).
  card: { bevelFrac: 0.12, bwMin: 12, bwMax: 30, lensPx: 22, dispersion: 0.35, kindFrost: 1, baseTint: 0.42, rimStrength: 0.3, rippleGainPx: 90, textInsetPx: 14, fill: SHEEN_FILL },
  // Full-bleed logo bands: bevel 0.30 of the height (the short side); 32 px padding-block.
  // Both bands carry a tint, which replaces this fill (the CSS .logo-band-* backgrounds).
  // Owner 2026-11-02 ("make the background a bit clearer to see"): frost 0.55 is about the 8 px
  // middle stage instead of the full 20 px, and the night tint floor drops 0.38 -> 0.24, so the
  // circuitry behind reads; the labels and logo names keep their contrast through the text
  // ceiling (a soft knee over the pane, whatever shows through), not through the frost.
  band: { bevelFrac: 0.3, bwMin: 10, bwMax: 24, lensPx: 18, dispersion: 0.3, kindFrost: 0.55, baseTint: 0.24, rimStrength: 0.25, rippleGainPx: 90, textInsetPx: 20, fill: SHEEN_FILL },
  // Technology pills: a 44 px tall lens whose label starts about 11 px in; CSS --glass-pill-fill (blue 10 %).
  pill: { bevelFrac: 0.5, bwMin: 8, bwMax: 22, lensPx: 6, dispersion: 0.25, kindFrost: 0.6, baseTint: 0.4, rimStrength: 0.4, rippleGainPx: 60, textInsetPx: 10, fill: { rgb: [68, 136, 255], stops: [0.1, 0.1, 0.1] } },
  // Glass buttons: a 56 px droplet whose label line starts about 18 px in; CSS --glass-btn-fill (white 5 %).
  button: { bevelFrac: 0.45, bwMin: 10, bwMax: 26, lensPx: 14, dispersion: 0.3, kindFrost: 0.35, baseTint: 0.32, rimStrength: 0.4, rippleGainPx: 60, textInsetPx: 14, fill: { rgb: [255, 255, 255], stops: [0.05, 0.05, 0.05] } },
};

export interface TintLook {
  /** sRGB 0-255. */
  rgb: readonly [number, number, number];
  /** A flat fill that replaces the kind's fill, composited like the CSS rgba it replaces (sRGB space). */
  alpha: number;
  /** The 1 px hairline's colour (sRGB 0-255) and alpha; null: white at LIGHT.hairlineAlpha, as clear glass. */
  hairline: { rgb: readonly [number, number, number]; alpha: number } | null;
  /** The rim highlight's colour (sRGB 0-255); null: white. */
  rimRgb: readonly [number, number, number] | null;
}

export const TINT_LOOK: Readonly<Record<GlassTint, TintLook>> = {
  none: { rgb: [0, 0, 0], alpha: 0, hairline: null, rimRgb: null },
  // The one primary action per group keeps its accent: 34 % over the night tint reads like the CSS
  // 28 % over the frost, and the hairline is the CSS button's own blue border (rgba(120,170,255,.55)).
  blue: { rgb: [68, 136, 255], alpha: 0.34, hairline: { rgb: [120, 170, 255], alpha: 0.55 }, rimRgb: null },
  // Partners band: warm, never an accent. A body tint muddies the frost, so it stays faint and the
  // warmth lives where the eye reads the material: the hairline and the rim.
  amber: { rgb: [255, 174, 0], alpha: 0.03, hairline: { rgb: [255, 174, 0], alpha: 0.4 }, rimRgb: [255, 204, 120] },
  // Customers band: a faint cool cast.
  silver: { rgb: [204, 204, 204], alpha: 0.05, hairline: null, rimRgb: null },
};

/* ------------------------------ Background ------------------------------ */

export const BACKGROUND = {
  /** Radial colour fringe at the viewport corners, 0 at the centre where the copy sits. */
  caCornerPx: 1.5,
  /** Extra fringe at full scroll speed: pairs with the flight through the boards. */
  caScrollPx: 2.5,
  /** Scroll speed (px/s) at which the extra fringe is complete: a real Lenis flick peaks near 1000-1100. */
  caScrollFullSpeed: 1200,
  /** HDR bloom threshold: only the orb's highlights and the pulses glow. */
  bloomThreshold: 0.9,
  /** Without float targets the scene is clamped to 1, so the threshold must sit lower. */
  bloomThresholdLdr: 0.8,
  /** Soft knee as a fraction of the threshold, so bloom fades in instead of switching on. */
  bloomKnee: 0.5,
  /** Bloom gain over the frost-blurred scene (the frost is a 20 px blur already). */
  bloomStrength: 0.35,
  /** Corner darkening, which frames the orb and keeps the edges black. */
  vignette: 0.18,
  /** Below this width text crosses the orb more often (one column). */
  narrowWidth: 1024,
  /**
   * The composite takes over the CSS `.scene::after` dim there (components.css: rgba(0, 0, 0, 0.4),
   * which passes 0.6): under the WebGL glass on the scene term only (not the glass); under the CSS
   * glass, once the stylesheet hides the overlay while the scene runs (v3.1), on the whole scene
   * after the copy guard, where the overlay applied it, so copy keeps exactly its contrast and the
   * energy light goes on top at full strength (css-dim.ts reads which share the overlay still draws).
   */
  narrowDim: 0.6,
  /**
   * The overlay's share when the pipeline cannot read its computed style (no .scene wrapper, a colour
   * in an unexpected form): assumed drawn below 1024 px, as components.css draws it, so the energy
   * light is drawn brighter by its inverse and lands at the WebGL strength after it.
   */
  cssDimPass: 0.6,
  /** Shadow offset below each surface, like the CSS lift shadow. */
  shadowOffsetY: 10,
  /** Shadow starts this far inside the (offset) surface edge. */
  shadowInnerPx: -8,
  /** ...and fades out this far outside it. */
  shadowOuterPx: 28,
  /** Shadow strength times the surface's elevation. */
  shadowStrength: 0.32,
  /** Night blue rather than pure black, so shadows read as depth over the scene. */
  shadowColor: "#000814",
} as const;

/* ------------------------------ Guard rects ------------------------------ */

/**
 * Bare copy over the open scene ([data-anchor="copy"] and "practice-copy"): the composite keeps the
 * scene term under each rect dark enough for the text, whatever passes behind it (orb, boards,
 * droplets, bloom), in webgl and css mode.
 */
export const GUARD = {
  /** Most copy rects per frame (the largest visible ones win). */
  maxRects: 8,
  /** Display-linear luminance ceiling: 80 %-white text keeps >= 5:1 over any colour at or below it. */
  ceiling: 0.09,
  /** The same shoulder as the text ceiling, from this fraction of it: highlights keep their shape, no flat discs. */
  kneeFrac: 0.6,
  /** Fully on inside the rect, fading out over this far outside it (glyph halos sit just outside the box). */
  featherPx: 24,
} as const;

/* ------------------------------ Lens ------------------------------ */

export const LENS = {
  /** Cap on the bevel slope (it is infinite at the very rim). */
  slopeMax: 4,
  /** Cursor tilt: a smooth lens that is zero under the cursor and peaks about 40 px out. */
  tiltPx: 6,
  /** Core radius of the tilt lens (also keeps it finite at the cursor). */
  tiltCorePx: 40,
  /** The tilt fades out by about 400 px. */
  tiltFalloffPx: 180,
  /** Slosh offset at full swing (scroll flicks rock the liquid). */
  sloshPx: 10,
  /** Ripple refraction never exceeds this, so a hard press never tears the frost. */
  rippleMaxPx: 12,
  /** Dispersion spread cap per tap: keeps the colour taps under ~1.5 px apart (a spectrum, not ghosts). */
  spreadPerTapPx: 1.5,
} as const;

/* ------------------------------ Frost ------------------------------ */

export const FROST = {
  /** Gaussian sigma of the frost, matched to the CSS fallback's backdrop-filter blur(20px). */
  sigmaCss: 20,
  /** The middle stage of the two-stage frost: the wipe thins the frost instead of dissolving it. */
  midSigmaCss: 8,
  /**
   * Frost left where the cursor has wiped (fraction of the kind's frost): the trail clears to the
   * 8 px middle stage, so circuit beads behind it read as wet blur, not as sharp specks of dirt.
   */
  wipeFrost: 0.3,
  /** Frost at the rim relative to the middle: the thick edge is clearer, like real glass. */
  rimFrost: 0.65,
  /** Clear windows onto the live body (service card image frames): the split bodies read through them. */
  windowFrost: 0.25,
  /** Wiping a window clears it further. */
  windowWipeFrost: 0.3,
  /** A hovered window counts as this wiped, so the swell stays sharp for the whole hover, not only while moving. */
  windowHoverWipe: 0.7,
  /** Corner radius of a window (the surface radius minus its inset). */
  windowRadiusPx: 16,
  /** Windows carry no text, so they take only part of the night tint. */
  windowTintScale: 0.4,
  /**
   * A pill's window is its bead (v3.2: the droplet at the pill's leading end), clearer still: the
   * droplet is a small ball (radius ~0.3 x the pill's height), which the windows' 0.25 (half the
   * 8 px stage) left soft-edged; at 0.1 it is about nine tenths the sharp scene, a distinct ball.
   */
  beadFrost: 0.1,
  /**
   * Logo bands: the frost thins to this in a disc round each logo cell, so its lit circuit node
   * shows. Clearer than the thinned band (0.55, the middle stage) by about the ratio it had to the
   * old full frost (0.5 of 1.0): 0.3 is mostly the sharp scene, so the node still reads as the cell's.
   */
  nodeFrost: 0.3,
  /** That disc's radius as a fraction of the cell's longer side... */
  nodeDiscScale: 0.6,
  /** ...fully clear inside this fraction of the radius, easing back to full frost at the radius. */
  nodeDiscCore: 0.5,
  /** Most logo discs per frame (both bands together have 9 cells today). */
  maxNodeDiscs: 12,
} as const;

/* ------------------------------ Tint and light ------------------------------ */

export const TINT = {
  /** Night: the dark glass colour panes tint toward (adds depth and contrast). */
  night: "#0a0d1c",
  /** Display luminance above which the tint starts to adapt. */
  adaptFloor: 0.06,
  /** Adaptive slope: ramps across 0.06-0.4 of display luminance instead of switching. */
  adaptSlope: 1.2,
  /** Never more than this: the text ceiling, not the tint, is the legibility guarantee. */
  adaptMax: 0.6,
} as const;

export const LIGHT = {
  /** CSS fill gradient angle (145deg, as `--glass-fill`); the stops are per kind (KindLook.fill). */
  sheenAngleDeg: 145,
  /** Position of the middle stop. */
  sheenMid: 0.6,
  /** The CSS inner top highlight every glass surface carries (`--sheen`: inset 0 1px 0 white 18 %). */
  topHighlightPx: 1,
  topHighlightAlpha: 0.18,
  /** Soft light around the cursor on the hovered pane. */
  cursorGlow: 0.04,
  /** Its radius (Gaussian sigma). */
  cursorGlowRadiusPx: 110,
  /**
   * Ripple curvature -> caustic brightness (calibrated on read-back cursor and drop fields: 220
   * saturated up to 1.8 % of a door into flat-topped bands, 180 at most 1.0 %, with slimmer bands
   * and the crest cores still lit).
   */
  causticGain: 180,
  /** Caustics: light focused by the water, strong enough to read as lines under the text ceiling. */
  causticAlpha: 0.16,
  /** Pale cyan, the circuit's light seen through water. */
  causticColor: "#bff2ff",
  /** Glint sharpness (Phong exponent): thin enough to read as a line on a crest; 36 spread into leaves. */
  glintExponent: 64,
  /** Glint brightness before the text ceiling (thin lines may reach it: the shoulder rounds them). */
  glintStrength: 0.85,
  /**
   * Glints only where the water bends (|curvature|, height per CSS px squared, fading in between):
   * a weak wave catches the light on its flat flank as a broad grey leaf, a strong one near its
   * crest as a thin line (calibrated on the same fields: the share of a door over glint 0.5 falls
   * from 1.1-2.3 % to 0.2-0.35 %).
   */
  glintBendFrom: 0.0005,
  glintBendTo: 0.002,
  /** Light for the glints, upper-left in CSS (y-down) coordinates, matching the rim key light. */
  glintLight: [-0.5, -0.6, 0.62] as const,
  /** Ripple slope -> normal tilt: the water shows through light, since 4-6 px of refraction barely moves a 20 px frost. */
  rippleNormalGain: 48,
  /** Troughs darken the pane by up to this (after the text ceiling: darkening never costs contrast). */
  troughDarken: 0.15,
  /** The press's own decay (mirrors the registry's PRESS_DECAY_TAU_S): its age is read back from it. */
  pressDecayTauS: 0.35,
  /** Light ring on the pressed pane, riding the sim's wave front (constant speed, a packet of two crests). */
  pressRingAlpha: 0.16,
  pressRingWidthPx: 6,
  pressRingStartPx: 8,
  /** The trailing crest, this far behind the front at this share of its light. */
  pressRingTrailPx: 26,
  pressRingTrailAlpha: 0.5,
  /** The wiped trail's edge (a meniscus): wipe slope per CSS px -> light, and its strength. */
  wipeEdgeGain: 40,
  wipeEdgeAlpha: 0.08,
  /**
   * Display-linear luminance ceiling for the interior (approached, never reached): 80 %-white copy
   * keeps >= 4.6:1 even under the CSS layers painted above the canvas (the About band's 2.5 %
   * white), white >= 6:1.
   */
  textCeiling: 0.105,
  /**
   * The ceiling is a shoulder from this fraction of itself, not a clamp, so water light over a
   * bright pane keeps a gradient. Lower than the guard's, for more room over the orb-lit hero
   * doors, which at rest darken by only 0.2-0.6 sRGB levels on average (measured).
   */
  textKneeFrac: 0.5,
  /** The ceiling ramps in over this many px just outside the text inset (no hard step). */
  ceilingRampPx: 6,
  /** Key light direction for the rim, upper-left in y-down CSS coordinates. */
  rimKeyDir: [-1, -1] as const,
  /** Rim light everywhere around the edge... */
  rimBase: 0.25,
  /** ...plus this much on the edges facing the key light. */
  rimKey: 0.75,
  /** The cursor brightens nearby rims up to 1.6x. */
  rimCursorBoost: 0.6,
  rimCursorFalloffPx: 220,
  /** Hover and keyboard focus brighten the rim (focus also keeps the DOM ring). */
  rimHover: 0.6,
  rimFocus: 0.8,
  /** 1 px inner hairline, like the CSS 20 % border. */
  hairlinePx: 1,
  hairlineAlpha: 0.18,
  /** Hover doubles it, like the CSS hairline going 20 % -> 40 %. */
  hairlineHover: 1,
  /** In css mode the water lies on the scene itself; glints and caustics make taps visible over black. */
  cssRippleLight: 1,
  /** The slosh slides the sheen gradient by this share of its length: the surface tilts like liquid. */
  sheenSloshShift: 0.1,
  /** ...and brightens the leading rim and dims the trailing one by this (a meniscus): crisp, so it reads through frost. */
  rimSlosh: 0.8,
} as const;

/* ------------------------------ Panel energy ------------------------------ */

/**
 * Owner decision 2026-11-02 ("choreography v2"): a pane with one of the orb's bodies inside it
 * glows electric blue (glassFrame.energy, eased by the registry), all of it on the border: the rim
 * and the hairline turn electric blue, a soft glow spills just outside the edge, and a faint glow
 * runs inside the edge, leaning toward the body. Nothing of it reaches the text: the outer glow is
 * light on the scene (under the copy guard), the inner glow is interior light (under the text
 * ceiling), the rim and hairline stay in the bevel band the padding keeps text out of.
 */
export const ENERGY = {
  /**
   * Electric blue: the circuit nodes' azure (#2f7dff-#4aa3ff) pushed toward the fog's cyan
   * (#008cff), brighter than the UI accent #4488ff, so a lit pane reads as powered, not as a button.
   */
  glowColor: "#3d9bff",
  /** The energised rim: a pale electric blue, so the edge still reads as glass catching light (a saturated rim reads as paint). */
  rimColor: "#a8d8ff",
  /** Outer glow falloff (exponential): 37 % at 8 px, 5 % at 24 px, so it stays inside the 24 px+ gaps between cards. */
  haloPx: 8,
  /** Outer glow at the edge at full energy (screen blend): over black about (30, 78, 128) sRGB, clearly blue, under the hairline. */
  haloAlpha: 0.5,
  /** ...faded to nothing between here and the composite's surface reach, so no surface's glow ends in a step. */
  haloFadeFromPx: 26,
  /** Hover or focus x energy lifts the outer glow by this: the static focus cue while paused or in reduced motion (the arcs add on top otherwise). */
  haloFocus: 0.6,
  /** Inner glow falloff from the edge inward: inside the 14-22 px text inset, so text pixels see only its tail, under the text ceiling. */
  innerGlowPx: 10,
  /** Inner glow at the edge at full energy, nearest the body. */
  innerGlowAlpha: 0.22,
  /** Parts of the edge far from the body keep this share of the inner glow: it leans toward the body inside. */
  innerFarShare: 0.4,
  /** Distance beyond the body's disc over which the edge falls from full to the far share (exponential). */
  innerBodyFalloffPx: 140,
  /** The rim brightens up to (1 + this) at full energy. */
  rimEnergy: 1.2,
  /** The hairline turns electric blue at this alpha at full energy (white 0.18 at rest): the border line itself lights up. */
  hairlineAlpha: 0.8,
  /** ...plus this with hover or focus x energy (the static focus cue). */
  hairlineFocus: 0.2,
} as const;

/**
 * The border "electricity" (owner, 2026-11-02: "a bit of electricity to the border to enforce the
 * focus"): with the pointer over an energised pane (hover, state y: the pointer only), or focus in it
 * (state w: keyboard :focus-visible, or on touch the lit pane nearest the view's centre, v3.1's one
 * touch channel), energy x max(hover, focus), thin bright arcs crawl round its outline,
 * flicker and throw a few sparks, strongest near the pointer. Under the CSS glass (css mode) they
 * ride a thin band just beyond the edge instead of straddling it. Paused or in reduced motion there
 * are no arcs, only the static focus glow (ENERGY.haloFocus, hairlineFocus).
 * Lengths are along the outline (arc length) or off it (signed distance), CSS px.
 */
export const ELECTRICITY = {
  /** Arc sheath: a lighter electric blue than the glow, so the arcs read over it. */
  arcColor: "#6cc0ff",
  /** Arc core: near white, the hot centre of a discharge. */
  arcCoreColor: "#eef9ff",
  /** The sheath's light at the arc (screen blend): a soft electric-blue glow that makes a 1 px arc read against the lit hairline. */
  arcAlpha: 0.55,
  /** The sheath's falloff either side of the arc (exponential). */
  arcGlowPx: 2.2,
  /** The core's light: a near-white line on top of the sheath. */
  arcCoreAlpha: 1,
  /** Core half-width (Gaussian); never under a device pixel, so it never aliases into dots. */
  arcWidthPx: 0.65,
  /** The arc wanders this far either side of the edge, so it reads as a discharge, not a second hairline. */
  arcAmpPx: 4.5,
  /** Lattice spacing of the arc's jagged path (plus an octave three times finer): a lightning path, not a sine. */
  arcWavePx: 26,
  /** Between jumps the path slides this many lattice cells per second (~21 px/s), so it never sits still. */
  arcDriftCells: 0.8,
  /** The path jumps to a new shape this often (the two strands half a beat apart): the crackle. */
  arcReshapeHz: 14,
  /** Lattice of the lit runs along the outline: about one run per this many px. */
  arcSegmentPx: 90,
  /** Only the top of the run noise lights (smoothstep from..to): runs cover about a third of the outline, thin arcs rather than a neon tube. */
  arcSegFrom: 0.55,
  arcSegTo: 0.75,
  /** The runs crawl round the outline at this speed; the second strand at -0.6x, the other way. */
  arcCrawlPxPerS: 140,
  /** Each run's brightness re-rolls this often... */
  arcFlickerHz: 24,
  /** ...between this share and full. */
  arcFlickerFloor: 0.25,
  /** Arcs far from the pointer keep this share of their light: strongest near the pointer. */
  farShare: 0.3,
  /** Pointer proximity falloff (exponential). */
  pointerFalloffPx: 180,
  /**
   * Keyboard focus and the touch focus (the lit pane nearest the view's centre) have no pointer to
   * lean toward: the whole outline runs at this proximity, the arcs at about two thirds of their
   * light by a pointer, so a focused pane crackles all round yet never outshines the hovered spot.
   */
  focusNear: 0.5,
  /**
   * Under the CSS glass (css mode, phones) its frost covers the pane, so the arcs fold outward and
   * ride at least this far beyond the edge: the core (0.65 px Gaussian on a 3x phone) keeps 91 % of
   * itself clear of the pane, so the frost line never cuts an arc in half.
   */
  cssLiftPx: 1,
  /**
   * The band round the outline the electricity lives in, faded out over its last fadePx: gone 12 px
   * inside (cards keep text 14 px+ in; never past a kind's textInsetPx, a pill's 10) and 12 px
   * outside, half the 24 px gap between cards, where the nearest pane (the one it follows) switches.
   */
  reachInPx: 12,
  reachOutPx: 12,
  fadePx: 4,
  /** One spark slot per this many px of outline... */
  sparkCellPx: 70,
  /** ...re-rolled this often per second at a random phase... */
  sparkRateHz: 2.2,
  /** ...lit for this share of its cycle (~0.14 s), flying off the edge as it fades. */
  sparkLife: 0.3,
  /** Share of the slots that fire per cycle near the pointer (sparkFarShare of that far from it): a few sparks, not a fizz. */
  sparkChance: 0.6,
  sparkFarShare: 0.15,
  /** Spark dot radius (Gaussian), never under a device pixel... */
  sparkRadiusPx: 1.3,
  /** ...inside a soft glow of this falloff (exponential) and light, so a spark reads at a glance. */
  sparkGlowPx: 3,
  sparkGlowAlpha: 0.5,
  /** A spark starts this far outside the edge and drifts this much further out as it fades (inside reachOutPx). */
  sparkStartPx: 0.5,
  sparkDriftPx: 7,
  /** Spark light at birth (screen blend). */
  sparkAlpha: 1,
  /** Spark colour: the circuit pulses' pale cyan. */
  sparkColor: "#cfeeff",
  /** The electricity's clock wraps here, keeping the noise lattice exact in float; the one jump hides in the crackle. */
  timePeriodS: 512,
} as const;

/* ------------------------------ The hero logo's border ------------------------------ */

/**
 * The hero logo's signed distance field (v3.2, logo-field.ts), built once per page view from the
 * same SVG the hero shows: its silhouette rasterised over the viewBox plus a margin, an exact
 * Euclidean distance transform, halved into a small half-float texture. Lengths in viewBox units.
 */
export const LOGO_FIELD = {
  /** The hero logo's file (public/, hero-section.tsx shows the same one): the field traces its silhouette. */
  src: "/sfb-logo.svg",
  /** Its viewBox: the hero-logo anchor rect maps onto it (the image keeps 601:244 at every size). */
  viewWidth: 601,
  viewHeight: 244,
  /** Raster px per unit: 1024 px across the logo, so its narrowest gaps (~13 units) span 20+ px before halving. */
  rasterPerUnit: 1024 / 601,
  /**
   * The field's margin round the viewBox: the arcs, sparks and glow (12 CSS px out, 35 units on the
   * smallest, 208 px logo) stay inside it; beyond it the halo's tail extrapolates the distance.
   */
  padUnits: 40,
} as const;

/**
 * The hero logo's outline in the composite: v3.2's electric border, always on while the logo is on
 * screen and stronger (owner, 2026-11-02 evening, v3.4: "bring back the previous electric effect
 * border on the hero logo but make it stronger; the black border needs to be a lot less"). At rest
 * a bright pale hairline, a soft electric-blue glow and, while motion is allowed, a clearly visible
 * crawling crackle (the ELECTRICITY arcs, folded outward, at crackleAmp of their wander, at
 * restCrackle of a full charge's light) with the overlay's small arcs and sparks (LOGO_ARCS.heroRest),
 * all over a crisp white outline of about 2 px (outline): the letters are black since the owner's
 * later call that evening, and read as dark shapes against it, the cobalt S too. At rest there is
 * no blue light round it: the electric blue is the charge's.
 * Charged (the pointer over it: LOGO_CHARGE) the electric-blue glow swells from nothing, the
 * crackle reaches full light (the world's orb brightens behind it, from motion.charge) and the
 * overlay's discharge (bolts, sparks, a small bloom where a bigger one lands) goes on top; a click
 * or a tap is the thunder (LOGO_ARCS.thunder: bolts and sparks, no flash, no swell). Paused or with
 * reduced motion: the static rest border (the outline and the crackle's still frame), and on hover
 * a static charged glow. The partner and customer marks take the charged light only, without the
 * outline or the rest border.
 */
export const LOGO_BORDER = {
  /**
   * The outline (owner, 2026-11-02 evening: the letters went from white to black, "when opening
   * give the logo a light blue glow to the border to make it stand from the background", then "the
   * glow is too big, need to be more like an outline with some glow", then, still seeing a blue
   * haze, "remove the blue glow from the hero logo and writes, make it a white glow border of about
   * 2px for both logo and writings below"): a crisp white line of about 2 px hugging the glyphs'
   * edge, with only a short soft shoulder outside it, gone within a few px. The black letters and
   * the cobalt S read as dark shapes against it. At the logo's fade-in level (its legibility, as the
   * CSS twin it takes over from). Its width is a share of the logo's height, so it keeps its look
   * at every size; the tagline takes the same line at a width of its own
   * (TAGLINE_BORDER.outlineShare): one look for the lockup. sections.css draws the same outline
   * (.hero-logo, .hero-tagline) from the first paint until the composite takes over, and whenever
   * the scene is not there.
   */
  outline: {
    /** White (owner): the brightest edge there is, so black letters and the cobalt S stand out from the dark scene and the orb at any size. */
    color: "#ffffff",
    /** The line's width, a share of the logo's height: 2 px on the 1440 x 900 hero (161 px), 2.4 px at 2491 wide, 1.4 px on a phone (never under a device px). */
    widthShare: 0.0124,
    /** Full light on the line: a crisp edge round the black letters, not a gradient from them. */
    alpha: 1,
    /** The shoulder starts just outside the line at under a third of its light, so the line's own edge still reads and no haze follows... */
    glowAlpha: 0.3,
    /** ...and falls off (exponentially) over this many line widths: 0.7 px at 1440, so it is down to a tenth by about 2 px past the line. */
    glowWidths: 0.35,
  },
  /** Past this from the logo's box nothing is drawn (the glow's fade ends here; the outline's light is long gone). */
  reachPx: 50,
  /**
   * The lit hairline just outside the silhouette in the energised rim's pale blue (ENERGY.rimColor):
   * full out to linePx past the silhouette, then fading over a device px (the glyph's own
   * antialiased edge covers the first half px, and a line ending at linePx hid under it at 1x).
   * The hero's and the tagline's white outline (2 px) would cover it, so only a charged partner or
   * customer mark, which has no outline, draws it.
   */
  linePx: 1.25,
  /** Charged: a focused, energised pane's hairline (ENERGY.hairlineAlpha + hairlineFocus). */
  lineAlpha: 1,
  /** The crackle's light at rest, in shares of a charged one: clearly visible all the time, with room for the hover to lift it. */
  restCrackle: 0.8,
  /**
   * The electric-blue glow at full charge, x ENERGY.haloAlpha at the edge: a little past a focused
   * pane's 0.8 at the edge (1.1 x 0.5). It builds from nothing with the charge: at rest there is no
   * blue light round the logo (owner, 2026-11-02 evening).
   */
  glowGain: 1.1,
  /**
   * A flash (a mark's burst, a bigger discharge) lifts the glow by up to this much more: the bloom
   * pulse round the outline. The hero's thunder has none (owner, 2026-11-02 evening: "remove the
   * blinding flash when clicking the logo").
   */
  flashGlow: 1.6,
  /**
   * The outline and the border fade in over this once the logo is there to draw and has finished
   * its CSS rise (brief C), as its CSS outline eases out over the same 0.6 s (sections.css), so the
   * hand-over never leaves the logo bare and never leads a logo still rising into place.
   */
  fadeInS: 0.6,
  /**
   * The crackle's lit runs crawl along the outline's local tangent for one cycle of this, fading in
   * and out (two cycles half a period apart cross-fade), then re-roll. 0.8 s at
   * ELECTRICITY.arcCrawlPxPerS carries a run about one run-lattice cell.
   */
  runCycleS: 0.8,
  /**
   * The runs' lit share (smoothstep from..to over 2D eased noise): lower than the panels' 0.55..0.75,
   * as 2D noise sits nearer its mean, and a little lower still than v3.2's 0.5 so the charged edge
   * hums along most of its length rather than a third of it.
   */
  runFrom: 0.42,
  runTo: 0.66,
  /**
   * The crackle wanders this share of the panels' ELECTRICITY.arcAmpPx: their full 4.5 px, so its
   * arcs ride 1-5.5 px out, mostly past the outline, where they read as crackle (v3.3's 0.5 kept
   * them on the hairline, where they read as a brighter line).
   */
  crackleAmp: 1,
  /** The crackle's lattice is the panels' at this logo height (the hero's at 1440 x 900) and shrinks with a smaller logo... */
  crackleRefPx: 160,
  /** ...to this share at least: on a 56 px mark (0.35) the panels' 26 px jag would be a third of the mark. */
  crackleMinScale: 0.45,
  /**
   * Charged, the scene behind the logo brightens by up to this share within reachPx of its box (v3.3:
   * the orb feeding the logo). 0 since v3.4: the world's orb body brightens itself with
   * motion.charge.hero (aquaism/core/orb.tsx), and a share here would double it.
   */
  orbFeed: 0,
} as const;

/* ------------------------------ The electric logos (v3.3) ------------------------------ */

/**
 * The composite's logo slots: the hero (0), the hero's tagline (1, v3.4), then two marks (the one
 * charging, and the one the pointer left for it, still discharging).
 */
export const LOGO_SLOTS = 4;

/** The tagline's slot (the composite shades it with the hero, on the scene term). */
export const TAGLINE_SLOT = 1;

/**
 * The partner and customer marks' distance fields, built into the logo atlas beside the hero's
 * (logo-field.ts) from each mark's own SVG, its alpha silhouette (the marks are shown one-tone
 * with a CSS filter). Lengths are CSS px of the mark as the .logo-box shows it.
 */
export const MARK_FIELD = {
  /** The box each mark is contained in (sections.css .logo-box, 9rem x 3.5rem at 16 px): it sets a slot's resolution. */
  boxPx: [144, 56],
  /** Field texels per CSS px: twice the hero's ~1, since a mark's detail (Red Hat's and NetApp's wordmarks, 6-8 px letters) is finer. */
  texelsPerPx: 2,
  /** The slot's margin round the mark: the glow and crackle (12 px out at most) stay inside it; past it the distance extrapolates. */
  padPx: 14,
  /** Coverage from this alpha up counts as solid: the one-tone evoila mark draws parts at 0.38 and 0.7, and they are the mark. */
  solidAlpha: 0.35,
} as const;

/**
 * The hero tagline's distance field (v3.4, tagline-field.ts): the h1's own text rasterised with its
 * computed font, line by line where the DOM laid it out, then the logos' exact EDT, into the atlas.
 * Only the field: no bolt rides the tagline, so its slot keeps no outline points or gaps. Lengths
 * are CSS px of the tagline as laid out when it was built (its field's units).
 */
export const TAGLINE_FIELD = {
  /**
   * Field texels per CSS px (the raster is twice this): the hero's density. A 44 px bold line is
   * ~970 x 100 texels with its margin, and its build (raster, EDT both ways, outline) stays near 25 ms
   * on desktop, where 2 texels per px quadrupled it for edges the halving already places to 0.1 px.
   */
  texelsPerPx: 1,
  /** The field's margin round the h1's box: past the border's reach (TAGLINE_BORDER.reachPx), so nothing drawn reads an extrapolated distance. */
  padPx: 28,
  /** A changed layout (resize, language, a font swap) is rebuilt once it has held this long: one build per resize, not one per frame. */
  settleMs: 150,
} as const;

/**
 * The hero tagline's border (v3.4; owner: "add the electric effect border to 'Infrastructure.
 * Development. Security.'"). Its letters are black since 2026-11-02 evening ("make it black"), the
 * logo's black, so at rest it takes the logo's outline (LOGO_BORDER.outline: the crisp white line
 * of about 2 px with a short shoulder, at outlineShare of its line height), in place of v3.4's dark
 * text halo and dim blue rest border, which would bury black letters. Hovered (from geometry,
 * LOGO_CHARGE.tagline*) a focused pane's border electricity goes on top, round the letters: the
 * electric-blue glow's swell and the crawling crackle, and nothing else (owner, 2026-11-02
 * evening: "keep only the electric border (without the sparkles) when going over with the mouse"):
 * no sparks, no small arcs, and the letters stay black. Touch never hovers: the outline only. The
 * CSS draws the same outline as a text-shadow (sections.css .hero-tagline) until the composite draws
 * the tagline (html[data-tagline-energy]) and zeroes it: a text-shadow sits over the canvas and
 * would hide the border it frames, as the logo's drop-shadow hid its arcs (v3.2).
 */
export const TAGLINE_BORDER = {
  /**
   * The outline's width, a share of the line height: 2 px on the 1440 x 900 hero's 48 px line, as
   * the logo's, 1.3 px on a phone's 31 px, never under a device px. Heavy for its size, as a 6-7 px
   * stroke needs a line it can be read by over the dark scene; white against the black letters it
   * holds far more than 4.5:1 on a phone too.
   */
  outlineShare: 0.0413,
  /** Past this from the tagline's box nothing is drawn: the outline's glow is long gone, the hover's glow under 1 %. */
  reachPx: 16,
  /** The hover glow's falloff (exponential): a third of a pane's 8 px, so it follows 28-44 px glyphs and their 2-5 px gaps instead of filling them. */
  glowPx: 3,
  /** The hover glow at full charge, x ENERGY.haloAlpha at the edge (0.8 x 0.5 = 0.4). */
  glowGain: 0.8,
  /** The crackle's lattice at this line height is the panels' (as LOGO_BORDER.crackleRefPx); smaller text gets a finer one, down to LOGO_BORDER.crackleMinScale. */
  crackleRefPx: 160,
} as const;

/**
 * The logos' charge (brief A): the pointer over a logo charges it, a click or a tap (touch has no
 * hover) discharges it in a burst: a mark's charges it full and blooms its glow; the hero's is the
 * thunder, which leaves its charge as the pointer made it and lights nothing beyond its own bolts
 * (owner, 2026-11-02 evening: no flash). The light follows the charge squared, so it swells slowly,
 * then fast, and once the pointer leaves drops fast, then trails off.
 */
export const LOGO_CHARGE = {
  /** The charge builds over this long under the pointer (brief A.1: ~0.35 s, eased in). */
  buildS: 0.35,
  /** ...and discharges over this long once it leaves (brief A.1: ~0.4 s). */
  decayS: 0.4,
  /** The hero charges with the pointer inside its silhouette or within this of it (brief A.1). */
  heroHoverPx: 24,
  /** A mark charges with the pointer inside its box and within this of its silhouette: over its gaps and just round it. */
  markHoverPx: 10,
  /** A mark's burst (a tap: its glow's bloom pulse, the overlay's arcs at full count) dies over this long. */
  burstS: 0.45,
  /**
   * The hero's thunder (v3.4: a click or a tap) lasts this long, every bolt and spark of it
   * included (LOGO_ARCS.thunder: spawned over 0.12 s, each living 0.45-0.72 s): the brief's ~0.6-0.9 s.
   * The outline crackles harder meanwhile (LOGO_ARCS.heroBurst); its glow does not swell.
   */
  thunderS: 0.85,
  /** A burst on the hero drops this ripple into the orb behind it (queueImpulse "drop", 0..1): a full ring, the thunder's shock. */
  burstDrop: 1,
  /** At full light, a bigger discharge (a thick bolt and a flash) every this long, at random between the two... */
  bigEveryS: [0.8, 1.9],
  /** ...once the light is past this (the charge has built). */
  bigFrom: 0.75,
  /** A bigger discharge's flash dies over this long: a brief bloom pulse. */
  bigFlashS: 0.18,
  /** The tagline's charge builds over this under the pointer, and goes over this once it leaves: a short swell, quicker than the logo's. */
  taglineBuildS: 0.22,
  taglineDecayS: 0.3,
  /** The tagline charges with the pointer inside its box and within this of its glyphs: over the words and their gaps, not the box's empty ends. */
  taglineHoverPx: 12,
} as const;

/**
 * The bolts and sparks the overlay pass draws after the composite (logo-arcs.ts): screen-space
 * lightning, midpoint-displacement polylines with branches, re-made every 50-90 ms, a white-hot
 * core in an electric-blue glow (screen blend, under the DOM, so never over the glyphs). Lengths
 * given as shares are of the logo's box height (the hero ~160-195 px, a mark 56 px): scaled to it.
 */
export const LOGO_ARCS = {
  /** A bolt keeps its shape this long, at random between the two (brief A.1: 50-90 ms), then jumps to a new one. */
  lifeS: [0.05, 0.09],
  /** A bolt's channel sits out a turn this often, for this long: gaps in the crackle, so it flickers rather than hums. */
  restChance: 0.25,
  restS: [0.03, 0.08],
  /** Midpoint-displacement halvings: 4 for a main bolt (17 points, 2-8 px apart), 3 for a branch (9). */
  levels: 4,
  branchLevels: 3,
  /** Each midpoint moves across its segment by up to this share of the segment's length: jagged, never a sine. */
  roughness: 0.42,
  /** A streamer's free end wanders more. */
  streamerRoughness: 0.55,
  /** A branch forks off a main bolt's quarter points this often, this share of the bolt long, this many degrees off it... */
  branchChance: 0.35,
  branchLength: [0.25, 0.55],
  branchAngleDeg: [18, 45],
  /** ...at this share of its light, fading out toward its tip. */
  branchLight: 0.6,
  /**
   * White-hot core (ELECTRICITY.arcCoreColor) and its electric-blue glow: the panels' lighter arc
   * blue (ELECTRICITY.arcColor), as ENERGY.glowColor is too near the orb's own blue to read over it.
   */
  coreColor: "#eef9ff",
  glowColor: "#6cc0ff",
  /** Core half-width (Gaussian), CSS px: a 2 px white-hot line (a 1.5 px one read as a hair over the orb at 1x). */
  coreHalfPx: 1.1,
  /** The glow's falloff either side (exponential) and its light at the core: a sheath wide and bright enough to read as power. */
  glowPx: 4.5,
  glowAlpha: 0.85,
  coreAlpha: 1,
  /** A branch's core is this share of its bolt's: forks thin out. */
  branchCore: 0.7,
  /** Half the strip's width: the core and three and a half glow falloffs (the sheath is under 3 % past it). */
  halfWidthPx: 16,
  /** A bigger discharge's bolt is this much wider and this much brighter. */
  bigWidth: 1.7,
  bigLight: 1.3,
  /** Bolt points are kept at least this far outside the silhouette: they ride the gaps and counters, never the glyphs. */
  clearPx: 1.2,
  /** The hero at full charge: bolts across its gaps and counters, into the orb behind it, and streamers off its outline. */
  hero: { gap: 4, orb: 3, streamer: 4 },
  /** ...and its thunder adds this many on top while it lasts (thunderS): the outline crackling hard as the bolts leave it. */
  heroBurst: { gap: 4, orb: 2, streamer: 4 },
  /** At rest (v3.4, always on): the hero's small arcs, a gap bolt and two short streamers... */
  heroRest: { gap: 1, orb: 0, streamer: 2 },
  /** ...whose channels sit out a turn this often (a charge's 0.25 at full light): small arcs popping in and out, not a steady fizz. */
  restRestChance: 0.55,
  /**
   * The hero's thunder (v3.4, owner: "make it thundering, with actual electric arcs generating and
   * shooting outside, on click"): long branching bolts that leave the outline and shoot outward into
   * the scene, each growing out over growS, then flickering (and maybe striking again) and fading,
   * and a shower of sparks flung outward with them. Repeated clicks retrigger it (the pool takes
   * the oldest bolts). No flash (owner, 2026-11-02 evening: "remove the blinding flash when
   * clicking the logo"): v3.4's discs over the logo and the sky round it greyed the whole hero, so
   * the bolts carry their own light and nothing else lights the area round the logo.
   */
  thunder: {
    /** Bolts per click: enough to ring the logo (one per ~25 degrees), few enough to read one by one. */
    count: 14,
    /** The pool: two clicks' worth, so a quick second click overlaps the first instead of cutting it off. */
    pool: 28,
    /** They leave the outline over this (s), not all on one frame: power released, not a sprite. */
    spawnS: 0.12,
    /** Each grows out from the outline over this long (s, brief: ~60-120 ms)... */
    growS: [0.06, 0.12],
    /** ...and lives this long in all (s), flickering and fading once grown. */
    lifeS: [0.45, 0.72],
    /**
     * How far a bolt's tip lands from the logo's centre, in shares of the logo's half-size that way
     * (its box's ellipse): the discharge spans 1.5-3x the logo (the brief), sideways most.
     */
    reach: [1.5, 3],
    /** A bolt leaves along this blend of the outline's normal (0) and the ray from the logo's centre (1): outward, radially. */
    radial: 0.6,
    /** ...turned up to this many degrees either way. */
    turnDeg: 18,
    /** Midpoint-displacement halvings: 33 points, 5-15 px apart on a 150-450 px bolt. */
    levels: 5,
    /**
     * Each midpoint moves across its segment by up to this share of it: jagged at every scale below
     * the first halving, turns up to ~45 degrees (a hover bolt's 0.42 crinkles a 400 px bolt into scribble)...
     */
    roughness: 0.22,
    /** ...whose bend is gentler still (0.22 there would swing a 400 px bolt 90 px off its way): it shoots outward. */
    bendRoughness: 0.15,
    /** Up to this many branches per bolt, each this likely, forking off at a random point of its first 70 %... */
    branches: 3,
    branchChance: 0.65,
    branchLevels: 3,
    /** ...this share of the rest of the bolt long, this many degrees off it, at this share of its light. */
    branchLength: [0.2, 0.5],
    branchAngleDeg: [16, 42],
    branchLight: 0.55,
    /** The bolt: a white-hot core this wide (half, Gaussian), a sheath of this falloff, in a strip this wide (half, the sheath under 5 % past it): heavier than a hover bolt. */
    coreHalfPx: 1.6,
    glowPx: 6,
    halfWidthPx: 18,
    /**
     * Those widths and the sparks' counts (below) are the 1440 x 900 hero's, a box this tall (CSS
     * px); a smaller logo scales them down with its height, as the bolts' reach already is. On a
     * phone (~111 px, x0.69) desktop-wide sheaths and the full shower lit most of the little area
     * the view keeps round the logo (the median of its 3x box rose ~10/255 over the tap's own
     * splash; scaled, 5-6). A larger logo keeps them (never scaled up): 2491 x 1304 stays as reviewed...
     */
    refHeightPx: 161,
    /** ...but never below this share (a 320 px phone's logo is ~85 px tall): its sheath still reads as a sheath, its sparks as a shower. */
    minScale: 0.6,
    /** Its light at the root, and the share left at the tip once grown (the leader's tip burns bright while it grows). */
    light: 1.25,
    tipLight: 0.3,
    leaderLight: 1.35,
    /** Once grown, its light re-rolls each frame between this share and full: the flicker. */
    flickerFloor: 0.45,
    /** This likely a bolt strikes again once, at full light for restrikeS, somewhere in its fading. */
    restrikeChance: 0.5,
    restrikeS: 0.05,
    /** Sparks flung outward from the outline at the click (CSS px/s, radially, up to spreadDeg off), living this long... */
    sparks: 48,
    sparkSpeed: [220, 650],
    sparkSpreadDeg: 32,
    sparkLifeS: [0.35, 0.7],
    /** ...and this many off each bolt's tip as it lands. */
    tipSparks: 3,
  },
  /** A mark at full charge: across its own gaps, to its circuit node behind it, streamers; a burst adds the second set. */
  mark: { gap: 2, node: 1, streamer: 2 },
  markBurst: { gap: 3, node: 1, streamer: 4 },
  /** Gap bolts join outline points facing each other across this range, as shares of the viewBox height (the hero's S-F gap is 0.05). */
  gapRange: [0.03, 0.3],
  /** The hero's bolts into the orb are this long (shares of its height), aimed outward and kept off the tagline below it... */
  orbLength: [0.45, 1],
  /** ...and its streamers this long; a mark's streamers, relatively longer, so they still read on a 56 px mark. */
  heroStreamer: [0.06, 0.16],
  markStreamer: [0.12, 0.3],
  /** No bolt reaches below its logo's box by more than this (CSS px): the hero's tagline and a mark's name sit there. */
  taglineClearPx: 3,
  /** Sparks: 0-2 thrown where a new bolt touches the outline, each this likely... */
  sparkChance: 0.5,
  /** ...living this long (brief A.1: ~0.2-0.4 s), fading... */
  sparkLifeS: [0.2, 0.4],
  /** ...flying off at this speed (CSS px/s at the hero; a mark's at half), up to this many degrees off the outline's normal, falling... */
  sparkSpeed: [70, 230],
  sparkSpreadDeg: 55,
  sparkGravity: 380,
  /** ...drawn as a streak this long in time behind them, with a thinner core and strip. */
  sparkTrailS: 0.022,
  sparkCorePx: 0.6,
  sparkHalfWidthPx: 6,
  /** A mark's burst throws half this many at once (the hero's thunder has its own: thunder.sparks). */
  burstSparks: 24,
  /** The flash (a bloom pulse) where a bigger discharge lands or over a mark's burst (the hero's thunder has none): a soft disc this big (shares of the logo's height) and bright. */
  flashRadius: 0.6,
  flashAlpha: 0.32,
  /** Flash colour: the circuit pulses' pale cyan (ELECTRICITY.sparkColor). */
  flashColor: "#cfeeff",
  /** Most sparks alive, and vertices per frame (bolts, branches, sparks, flashes): the thunder on a charged hero uses about 4,000. */
  maxSparks: 192,
  maxVertices: 8192,
} as const;

/* ------------------------------ Condense and boot ------------------------------ */

export const APPEAR = {
  /** A condensing pane starts at 90 % of its size... */
  startScale: 0.9,
  /** ...is fully opaque after the first 30 % of its condense... */
  alphaRamp: 0.3,
  /** ...and its edge wobbles like a settling drop (decays to 0). */
  wobblePx: 3,
  /** 1.5 wobbles over the condense. */
  wobbleFreq: 9.42,
} as const;

export const BOOT = {
  /** Boot wave speed from the orb: reaches the corners in about 0.85 s, matching the CSS glass fade-out. */
  speedPxPerS: 1000,
  /** Width of the condensing front. */
  bandPx: 240,
  /** The scene term fades in inside the composite (never a CSS fade, which would fade the glass too). */
  sceneFadeS: 1.2,
  /** The WebGL glass takes over once the scene is this far in. */
  activateAtFade: 0.6,
  /** If the world never reports ready, fade the scene in anyway (the glass stays CSS). */
  worldReadyTimeoutS: 10,
  /** One drop at the boot origin, this long after activation: its own beat, once the wave has left the origin. */
  ringDelayS: 0.3,
  /** Sized to land in the pane whose edge the origin is (the hero's middle door), not across the gap above it. */
  ringRadiusPx: 40,
  ringAmp: 1.5,
  /** Two demo drops skim the first visible card, after the circuitry's power-on has crossed the claim. */
  demoDelayS: 2.6,
  demoGapS: 0.18,
  /** A surface still condensing (appear below this) is no fair demo target: its pool is still growing. */
  demoMinAppear: 0.95,
  /** Drop positions as fractions of the card's half size (an arc, left to right); big enough to read through frost. */
  demoDrops: [
    { u: -0.3, v: 0.12, radiusPx: 30, amp: 1.4 },
    { u: 0.25, v: -0.05, radiusPx: 24, amp: 1.1 },
  ] as const,
} as const;

/* ------------------------------ Ripple sim ------------------------------ */

export const RIPPLE = {
  /** Fixed sim rate: wave speed (~340 px/s at 4 px texels) and fade are the same at 60, 120 or 144 Hz. */
  stepsPerS: 120,
  /** Catch-up cap after a long frame (the rest is dropped, never accumulated). */
  maxStepsPerFrame: 4,
  /** Per step in webgl pools: about a 1.2 s fade (0.986^144 = 0.13). */
  dampingPools: 0.986,
  /** Open water (css mode) calms faster: ripples there sit on the scene, not on glass. */
  dampingOpen: 0.975,
  /** Longest sim side in texels (texels stay square: one scale for both axes). */
  maxSimSide: 512,
  /** Height clamp: keeps a burst of presses from blowing up. */
  heightClamp: 2,
  /** Cursor wake brush over glass, stamped once per sim step along the path since the last step. */
  brushRadiusPx: 14,
  /**
   * Wake amplitude per 1/60 s of stroke at full speed; each step injects its share (60 / stepsPerS),
   * never scaled by the frame time (calibrated: a full-speed wake peaks at 4.3 +- 0.1 px from 60 to
   * 240 Hz; the old per-frame brush fell to 2.4-3.0 px at 120-240 Hz).
   */
  brushAmp: 0.55,
  /** Cursor speed (px/s) that gives the full wake. */
  brushFullSpeed: 1800,
  /** A press on glass. */
  pressRadiusPx: 26,
  pressAmp: 1.4,
  /** A press anywhere in css mode (the water is the scene). */
  cssPressAmp: 0.9,
  /** Programmatic drops (a pane condensing, a page change), times their strength. */
  dropRadiusPx: 22,
  dropAmp: 1.2,
  /** Frost wipe brush: shows the orb through the trail without filling a whole 88 px door. */
  wipeRadiusPx: 34,
  wipeStrength: 0.9,
  /** Re-fog time constant: the trail ends with the wake (~0.5 s), not seconds later as a dark smudge. */
  refogTauS: 0.8,
  /** Wave height -> frost cleared (crests and troughs both sharpen the view, like real water)... */
  clearGain: 0.5,
  /** ...never more than this share of the frost, so text stays on frosted glass. */
  clearMax: 0.45,
  /** The trail wipes; a resting cursor does not (speed px/s from no wipe to full wipe). */
  wipeSpeedFrom: 20,
  wipeSpeedTo: 300,
  /** css mode: ripple slope -> background refraction px (calibrated: a tap ring ~4.6 px). */
  rippleGainCss: 140,
  /** Drops applied per step pass (more in one frame are merged out, the weakest first). */
  maxDrops: 8,
  /** A pointer jump longer than this is a re-entry, not a stroke. */
  maxStrokePx: 400,
  /**
   * Absorbing band along every wall of the water: each pane's inner edge (webgl pools) and the
   * canvas edge (both modes, where the water runs on off screen). Perfect walls echoed a press ring
   * back and forth until the fade ended it; through the band a wall returns one clear reflection,
   * a faint second and nothing after (calibrated on a CPU model of the step, presses on the real
   * panes: the 1st bounce 8-13 sRGB levels of light over a dark pane, the 2nd 2-6, the 3rd and 4th
   * 0.5-4.7, against 25-190 for every bounce with perfect walls). The absorption ramps in as
   * (1 - depth / width)^2, so the band's inner edge reflects nothing itself.
   */
  spongePx: 24,
  /** Never wider than this share of a pane's short half-side: a pill (22 px) keeps a still core. */
  spongeShare: 0.7,
  /**
   * One-way amplitude absorption across the band at normal incidence (nepers), whatever its
   * width or the texel size: a wall returns e^(-2 x 0.45) = 0.41 of a wave, 0.17 after two
   * bounces, 0.07 after three (measured 0.38-0.45 from 4 to 7.5 px texels).
   */
  spongeNepers: 0.45,
} as const;

/* ------------------------------ Slosh ------------------------------ */

export const SLOSH = {
  /** Natural period of the liquid's rock. */
  periodS: 0.85,
  /** Underdamped, but settled 1.6 s after a flick (it used to ring sub-pixel for 2.4 s, delaying stillness). */
  dampingRatio: 0.35,
  /** Scroll acceleration (px/s^2) gain (calibrated on a recorded 600 px Lenis flick: swings -0.64, +0.71, then settles). */
  accelGain: 0.011,
  /** Integrator substeps per frame, stable at 20 fps. */
  substeps: 4,
} as const;

/* ------------------------------ Output ------------------------------ */

export const OUTPUT = {
  /** Triangular dither after the sRGB encode: no banding in the dark gradients. */
  grain: 1.2 / 255,
} as const;

/* ------------------------------ Tiers ------------------------------ */

export interface TierSettings {
  /** Canvas device-pixel-ratio range (R3F clamps window.devicePixelRatio into it). */
  dpr: [number, number];
  /** sceneRT size relative to the drawing buffer. */
  sceneScale: number;
  /** sceneRT MSAA samples. */
  msaa: number;
  /** MSAA when the sceneRT exceeds LARGE_SCENE_PX (the transmission pass doubles the cost). */
  msaaLarge: number;
  /** Dispersion taps per pane pixel (a #define: one composite program per value). */
  taps: number;
  /** Ripple sim texel size. */
  simTexelCss: number;
  /** three's transmission pass size (always 4x MSAA HalfFloat, mipmapped) relative to the sceneRT. */
  transmissionScale: number;
  /** First blur level (1 = 1/2 CSS, 2 = 1/4): cheaper tiers skip a level, the frost size stays the same. */
  blurStartLevel: 1 | 2;
}

export const TIERS: Readonly<Record<SceneTier, TierSettings>> = {
  quality: { dpr: [1, 1.5], sceneScale: 1, msaa: 4, msaaLarge: 2, taps: 6, simTexelCss: 4, transmissionScale: 0.5, blurStartLevel: 1 },
  balanced: { dpr: [1, 1.25], sceneScale: 1, msaa: 2, msaaLarge: 2, taps: 4, simTexelCss: 4, transmissionScale: 0.4, blurStartLevel: 2 },
  // Touch screens land here: without MSAA the orb's silhouette stair-stepped at 0.75 scale.
  performance: { dpr: [1, 1.25], sceneScale: 0.75, msaa: 2, msaaLarge: 2, taps: 3, simTexelCss: 6, transmissionScale: 0.33, blurStartLevel: 2 },
};

/** Tiers from best to cheapest: the order the performance monitor steps through. */
export const TIER_ORDER: readonly SceneTier[] = ["quality", "balanced", "performance"];

/**
 * Above this many sceneRT pixels, MSAA drops to the tier's msaaLarge: at 1440x900@1.5 (2.9 Mpx)
 * 4x MSAA on the HalfFloat scene cost 167 MiB, 2x saves 67 MiB, and the DPR already smooths edges.
 */
export const LARGE_SCENE_PX = 2.0e6;

export const MONITOR = {
  /** Ignore the monitor while shaders compile and textures upload after the first frame. */
  warmupS: 4,
  /**
   * A decline is CPU-bound when the orb's field rebuild takes more than this share of the frame:
   * then no pipeline setting can win frames back, so the pipeline keeps its tier (the world steps
   * its field resolution instead).
   */
  cpuBoundShare: 0.5,
} as const;
