import { DataTexture, RGBAFormat, UnsignedByteType, Vector2, type ShaderMaterial, type Texture } from "three";
import { ANCHORS, GLASS_KINDS, GLASS_TINTS, MAX_SURFACES, anchorRects, glassFrame, type AnchorRect } from "../../glass/contract";
import { FROST, GUARD, KIND_LOOK, LIGHT, LOGO_BORDER, TAGLINE_BORDER, TAGLINE_SLOT, TINT_LOOK } from "./glass-config";
import { passMaterial } from "./fullscreen-pass";
import { LOGO_SLOTS, LogoEnergy, type ChargedLogo } from "./logo-energy";
import type { PoolSurfaces } from "./ripple-sim";
import { COMPOSITE_FRAG } from "./shaders/composite.frag";

/** Per-frame inputs of the composite that are not textures of the pipeline itself. */
export interface CompositeFrame {
  cssWidth: number;
  cssHeight: number;
  bufferWidth: number;
  bufferHeight: number;
  scene: Texture;
  frostMid: Texture;
  frost: Texture;
  ripple: Texture | null;
  rippleTexel: Vector2;
  rippleTexelCss: Vector2;
  glassOn: boolean;
  sceneFade: number;
  backgroundDim: number;
  /**
   * Under the CSS glass: the share of the narrow-screen dim the composite draws itself (0..1, 1 for
   * none), the part the CSS overlay (.scene::after) has handed over; applied after the copy guard,
   * where the overlay scaled the canvas. 1 under the WebGL glass (backgroundDim instead).
   */
  cssDim: number;
  /**
   * Under the CSS glass: 1 / the share of the canvas the CSS overlay still lets through, so the
   * energy light can be drawn to land at the WebGL strength after it; 1 once it is hidden, or otherwise.
   */
  overlayGain: number;
  bloomThreshold: number;
  scrollSpeed: number;
  slosh: number;
  pointerX: number;
  pointerY: number;
  pointerOn: boolean;
  pressX: number;
  pressY: number;
  /** CSS px/s: the press ring rides the ripple sim's wave front. */
  pressRingSpeed: number;
  bootT: number;
  bootOriginX: number;
  bootOriginY: number;
  frame: number;
  /** Scene seconds, wrapped at ELECTRICITY.timePeriodS: the border electricity's clock (holds while paused). */
  electricTime: number;
  /** The border electricity may crawl: false while paused and with reduced motion (the static focus glow then). */
  electricArcs: boolean;
}

interface KindArrays {
  lens: Float32Array;
  look: Float32Array;
  misc: Float32Array;
  /** sRGB-encoded fill colour (rgb), w unused. */
  fill: Float32Array;
  /** Fill alpha at the gradient's start, middle stop and end; w unused. */
  fillStops: Float32Array;
}

/**
 * Bare text over the scene: every rect the guard keeps dark (the practice hero's head counts too).
 * Never ANCHORS.heroBrand: the owner chose the hero's logo and tagline to sit OVER the orb
 * (choreography v2), their black letters read by a light outline of their own (v3.4), so no dark
 * plate is drawn under them.
 */
const GUARD_ANCHORS = [ANCHORS.copy, ANCHORS.practiceCopy] as const;

/** Static per-kind look, packed in GLASS_KINDS order (the registry's kind index). */
function kindArrays(): KindArrays {
  const size = 4 * GLASS_KINDS.length;
  const arrays: KindArrays = {
    lens: new Float32Array(size),
    look: new Float32Array(size),
    misc: new Float32Array(size),
    fill: new Float32Array(size),
    fillStops: new Float32Array(size),
  };
  GLASS_KINDS.forEach((kind, i) => {
    const k = KIND_LOOK[kind];
    arrays.lens.set([k.bevelFrac, k.bwMin, k.bwMax, k.lensPx], 4 * i);
    arrays.look.set([k.dispersion, k.kindFrost, k.baseTint, k.rimStrength], 4 * i);
    arrays.misc.set([k.rippleGainPx, k.textInsetPx, 0, 0], 4 * i);
    arrays.fill.set([k.fill.rgb[0] / 255, k.fill.rgb[1] / 255, k.fill.rgb[2] / 255, 0], 4 * i);
    arrays.fillStops.set([k.fill.stops[0], k.fill.stops[1], k.fill.stops[2], 0], 4 * i);
  });
  return arrays;
}

interface TintArrays {
  /** Fill colour (sRGB-encoded) and alpha. */
  fill: Float32Array;
  /** Hairline colour (sRGB-encoded) and alpha. */
  edge: Float32Array;
  /** Rim highlight colour (sRGB-encoded), w unused. */
  rim: Float32Array;
}

/** Tints in GLASS_TINTS order, sRGB-encoded (they are composited in sRGB space, like the CSS rgba). */
function tintArrays(): TintArrays {
  const size = 4 * GLASS_TINTS.length;
  const arrays: TintArrays = { fill: new Float32Array(size), edge: new Float32Array(size), rim: new Float32Array(size) };
  GLASS_TINTS.forEach((tint, i) => {
    const t = TINT_LOOK[tint];
    arrays.fill.set([t.rgb[0] / 255, t.rgb[1] / 255, t.rgb[2] / 255, t.alpha], 4 * i);
    const hairline = t.hairline ?? { rgb: [255, 255, 255] as const, alpha: LIGHT.hairlineAlpha };
    arrays.edge.set([hairline.rgb[0] / 255, hairline.rgb[1] / 255, hairline.rgb[2] / 255, hairline.alpha], 4 * i);
    const rim = t.rimRgb ?? [255, 255, 255];
    arrays.rim.set([rim[0] / 255, rim[1] / 255, rim[2] / 255, 0], 4 * i);
  });
  return arrays;
}

/** Copies a registry array, writing 0 for anything non-finite (three treats a NaN first element as an object array and throws). */
function copyFinite(source: Float32Array, target: Float32Array, used: number): void {
  for (let i = 0; i < target.length; i++) {
    const value = i < used ? source[i] : 0;
    target[i] = Number.isFinite(value) ? value : 0;
  }
}

function finiteRect(rect: AnchorRect): boolean {
  return Number.isFinite(rect.x) && Number.isFinite(rect.y) && Number.isFinite(rect.width) && Number.isFinite(rect.height);
}

/** The part of a rect inside the canvas, CSS px squared. */
function visibleArea(rect: AnchorRect, width: number, height: number): number {
  const w = Math.min(rect.x + rect.width, width) - Math.max(rect.x, 0);
  const h = Math.min(rect.y + rect.height, height) - Math.max(rect.y, 0);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Floats per logo slot in Composite.logo (the still's change test): its box, then its look. */
const LOGO_STATE_FLOATS = 8;

/** A logo's box with the outline's reach round it overlaps the canvas. */
function logoOnCanvas(logo: ChargedLogo, width: number, height: number): boolean {
  const reach = LOGO_BORDER.reachPx;
  return logo.x - reach < width && logo.x + logo.width + reach > 0 && logo.y - reach < height && logo.y + logo.height + reach > 0;
}

/** Stand-in ripple texture (flat water) when the sim cannot run. */
function flatWater(): DataTexture {
  const texture = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat, UnsignedByteType);
  texture.needsUpdate = true;
  return texture;
}

/**
 * The composite pass: owns the uniforms (shared by every TAPS variant of the material), the
 * NaN-guarded copy of the glass frame (which the ripple sim also uses for its pool walls), and the
 * anchors it reads this frame: the bare copy rects it guards, the logo cells it clears, and the
 * electric logos whose outlines it traces from their distance fields (the hero's border, always on
 * since v3.4, round its white outline; the hero tagline's outline, v3.4; the charge
 * under the pointer on the hero, the tagline and the partner and customer marks, v3.3:
 * logo-energy.ts, whose state the overlay's bolts also draw from).
 */
export class Composite {
  private readonly blank = flatWater();
  private readonly kinds = kindArrays();
  private readonly tints = tintArrays();
  private readonly variants = new Map<number, ShaderMaterial>();
  readonly surfaces: PoolSurfaces = {
    count: 0,
    rects: new Float32Array(4 * MAX_SURFACES),
    shape: new Float32Array(4 * MAX_SURFACES),
    state: new Float32Array(4 * MAX_SURFACES),
  };
  private readonly windows = new Float32Array(4 * MAX_SURFACES);
  /** Per surface: energy 0..1, the body inside it (centre x, y, radius), copied from glassFrame.energy. */
  readonly energy = new Float32Array(4 * MAX_SURFACES);
  /** Copy rects (centre x, y, half width, half height) the guard keeps dark this frame. */
  readonly guards = new Float32Array(4 * GUARD.maxRects);
  /** Logo cells (centre x, y, disc radius, 0) whose band frost thins this frame. */
  private readonly nodes = new Float32Array(4 * FROST.maxNodeDiscs);
  /** Scratch for picking the largest visible copy rects (no allocation per frame). */
  private readonly pickArea = new Float64Array(GUARD.maxRects);
  private readonly pickRect: (AnchorRect | null)[] = new Array<AnchorRect | null>(GUARD.maxRects).fill(null);
  /** The electric logos: their fields (the atlas), charge, bursts and the hero's rise. */
  readonly logos = new LogoEnergy();
  /** Per logo slot as drawn this frame: its box (CSS px) and look (outline, rest border, light, flash); zeros when off. The still compares it. */
  readonly logo = new Float32Array(LOGO_SLOTS * LOGO_STATE_FLOATS);
  private readonly logoRect = new Float32Array(4 * LOGO_SLOTS);
  private readonly logoMap = new Float32Array(4 * LOGO_SLOTS);
  private readonly logoView = new Float32Array(4 * LOGO_SLOTS);
  private readonly logoLook = new Float32Array(4 * LOGO_SLOTS);
  /** The logo records by slot, refilled each frame (no allocation). */
  private readonly logoRecords: ChargedLogo[] = [];

  readonly uniforms = {
    tScene: { value: null as Texture | null },
    tFrostMid: { value: null as Texture | null },
    tFrost: { value: null as Texture | null },
    tRipple: { value: this.blank as Texture },
    uCss: { value: new Vector2(1, 1) },
    uRes: { value: new Vector2(1, 1) },
    uRippleTexel: { value: new Vector2(1, 1) },
    uRippleTexelCss: { value: new Vector2(1, 1) },
    uRippleOn: { value: 0 },
    uGlassOn: { value: 0 },
    uSceneFade: { value: 0 },
    uBackgroundDim: { value: 1 },
    uCssDim: { value: 1 },
    uOverlayGain: { value: 1 },
    uBloomThreshold: { value: 1 },
    uScrollSpeed: { value: 0 },
    uSlosh: { value: 0 },
    uPointer: { value: new Vector2(-9999, -9999) },
    uPointerOn: { value: 0 },
    uPress: { value: new Vector2(-9999, -9999) },
    uPressRingSpeed: { value: 0 },
    uBootT: { value: -1 },
    uBootOrigin: { value: new Vector2() },
    uFrame: { value: 0 },
    uCount: { value: 0 },
    uRects: { value: this.surfaces.rects },
    uShape: { value: this.surfaces.shape },
    uState: { value: this.surfaces.state },
    uWindows: { value: this.windows },
    uEnergy: { value: this.energy },
    /** x: the electricity's clock (scene s, wrapped), y: 1 while its arcs may crawl. */
    uElectricity: { value: new Vector2(0, 0) },
    uKindLens: { value: this.kinds.lens },
    uKindLook: { value: this.kinds.look },
    uKindMisc: { value: this.kinds.misc },
    uKindFill: { value: this.kinds.fill },
    uKindFillStops: { value: this.kinds.fillStops },
    uTints: { value: this.tints.fill },
    uTintEdge: { value: this.tints.edge },
    uTintRim: { value: this.tints.rim },
    uGuardCount: { value: 0 },
    uGuards: { value: this.guards },
    uNodeCount: { value: 0 },
    uNodes: { value: this.nodes },
    /** The logo atlas (R: each logo's signed distance, its viewBox units); the blank stand-in until a logo is built. */
    tLogoField: { value: this.blank as Texture },
    /** Per logo slot (0 the hero, 1 the tagline, 2-3 marks): its viewBox's box on screen, left, top, width, height (CSS px); width 0 = none. */
    uLogoRect: { value: this.logoRect },
    /** ...its padded field in the atlas: the uv of its first texel's corner, its uv size... */
    uLogoMap: { value: this.logoMap },
    /** ...its viewBox's width and height, the field's pad (units), the crackle's scale... */
    uLogoView: { value: this.logoView },
    /** ...and its look: backing (the hero's and the tagline's outline), rest border (the hero's), charge light, flash (0..1 each). */
    uLogoLook: { value: this.logoLook },
    /** The tagline's line height (CSS px): its outline's width is a share of it (TAGLINE_BORDER.outlineShare). */
    uTaglineLinePx: { value: 0 },
  };

  /** The material for a dispersion tap count (TAPS is a #define, so one program per value). */
  material(taps: number): ShaderMaterial {
    let material = this.variants.get(taps);
    if (!material) {
      material = passMaterial(COMPOSITE_FRAG, this.uniforms, { TAPS: taps });
      material.name = `liquid-glass composite (${taps} taps)`;
      this.variants.set(taps, material);
    }
    return material;
  }

  /** Copy rects packed this frame (by packAnchors). */
  get guardCount(): number {
    return this.uniforms.uGuardCount.value;
  }

  /**
   * The composite draws the hero logo's outline and electric border: the page has it, its field is
   * built and it has finished its CSS rise (as of the last packAnchors). The canvas hands the logo's
   * legibility over on this (html[data-logo-energy]): from then on the outline here replaces its
   * CSS twin, the two crossing over LOGO_BORDER.fadeInS.
   */
  get logoActive(): boolean {
    return this.logos.heroActive;
  }

  /**
   * The composite draws the hero tagline's outline and border (its field fits its layout, it is on
   * the page and has risen): the canvas hands the tagline's CSS outline over on this
   * (html[data-tagline-energy]).
   */
  get taglineActive(): boolean {
    return this.logos.taglineActive;
  }

  /** The logo atlas (the verification harness reads the hero's grid from it: logoField.hero). */
  get logoField(): LogoEnergy["atlas"] {
    return this.logos.atlas;
  }

  /**
   * Copies this tick's glass frame (finite values only) for the composite and the pool walls, in
   * both glass modes (the registry packs both since 2026-11-02): with the CSS glass drawing, the
   * composite still draws the panel energy outside each pane, and the sim leaves its walls out.
   */
  packSurfaces(): PoolSurfaces {
    const count = Math.min(Math.max(Math.floor(glassFrame.count), 0), MAX_SURFACES);
    const used = 4 * (Number.isFinite(count) ? count : 0);
    this.surfaces.count = used / 4;
    copyFinite(glassFrame.rects, this.surfaces.rects, used);
    copyFinite(glassFrame.shape, this.surfaces.shape, used);
    copyFinite(glassFrame.state, this.surfaces.state, used);
    copyFinite(glassFrame.windows, this.windows, used);
    copyFinite(glassFrame.energy, this.energy, used);
    return this.surfaces;
  }

  /**
   * This tick's anchors (the registry refreshed them after the scroll): the largest visible copy
   * rects for the guard and the electric logos, in webgl and css mode alike, and, while the WebGL
   * glass draws, the visible logo cells for the bands' clearer discs. arcs: motion is allowed (not
   * paused, no reduced motion): bursts and bigger discharges happen. snap: reduced motion, a
   * logo's charge jumps to its hover (a static glow).
   */
  packAnchors(glassOn: boolean, cssWidth: number, cssHeight: number, nowMs: number, arcs: boolean, snap: boolean): void {
    this.packGuards(cssWidth, cssHeight);
    this.logos.update(nowMs, arcs, snap);
    this.packLogos(cssWidth, cssHeight);
    let nodes = 0;
    const logos = glassOn ? anchorRects.get(ANCHORS.logo) : undefined;
    if (logos) {
      for (const rect of logos) {
        if (nodes >= FROST.maxNodeDiscs) break;
        if (!rect.visible || !finiteRect(rect)) continue;
        const o = 4 * nodes++;
        this.nodes[o] = rect.x + rect.width / 2;
        this.nodes[o + 1] = rect.y + rect.height / 2;
        this.nodes[o + 2] = FROST.nodeDiscScale * Math.max(rect.width, rect.height);
        this.nodes[o + 3] = 0;
      }
    }
    this.nodes.fill(0, 4 * nodes);
    this.uniforms.uNodeCount.value = nodes;
  }

  /**
   * The logo slots from this frame's charge: the hero and the tagline (their outline whenever they
   * are drawn, the hero's rest border with it, their light with the charge) and the two mark
   * records (only while lit), each while its box, with the outline's reach round it, is on the
   * canvas. Off the canvas a slot is zeros, so scrolling past a logo never wakes the still.
   */
  private packLogos(cssWidth: number, cssHeight: number): void {
    const atlas = this.logos.atlas;
    const texture = atlas.texture;
    const records = this.logoRecords;
    records[0] = this.logos.hero;
    records[TAGLINE_SLOT] = this.logos.tagline;
    records[TAGLINE_SLOT + 1] = this.logos.marks[0];
    records[TAGLINE_SLOT + 2] = this.logos.marks[1];
    let drawn = false;
    for (let k = 0; k < LOGO_SLOTS; k++) {
      const logo = records[k];
      const slot = logo.slot;
      const o = 4 * k;
      const state = LOGO_STATE_FLOATS * k;
      const brand = k <= TAGLINE_SLOT;
      const lit = brand ? logo.fade > 0 : logo.index >= 0 && (logo.light > 0 || logo.flash > 0);
      if (!texture || !slot || !lit || !logoOnCanvas(logo, cssWidth, cssHeight)) {
        this.logoRect.fill(0, o, o + 4);
        this.logoMap.fill(0, o, o + 4);
        this.logoView.fill(0, o, o + 4);
        this.logoLook.fill(0, o, o + 4);
        this.logo.fill(0, state, state + LOGO_STATE_FLOATS);
        continue;
      }
      drawn = true;
      const rect = this.logoRect;
      rect[o] = logo.x;
      rect[o + 1] = logo.y;
      rect[o + 2] = logo.width;
      rect[o + 3] = logo.height;
      const map = this.logoMap;
      map[o] = slot.atlasX / atlas.width;
      map[o + 1] = slot.atlasY / atlas.height;
      map[o + 2] = slot.grid.width / atlas.width;
      map[o + 3] = slot.grid.height / atlas.height;
      const view = this.logoView;
      view[o] = slot.viewWidth;
      view[o + 1] = slot.viewHeight;
      view[o + 2] = slot.pad;
      // The crackle's lattice: the panels' at the reference size, finer on a smaller logo (the tagline: by its line height).
      const crackleSize = k === TAGLINE_SLOT ? logo.sizePx / TAGLINE_BORDER.crackleRefPx : logo.height / LOGO_BORDER.crackleRefPx;
      view[o + 3] = Math.min(Math.max(crackleSize, LOGO_BORDER.crackleMinScale), 1);
      // The hero and the tagline keep their backing (the outline, at their fade) and the hero its rest border; a mark has its charge's light only.
      const look = this.logoLook;
      look[o] = brand ? logo.fade : 0;
      look[o + 1] = brand ? logo.rest : 0;
      look[o + 2] = logo.light * logo.fade;
      look[o + 3] = logo.flash * logo.fade;
      for (let j = 0; j < 4; j++) {
        this.logo[state + j] = rect[o + j];
        this.logo[state + 4 + j] = look[o + j];
      }
    }
    // The tagline's line height scales its outline (its box is as many lines tall as the layout has).
    this.uniforms.uTaglineLinePx.value = this.logos.tagline.sizePx;
    this.uniforms.tLogoField.value = drawn && texture ? texture : this.blank;
  }

  /** The top GUARD.maxRects visible copy rects by on-screen area (more than that is rare: a hero has two). */
  private packGuards(width: number, height: number): void {
    const max = GUARD.maxRects;
    let picked = 0;
    for (const name of GUARD_ANCHORS) {
      const list = anchorRects.get(name);
      if (!list) continue;
      for (const rect of list) {
        if (!rect.visible || !finiteRect(rect)) continue;
        const area = visibleArea(rect, width, height);
        if (!(area > 0) || (picked === max && area <= this.pickArea[max - 1])) continue;
        if (picked < max) picked++;
        let j = picked - 1;
        while (j > 0 && this.pickArea[j - 1] < area) {
          this.pickArea[j] = this.pickArea[j - 1];
          this.pickRect[j] = this.pickRect[j - 1];
          j--;
        }
        this.pickArea[j] = area;
        this.pickRect[j] = rect;
      }
    }
    for (let i = 0; i < picked; i++) {
      const rect = this.pickRect[i];
      if (!rect) continue;
      const o = 4 * i;
      this.guards[o] = rect.x + rect.width / 2;
      this.guards[o + 1] = rect.y + rect.height / 2;
      this.guards[o + 2] = rect.width / 2;
      this.guards[o + 3] = rect.height / 2;
    }
    this.guards.fill(0, 4 * picked);
    this.pickRect.fill(null);
    this.uniforms.uGuardCount.value = picked;
  }

  setFrame(f: CompositeFrame): void {
    const u = this.uniforms;
    u.tScene.value = f.scene;
    u.tFrostMid.value = f.frostMid;
    u.tFrost.value = f.frost;
    u.tRipple.value = f.ripple ?? this.blank;
    u.uRippleOn.value = f.ripple ? 1 : 0;
    u.uCss.value.set(f.cssWidth, f.cssHeight);
    u.uRes.value.set(f.bufferWidth, f.bufferHeight);
    u.uRippleTexel.value.copy(f.rippleTexel);
    u.uRippleTexelCss.value.copy(f.rippleTexelCss);
    u.uGlassOn.value = f.glassOn ? 1 : 0;
    u.uSceneFade.value = f.sceneFade;
    u.uBackgroundDim.value = f.backgroundDim;
    // The shader divides by it: a share in (0, 1], or none.
    u.uCssDim.value = Number.isFinite(f.cssDim) && f.cssDim > 0 && f.cssDim <= 1 ? f.cssDim : 1;
    u.uOverlayGain.value = Number.isFinite(f.overlayGain) && f.overlayGain >= 1 ? f.overlayGain : 1;
    u.uBloomThreshold.value = f.bloomThreshold;
    u.uScrollSpeed.value = Number.isFinite(f.scrollSpeed) ? f.scrollSpeed : 0;
    u.uSlosh.value = Number.isFinite(f.slosh) ? f.slosh : 0;
    u.uPointer.value.set(Number.isFinite(f.pointerX) ? f.pointerX : -9999, Number.isFinite(f.pointerY) ? f.pointerY : -9999);
    u.uPointerOn.value = f.pointerOn ? 1 : 0;
    u.uPress.value.set(f.pressX, f.pressY);
    u.uPressRingSpeed.value = Number.isFinite(f.pressRingSpeed) ? f.pressRingSpeed : 0;
    u.uBootT.value = f.bootT;
    u.uBootOrigin.value.set(f.bootOriginX, f.bootOriginY);
    u.uFrame.value = f.frame;
    u.uElectricity.value.set(Number.isFinite(f.electricTime) ? f.electricTime : 0, f.electricArcs ? 1 : 0);
    u.uCount.value = this.surfaces.count;
  }

  dispose(): void {
    for (const material of this.variants.values()) material.dispose();
    this.variants.clear();
    this.blank.dispose();
    this.logos.dispose();
  }
}
