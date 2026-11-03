/*
 * The electric logos' bolts and sparks (v3.3, brief A; v3.4): a small overlay pass drawn after the
 * composite onto the canvas, still under the DOM (the logos' glyphs sit over it).
 * Real lightning: each bolt is a midpoint-displacement polyline between two points, with a branch
 * or two, made again every 50-90 ms (LOGO_ARCS.lifeS) so it flickers and jumps: across a logo's
 * gaps and counters (outline points facing each other, logo-field.ts), from the hero's edges into
 * the orb behind it, from a mark to its circuit node, and short streamers off the outline. Every
 * point is kept outside the silhouette (the field, on the CPU), so a bolt rides the gaps, never the
 * glyphs. Sparks fly off where a new bolt touches the outline; a bigger discharge adds a small
 * flash where it lands, and a mark's burst one over the mark.
 *
 * v3.4: the hero has small arcs at rest too (its border is always on: LOGO_ARCS.heroRest), and a
 * click or a tap on the hero is the thunder: long branching bolts that leave its outline and shoot
 * outward into the scene, each
 * growing out from the outline, then flickering and fading, and sparks flung outward
 * (LOGO_ARCS.thunder). No flash (owner, 2026-11-02 evening: "remove the blinding flash when
 * clicking the logo"): the bolts carry their own light, and nothing lights the area round the
 * logo. The hero tagline has none: its hover border is the composite's alone, with no arcs and no
 * sparks (owner, 2026-11-02 evening: "keep only the electric border (without the sparkles)"), and
 * no bolt of the hero's reaches into its box (its text sits there).
 *
 * Cost: rebuilt on the CPU each frame something is lit, a few hundred vertices at rest or at a full
 * charge, about 4,000 in the thunder, one draw call; nothing while no logo is on screen. While the
 * thunder is grown it also marks a coarse grid over the canvas (12 px cells, a bit per bolt) to
 * trim its sheaths where bolts run together. Never
 * drawn while paused, with reduced motion, or before its program has linked (it compiles off the
 * main thread the first time a logo is drawable).
 */

import {
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  DoubleSide,
  DynamicDrawUsage,
  GLSL3,
  Mesh,
  OneFactor,
  OneMinusDstColorFactor,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  ZeroFactor,
  type WebGLRenderer,
} from "three";
import type { AnchorRect } from "../../glass/contract";
import { motion } from "../../motion/store";
import { LOGO_ARCS, LOGO_CHARGE } from "./glass-config";
import { LOGO_HERO, LOGO_NONE, logoDistancePx, type ChargedLogo } from "./logo-energy";
import { slotNormal } from "./logo-field";
import { ProgramValidator } from "./program-check";
import { ARCS_FRAG, ARCS_VERT } from "./shaders/arcs";

type BoltKind = "gap" | "orb" | "streamer" | "node";

/** Which bolts a logo record has. */
type LogoKind = "hero" | "mark";

/** A main bolt's points (2^levels + 1) and a branch's. */
const MAIN_POINTS = (1 << LOGO_ARCS.levels) + 1;
const BRANCH_POINTS = (1 << LOGO_ARCS.branchLevels) + 1;
const MAX_BRANCHES = 2;

const THUNDER = LOGO_ARCS.thunder;

/** A thunder bolt's points and a thunder branch's. */
const THUNDER_POINTS = (1 << THUNDER.levels) + 1;
const THUNDER_BRANCH_POINTS = (1 << THUNDER.branchLevels) + 1;

/** A bolt touches the outline this far past it (CSS px): just beyond the glyph's antialiased edge. */
const CONTACT_PX = 0.8;

/** A bolt into the orb ends at least this far from the glyphs (CSS px), else it is drawn again elsewhere. */
const ORB_END_CLEAR_PX = 6;

/** ...and inside the orb's disc, at this share of its radius at most. */
const ORB_END_SHARE = 0.95;

/** Attempts at a valid bolt before a channel waits for its next turn. */
const TRIES = 4;

/** Attempts at a thunder bolt that keeps off the tagline before it is left out (most directions are free: up and sideways). */
const THUNDER_TRIES = 6;

/** Outline points looked at for the one nearest a thunder bolt's angle: enough to spread the bolts round the logo. */
const THUNDER_CANDIDATES = 6;

/** A thunder bolt's straight path must keep this far off the tagline's box (CSS px): its jag then rarely reaches it. */
const THUNDER_SHIELD_PX = 14;

/** Points sampled along a thunder bolt's straight path for that test. */
const THUNDER_PATH_SAMPLES = 10;

/** A thunder bolt is at least this long (shares of the logo's height): one from the S's tip still shoots out. */
const THUNDER_MIN_LENGTH = 0.35;

/** A thunder branch forks off within this share of its bolt (its first part), so it has room to shoot out too. */
const THUNDER_FORK = [0.12, 0.7] as const;

/** A thunder bolt's light varies by this share from bolt to bolt: some strike harder. */
const THUNDER_LIGHT_SPREAD = 0.2;

/** A thunder bolt fades with this power of its time left once grown: quick at first, then a glowing trail. */
const THUNDER_FADE_POWER = 1.5;

/** A thunder branch is this much thinner than its bolt (strip and core). */
const THUNDER_BRANCH_WIDTH = 0.7;

/** Sparks off each thunder bolt's root as it leaves the outline (at the reference size: thunderScale). */
const THUNDER_ROOT_SPARKS = 2;

/** A scaled-down thunder bolt's core keeps at least this half width (CSS px): a crisp line, never a hair. */
const THUNDER_MIN_CORE_PX = 1;

/**
 * Where thunder bolts run together (their roots on the outline, their crossings) their
 * screen-blended sheaths sum into a haze round the logo: there each bolt's sheath falloff is
 * divided by the number of bolts sharing the spot, so a bundle glows about as one bolt does, and
 * the cores, the count and the reach stay. A spot is a cell this big (CSS px, two sheath
 * falloffs) with its eight neighbours: bolts within ~12-24 px of each other...
 */
const OVERLAP_CELL_PX = 12;

/** ...and a bundled bolt keeps at least this falloff (CSS px), just past its 1.6 px core: a thin blue edge, never a bare wire. */
const OVERLAP_MIN_GLOW_PX = 2;

/** A channel whose bolt found no valid path tries again this soon (s). */
const RETRY_S = 0.03;

/** A bolt's light re-rolls each frame between this share and full: the flicker within its 50-90 ms. */
const FLICKER_FLOOR = 0.7;

/** While the charge builds (and at rest), the bolts start at this share of their light. */
const BUILD_LIGHT_FLOOR = 0.5;

/** A streamer fades toward its free end, to this share. */
const STREAMER_TIP_LIGHT = 0.2;

/** A spark's tail starts at this share of its head's light. */
const SPARK_TAIL_LIGHT = 0.3;

/** A mark's sparks fly at this share of the hero's speed (a 56 px mark, not a 190 px lockup). */
const MARK_SPARK_SPEED = 0.5;

/** A burst's flash dies over this share of the burst's own fade. */
const BURST_FLASH_SHARE = 0.5;

/** A burst's flash covers this much more than a bigger discharge's (shares of the logo's height). */
const BURST_FLASH_SCALE = 1.6;

/** Logos further than this off the canvas (CSS px) are not drawn (the hero's thunder reaches further: its margin in updateLogo). */
const OFF_CANVAS_PX = 120;

/** The tagline's box, grown by this (CSS px), is where no hero bolt or spark goes: its glyphs and their outline. */
const SHIELD_PX = 8;

/** Flashes alive at most: bigger discharges' (one per lit logo at a time) and a few quick taps' bursts on a mark, with room to spare. */
const MAX_FLASHES = 10;

/** Where a bolt may fork: its quarter points. */
const BRANCH_AT = [0.25, 0.75] as const;
const FLOATS_POSITION = 3;
const FLOATS_PROFILE = 4;
const FLOATS_SIZE = 2;

interface Bolt {
  kind: BoltKind;
  /** Its rank among its logo's bolts of this kind: it shows while rank < the number wanted. */
  rank: number;
  on: boolean;
  /** Overlay time (s) when the current bolt, or the rest between two, ends. */
  until: number;
  light: number;
  halfWidth: number;
  core: number;
  /** Fades toward its far end (a streamer's free end). */
  taper: boolean;
  main: Float32Array;
  count: number;
  branches: Float32Array;
  branchCounts: number[];
  branchCount: number;
}

/** One bolt of the thunder: made once, grown out over grow, then flickering and fading until life. */
interface ThunderBolt {
  on: boolean;
  /** Overlay time (s) it starts to grow (spawns are spread over THUNDER.spawnS), its growth and its life from then. */
  born: number;
  grow: number;
  life: number;
  /** Overlay time of its one restrike, or -1 for none. */
  restrikeAt: number;
  light: number;
  main: Float32Array;
  count: number;
  /** Its direction, for the sparks off its tip. */
  dirX: number;
  dirY: number;
  tipSparked: boolean;
  /** Its widths' and sparks' share of the reference hero's (thunderScale): smaller on a smaller logo. */
  scale: number;
  branches: Float32Array;
  /** Each branch's fork point (an index into main) and point count. */
  branchFrom: number[];
  branchCounts: number[];
  branchCount: number;
}

/** The bolts of one logo record (the hero's or one of the two mark records), by identity. */
interface LogoBolts {
  /** The logo index its bolts were made for: a record re-used for another mark drops them. */
  index: number;
  bolts: Bolt[];
  /** The hero's thunder pool (empty for the others), and the next one to take (the oldest). */
  thunder: ThunderBolt[];
  thunderNext: number;
  /** The last burst and bigger discharge it has seen. */
  burstAt: number;
  bigAt: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  gravity: number;
}

interface Flash {
  x: number;
  y: number;
  radius: number;
  age: number;
  life: number;
  light: number;
}

interface EdgePoint {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

function between(range: readonly [number, number]): number {
  return range[0] + Math.random() * (range[1] - range[0]);
}

/** The set bits of a 32-bit integer (the overlap grid's bolts in a spot). */
function popcount(bits: number): number {
  let v = bits - ((bits >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

function kindOf(logo: ChargedLogo): LogoKind {
  return logo.index === LOGO_HERO ? "hero" : "mark";
}

/** A kind's bolt counts: at rest, at a full charge, and what a burst adds (zero where a kind has none). */
function countsOf(kind: LogoKind): { rest: Record<string, number>; base: Record<string, number>; burst: Record<string, number> } {
  if (kind === "hero") return { rest: LOGO_ARCS.heroRest, base: LOGO_ARCS.hero, burst: LOGO_ARCS.heroBurst };
  return { rest: {}, base: LOGO_ARCS.mark, burst: LOGO_ARCS.markBurst };
}

function makeBolt(kind: BoltKind, rank: number): Bolt {
  return {
    kind,
    rank,
    on: false,
    until: 0,
    light: 0,
    halfWidth: LOGO_ARCS.halfWidthPx,
    core: LOGO_ARCS.coreHalfPx,
    taper: false,
    main: new Float32Array(2 * MAIN_POINTS),
    count: 0,
    branches: new Float32Array(2 * MAX_BRANCHES * BRANCH_POINTS),
    branchCounts: [0, 0],
    branchCount: 0,
  };
}

/**
 * The thunder's widths and spark counts for this logo, as a share of the reference hero's
 * (THUNDER.refHeightPx): its height over that, never above 1, never below THUNDER.minScale.
 */
function thunderScale(logo: ChargedLogo): number {
  const share = logo.height / THUNDER.refHeightPx;
  return Number.isFinite(share) ? Math.min(Math.max(share, THUNDER.minScale), 1) : 1;
}

/** A reference spark count at a thunder's scale, one at least. */
function sparksFor(count: number, scale: number): number {
  return Math.max(1, Math.round(count * scale));
}

function makeThunderBolt(): ThunderBolt {
  return {
    on: false,
    born: 0,
    grow: 1,
    life: 1,
    restrikeAt: -1,
    light: 0,
    main: new Float32Array(2 * THUNDER_POINTS),
    count: 0,
    dirX: 0,
    dirY: -1,
    tipSparked: false,
    scale: 1,
    branches: new Float32Array(2 * THUNDER.branches * THUNDER_BRANCH_POINTS),
    branchFrom: new Array<number>(THUNDER.branches).fill(0),
    branchCounts: new Array<number>(THUNDER.branches).fill(0),
    branchCount: 0,
  };
}

/** A logo record's bolts: as many of each kind as its rest, a full charge and a burst can want. */
function makeLogoBolts(kind: LogoKind): LogoBolts {
  const { rest, base, burst } = countsOf(kind);
  const bolts: Bolt[] = [];
  for (const type of Object.keys(base) as BoltKind[]) {
    const most = Math.max(rest[type] ?? 0, base[type]) + (burst[type] ?? 0);
    for (let rank = 0; rank < most; rank++) bolts.push(makeBolt(type, rank));
  }
  const thunder = kind === "hero" ? Array.from({ length: THUNDER.pool }, makeThunderBolt) : [];
  return { index: Number.NaN, bolts, thunder, thunderNext: 0, burstAt: 0, bigAt: 0 };
}

/**
 * Fills out with a midpoint-displacement polyline of 2^levels + 1 points from a to b: each halving
 * moves every midpoint across its segment by up to roughness x the segment's length (the first
 * halving by firstRoughness: a long bolt's overall bend). Returns the count.
 */
function displace(
  out: Float32Array,
  offset: number,
  levels: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  roughness: number,
  firstRoughness = roughness,
): number {
  const n = (1 << levels) + 1;
  const o = 2 * offset;
  out[o] = ax;
  out[o + 1] = ay;
  out[o + 2 * (n - 1)] = bx;
  out[o + 2 * (n - 1) + 1] = by;
  for (let span = n - 1; span > 1; span >>= 1) {
    const half = span >> 1;
    const rough = span === n - 1 ? firstRoughness : roughness;
    for (let i = 0; i < n - 1; i += span) {
      const a = o + 2 * i;
      const b = o + 2 * (i + span);
      const m = o + 2 * (i + half);
      const dx = out[b] - out[a];
      const dy = out[b + 1] - out[a + 1];
      const across = (Math.random() * 2 - 1) * rough;
      out[m] = (out[a] + out[b]) / 2 - dy * across;
      out[m + 1] = (out[a + 1] + out[b + 1]) / 2 + dx * across;
    }
  }
  return n;
}

/**
 * The overlay: owns the bolts, sparks and flashes, their geometry and the screen-blend material.
 * update() once per composited frame with motion allowed; render() right after the composite.
 */
export class LogoArcs {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new BufferGeometry();
  private readonly material: ShaderMaterial;
  private readonly positions = new Float32Array(LOGO_ARCS.maxVertices * FLOATS_POSITION);
  private readonly profiles = new Float32Array(LOGO_ARCS.maxVertices * FLOATS_PROFILE);
  private readonly sizes = new Float32Array(LOGO_ARCS.maxVertices * FLOATS_SIZE);
  private readonly indices = new Uint16Array(LOGO_ARCS.maxVertices * 3);
  private readonly attributes: BufferAttribute[];
  private readonly indexAttribute: BufferAttribute;
  private readonly uniforms = { uCss: { value: new Vector2(1, 1) }, uGain: { value: 1 } };
  private readonly validator = new ProgramValidator();
  private program: "idle" | "compiling" | "compiled" | "failed" = "idle";
  private readonly logos = new Map<ChargedLogo, LogoBolts>();
  /** Pools (no allocation per frame): the first sparkCount and flashCount are alive. */
  private readonly sparks: Spark[] = Array.from({ length: LOGO_ARCS.maxSparks }, () => ({ x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, gravity: 0 }));
  private readonly flashes: Flash[] = Array.from({ length: MAX_FLASHES }, () => ({ x: 0, y: 0, radius: 0, age: 0, life: 1, light: 0 }));
  private sparkCount = 0;
  private flashCount = 0;
  /** A logo is on the page this frame: the program is compiled then, before its first bolt. */
  private wanted = false;
  private readonly edge: EdgePoint = { x: 0, y: 0, nx: 0, ny: 0 };
  private readonly normal = { x: 0, y: 0 };
  /** A spark's streak: tail, head. */
  private readonly streak = new Float32Array(4);
  /** The grown part of a thunder bolt or branch, as drawn this frame. */
  private readonly grown = new Float32Array(2 * THUNDER_POINTS);
  /**
   * The thunder's overlap grid this frame (OVERLAP_CELL_PX cells over the canvas): per cell a bit
   * per pool bolt grown through it; overlapCols 0 while no thunder is grown. Re-allocated only
   * when the canvas grows past it.
   */
  private overlap = new Uint32Array(0);
  private overlapCols = 0;
  private overlapRows = 0;
  private vertexCount = 0;
  private indexCount = 0;
  /** Overlay seconds: scene time while something is lit. */
  private time = 0;
  /**
   * Where the logo being drawn sends no bolt: the text by it. The hero: the tagline's box (grown by
   * SHIELD_PX), or without one everything below its box by taglineClearPx across its lockup; a
   * mark: below its box (its name).
   */
  private zoneTop = Number.POSITIVE_INFINITY;
  private zoneBottom = Number.POSITIVE_INFINITY;
  private zoneLeft = 0;
  private zoneRight = 0;

  constructor() {
    this.attributes = [
      new BufferAttribute(this.positions, FLOATS_POSITION),
      new BufferAttribute(this.profiles, FLOATS_PROFILE),
      new BufferAttribute(this.sizes, FLOATS_SIZE),
    ];
    for (const attribute of this.attributes) attribute.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute("position", this.attributes[0]);
    this.geometry.setAttribute("aProf", this.attributes[1]);
    this.geometry.setAttribute("aSize", this.attributes[2]);
    this.indexAttribute = new BufferAttribute(this.indices, 1);
    this.indexAttribute.setUsage(DynamicDrawUsage);
    this.geometry.setIndex(this.indexAttribute);
    this.geometry.setDrawRange(0, 0);
    this.material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: ARCS_VERT,
      fragmentShader: ARCS_FRAG,
      uniforms: this.uniforms,
      // Screen blend, src x (1 - dst) + dst: light that never darkens, as the composite's own.
      transparent: true,
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: OneMinusDstColorFactor,
      blendDst: OneFactor,
      blendSrcAlpha: ZeroFactor,
      blendDstAlpha: OneFactor,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      // A jagged bolt's strip folds over itself at its sharpest turns, and a folded quad faces away:
      // both faces draw, or the fold would cut the bolt's core into pieces (the thunder's long bolts showed it).
      side: DoubleSide,
    });
    this.material.name = "electric logos (bolts, sparks)";
    const mesh = new Mesh(this.geometry, this.material);
    // Rebuilt in place every frame in CSS px; bounds would always be stale and the matrices mean nothing here.
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    this.scene.matrixWorldAutoUpdate = false;
    this.scene.add(mesh);
  }

  /** The program failed to link: the logos keep their composite light only. */
  get failed(): boolean {
    return this.program === "failed";
  }

  /**
   * One frame's bolts. logos: the hero's record, then the two mark records (by
   * identity, as logo-energy.ts keeps them). dt: scene seconds. arcs: motion is allowed (else
   * everything goes out at once: paused or reduced motion draws no bolt, spark or flash). brand: the
   * hero's lockup, tagline: the tagline's box (no bolt of the hero's goes there), each or null.
   */
  update(
    logos: readonly ChargedLogo[],
    dt: number,
    arcs: boolean,
    brand: AnchorRect | null,
    tagline: AnchorRect | null,
    cssWidth: number,
    cssHeight: number,
  ): void {
    this.vertexCount = 0;
    this.indexCount = 0;
    this.wanted = false;
    for (const logo of logos) if (logo.slot && logo.fade > 0) this.wanted = true;
    if (!arcs || this.program === "failed") {
      this.clear();
      return;
    }
    this.time += dt;
    for (const logo of logos) {
      let set = this.logos.get(logo);
      if (!set) {
        set = makeLogoBolts(kindOf(logo));
        this.logos.set(logo, set);
      }
      this.updateLogo(logo, set, brand, tagline, cssWidth, cssHeight);
    }
    this.updateSparks(dt, tagline && tagline.width > 0 && tagline.height > 0 ? tagline : null);
    this.updateFlashes(dt);
    this.upload();
  }

  /** Draws this frame's geometry onto the canvas (bound by the caller), if any. gain: the scene's fade x the CSS overlay's compensation. */
  render(gl: WebGLRenderer, cssWidth: number, cssHeight: number, gain: number): void {
    if (!this.wanted || !this.ready(gl) || this.indexCount === 0) return;
    this.uniforms.uCss.value.set(cssWidth, cssHeight);
    this.uniforms.uGain.value = Number.isFinite(gain) ? Math.min(Math.max(gain, 0), 2) : 1;
    gl.render(this.scene, this.camera);
  }

  /** Compiles the program off the main thread the first time it is needed; true once it may draw. */
  private ready(gl: WebGLRenderer): boolean {
    if (this.program === "idle") {
      this.program = "compiling";
      const done = (): void => {
        if (this.program === "compiling") this.program = "compiled";
      };
      try {
        if (gl.extensions.has("KHR_parallel_shader_compile")) {
          gl.compileAsync(this.scene, this.camera).then(done, () => {
            this.program = "failed";
          });
        } else {
          gl.compile(this.scene, this.camera);
          done();
        }
      } catch {
        this.program = "failed";
      }
    }
    if (this.program !== "compiled") return false;
    if (this.validator.status(gl, this.material) === "failed") {
      this.program = "failed";
      console.warn("[scene] The logos' bolts failed to link; their outline light stays.");
      return false;
    }
    return true;
  }

  private clear(): void {
    for (const set of this.logos.values()) {
      for (const bolt of set.bolts) bolt.on = false;
      for (const bolt of set.thunder) bolt.on = false;
    }
    this.sparkCount = 0;
    this.flashCount = 0;
    this.geometry.setDrawRange(0, 0);
  }

  /** Where the logo being drawn sends no bolt (see zoneTop). */
  private setZone(logo: ChargedLogo, kind: LogoKind, brand: AnchorRect | null, tagline: AnchorRect | null): void {
    if (kind === "hero" && tagline) {
      this.zoneTop = tagline.y - SHIELD_PX;
      this.zoneBottom = tagline.y + tagline.height + SHIELD_PX;
      this.zoneLeft = tagline.x - SHIELD_PX;
      this.zoneRight = tagline.x + tagline.width + SHIELD_PX;
      return;
    }
    this.zoneTop = logo.y + logo.height + LOGO_ARCS.taglineClearPx;
    this.zoneBottom = Number.POSITIVE_INFINITY;
    this.zoneLeft = kind === "hero" && brand ? Math.min(brand.x, logo.x) : logo.x - LOGO_ARCS.halfWidthPx;
    this.zoneRight = kind === "hero" && brand ? Math.max(brand.x + brand.width, logo.x + logo.width) : logo.x + logo.width + LOGO_ARCS.halfWidthPx;
  }

  private updateLogo(logo: ChargedLogo, set: LogoBolts, brand: AnchorRect | null, tagline: AnchorRect | null, cssWidth: number, cssHeight: number): void {
    const kind = kindOf(logo);
    const hero = kind === "hero";
    if (set.index !== logo.index) {
      set.index = logo.index;
      for (const bolt of set.bolts) {
        bolt.on = false;
        bolt.until = 0;
      }
      set.burstAt = logo.burstAt;
      set.bigAt = logo.bigAt;
    }
    // The thunder reaches up to three times the logo's size: it keeps drawing while any of that is on the canvas.
    const margin = hero ? OFF_CANVAS_PX + 2 * Math.max(logo.width, logo.height) : OFF_CANVAS_PX;
    const offCanvas = logo.x > cssWidth + margin || logo.x + logo.width < -margin || logo.y > cssHeight + margin || logo.y + logo.height < -margin;
    if (logo.index === LOGO_NONE || !logo.slot || logo.fade <= 0 || offCanvas) {
      for (const bolt of set.bolts) bolt.on = false;
      for (const bolt of set.thunder) bolt.on = false;
      return;
    }
    this.setZone(logo, kind, brand, tagline && tagline.width > 0 && tagline.height > 0 ? tagline : null);
    const { rest, base, burst: extra } = countsOf(kind);
    // A new burst: on the hero the thunder; on a mark every arc at once, a flash and a shower of sparks.
    const burst = logo.burstAt !== set.burstAt;
    set.burstAt = logo.burstAt;
    if (burst && hero) this.thunder(logo, set);
    else if (burst) {
      this.flash(logo.x + logo.width / 2, logo.y + logo.height / 2, LOGO_ARCS.flashRadius * BURST_FLASH_SCALE * logo.height, LOGO_CHARGE.burstS * BURST_FLASH_SHARE, 1);
      const edges = logo.slot.edges.length / 4;
      for (let k = 0; k < LOGO_ARCS.burstSparks / 2 && edges > 0; k++) {
        this.edgePoint(logo, Math.floor(Math.random() * edges));
        this.spark(this.edge, MARK_SPARK_SPEED);
      }
    }
    // A new bigger discharge: the first bolt into the orb (or to the node) thick and bright, and a flash where it lands.
    const big = logo.bigAt !== set.bigAt;
    set.bigAt = logo.bigAt;
    const charged = Math.min(logo.light + logo.burst, 1);
    const dim = BUILD_LIGHT_FLOOR + (1 - BUILD_LIGHT_FLOOR) * charged;
    // At rest the small arcs sit out more turns than a charged logo's: they pop in and out.
    const restChance = LOGO_ARCS.restRestChance + (LOGO_ARCS.restChance - LOGO_ARCS.restRestChance) * charged;
    for (const bolt of set.bolts) {
      const count = Math.max((rest[bolt.kind] ?? 0) * logo.rest, base[bolt.kind] * logo.light) + (extra[bolt.kind] ?? 0) * logo.burst;
      const wanted = bolt.rank < Math.round(count);
      const bigOne = big && bolt.rank === 0 && (bolt.kind === "orb" || bolt.kind === "node");
      if (bigOne || (burst && wanted) || this.time >= bolt.until) {
        if (!wanted && !bigOne) {
          bolt.on = false;
          bolt.until = this.time;
        } else if (!bigOne && !burst && bolt.on && Math.random() < restChance) {
          bolt.on = false;
          bolt.until = this.time + between(LOGO_ARCS.restS);
        } else if (this.make(bolt, logo, kind, bigOne)) {
          bolt.on = true;
          bolt.until = this.time + between(LOGO_ARCS.lifeS);
          if (bigOne) {
            const end = 2 * (bolt.count - 1);
            this.flash(bolt.main[end], bolt.main[end + 1], LOGO_ARCS.flashRadius * logo.height, LOGO_CHARGE.bigFlashS, 1);
          }
        } else {
          bolt.on = false;
          bolt.until = this.time + RETRY_S;
        }
      }
      if (!bolt.on) continue;
      const light = bolt.light * dim * logo.fade * (FLICKER_FLOOR + (1 - FLICKER_FLOOR) * Math.random());
      this.strip(bolt.main, 0, bolt.count, bolt.halfWidth, bolt.core, light, bolt.taper ? light * STREAMER_TIP_LIGHT : light, 0);
      for (let b = 0; b < bolt.branchCount; b++) {
        this.strip(bolt.branches, b * BRANCH_POINTS, bolt.branchCounts[b], bolt.halfWidth, bolt.core * LOGO_ARCS.branchCore, light * LOGO_ARCS.branchLight, 0, 0);
      }
    }
    if (hero) this.drawThunder(logo, set, cssWidth, cssHeight);
  }

  /** A logo's outline point i in client px, a contact's width outside it, with its normal, into this.edge. */
  private edgePoint(logo: ChargedLogo, i: number): EdgePoint {
    const e = logo.slot?.edges;
    const out = this.edge;
    if (!e) return out;
    out.nx = e[4 * i + 2];
    out.ny = e[4 * i + 3];
    out.x = logo.x + e[4 * i] * logo.unitPx + out.nx * CONTACT_PX;
    out.y = logo.y + e[4 * i + 1] * logo.unitPx + out.ny * CONTACT_PX;
    return out;
  }

  /** In the zone the logo being drawn sends no bolt to. */
  private inZone(x: number, y: number): boolean {
    return y > this.zoneTop && y < this.zoneBottom && x > this.zoneLeft && x < this.zoneRight;
  }

  /** A new shape for a bolt of its kind; false when no valid one was found this turn. */
  private make(bolt: Bolt, logo: ChargedLogo, kind: LogoKind, big: boolean): boolean {
    const slot = logo.slot;
    if (!slot) return false;
    const edges = slot.edges.length / 4;
    if (edges === 0) return false;
    const hero = kind === "hero";
    bolt.light = big ? LOGO_ARCS.bigLight : 1;
    bolt.halfWidth = LOGO_ARCS.halfWidthPx * (big ? LOGO_ARCS.bigWidth : 1);
    bolt.core = LOGO_ARCS.coreHalfPx * (big ? LOGO_ARCS.bigWidth : 1);
    bolt.taper = false;
    bolt.branchCount = 0;
    const sparkSpeed = hero ? 1 : MARK_SPARK_SPEED;
    const e = this.edge;
    let ax = 0;
    let ay = 0;
    let bx = 0;
    let by = 0;
    let found = false;
    let roughness: number = LOGO_ARCS.roughness;
    let keepTo = MAIN_POINTS;
    switch (bolt.kind) {
      case "gap": {
        const pairs = slot.gaps.length / 2;
        if (pairs === 0) return false;
        const p = Math.floor(Math.random() * pairs);
        this.edgePoint(logo, slot.gaps[2 * p + 1]);
        bx = e.x;
        by = e.y;
        this.edgePoint(logo, slot.gaps[2 * p]);
        ax = e.x;
        ay = e.y;
        found = !this.inZone(ax, ay) && !this.inZone(bx, by);
        if (!found) break;
        // Sparks where it touches the outline, at both ends.
        this.spark(e, sparkSpeed, LOGO_ARCS.sparkChance);
        this.edgePoint(logo, slot.gaps[2 * p + 1]);
        this.spark(e, sparkSpeed, LOGO_ARCS.sparkChance);
        break;
      }
      case "orb":
      case "streamer": {
        const orb = motion.orb;
        const range = bolt.kind === "orb" ? LOGO_ARCS.orbLength : hero ? LOGO_ARCS.heroStreamer : LOGO_ARCS.markStreamer;
        for (let t = 0; t < TRIES && !found; t++) {
          this.edgePoint(logo, Math.floor(Math.random() * edges));
          const turn = ((Math.random() * 2 - 1) * (bolt.kind === "orb" ? 25 : 35) * Math.PI) / 180;
          const dx = e.nx * Math.cos(turn) - e.ny * Math.sin(turn);
          const dy = e.nx * Math.sin(turn) + e.ny * Math.cos(turn);
          const length = between(range) * logo.sizePx;
          ax = e.x;
          ay = e.y;
          bx = ax + dx * length;
          by = ay + dy * length;
          if (bolt.kind === "orb" && orb.visible && orb.radius > 0) {
            // Into the orb behind the logo: the end is kept inside its disc.
            const ox = bx - orb.x;
            const oy = by - orb.y;
            const reach = Math.hypot(ox, oy);
            const max = ORB_END_SHARE * orb.radius;
            if (reach > max) {
              bx = orb.x + (ox * max) / reach;
              by = orb.y + (oy * max) / reach;
            }
          }
          found = !this.inZone(bx, by) && (bolt.kind === "streamer" || logoDistancePx(logo, bx, by) >= ORB_END_CLEAR_PX);
        }
        if (found) this.spark(e, sparkSpeed, LOGO_ARCS.sparkChance);
        if (bolt.kind === "streamer") {
          roughness = LOGO_ARCS.streamerRoughness;
          bolt.taper = true;
          bolt.light = big ? LOGO_ARCS.bigLight : 0.85;
        }
        break;
      }
      case "node": {
        if (!Number.isFinite(logo.nodeX) || !Number.isFinite(logo.nodeY)) return false;
        // From the outline point facing the node best, of a few picked at random.
        let best = 0;
        let bestDot = -2;
        for (let t = 0; t < 2 * TRIES; t++) {
          const i = Math.floor(Math.random() * edges);
          this.edgePoint(logo, i);
          const tx = logo.nodeX - e.x;
          const ty = logo.nodeY - e.y;
          const dot = (e.nx * tx + e.ny * ty) / Math.max(Math.hypot(tx, ty), 1e-3);
          if (dot > bestDot) {
            bestDot = dot;
            best = i;
          }
        }
        this.edgePoint(logo, best);
        ax = e.x;
        ay = e.y;
        bx = logo.nodeX;
        by = logo.nodeY;
        found = Math.hypot(bx - ax, by - ay) > 2;
        bolt.light = big ? LOGO_ARCS.bigLight : 0.9;
        // The node lies behind the mark: the far end may pass under its glyphs, where the DOM hides it.
        keepTo = Math.ceil(0.6 * MAIN_POINTS);
        if (found) this.spark(e, sparkSpeed, LOGO_ARCS.sparkChance);
        break;
      }
    }
    if (!found) return false;
    const length = Math.hypot(bx - ax, by - ay);
    // Short bolts take fewer halvings (a point every ~3 px is enough).
    const levels = Math.min(LOGO_ARCS.levels, Math.max(2, Math.round(Math.log2(Math.max(length, 1) / 3))));
    bolt.count = displace(bolt.main, 0, levels, ax, ay, bx, by, roughness);
    this.keepOutside(logo, bolt.main, 0, bolt.count, Math.min(keepTo, bolt.count));
    // A branch or two off the quarter points, forking away at an angle, fading to their tips.
    for (const share of BRANCH_AT) {
      if (bolt.branchCount >= MAX_BRANCHES || Math.random() >= LOGO_ARCS.branchChance) continue;
      const k = Math.round(share * (bolt.count - 1));
      const kp = Math.max(k - 1, 0);
      const kn = Math.min(k + 1, bolt.count - 1);
      let tx = bolt.main[2 * kn] - bolt.main[2 * kp];
      let ty = bolt.main[2 * kn + 1] - bolt.main[2 * kp + 1];
      const tl = Math.hypot(tx, ty);
      if (tl < 1e-3) continue;
      tx /= tl;
      ty /= tl;
      const turn = ((Math.random() < 0.5 ? -1 : 1) * between(LOGO_ARCS.branchAngleDeg) * Math.PI) / 180;
      const dx = tx * Math.cos(turn) - ty * Math.sin(turn);
      const dy = tx * Math.sin(turn) + ty * Math.cos(turn);
      const reach = between(LOGO_ARCS.branchLength) * length;
      const sx = bolt.main[2 * k];
      const sy = bolt.main[2 * k + 1];
      const b = bolt.branchCount;
      const offset = b * BRANCH_POINTS;
      const count = displace(bolt.branches, offset, LOGO_ARCS.branchLevels, sx, sy, sx + dx * reach, sy + dy * reach, LOGO_ARCS.streamerRoughness);
      this.keepOutside(logo, bolt.branches, offset, count, count);
      bolt.branchCounts[b] = count;
      bolt.branchCount++;
    }
    return true;
  }

  /**
   * The thunder (a click or a tap on the hero): THUNDER.count bolts from the outline outward, their
   * angles spread round the logo (one per sector, the outline point nearest it of a few), each
   * leaving along a blend of the outline's normal and the ray from the centre, its tip landing at
   * THUNDER.reach times the logo's half-size that way; one that would cross the tagline tries the
   * mirrored angle (up instead of down) and other points. Plus the sparks. No flash: the bolts are
   * the thunder's only light (owner, 2026-11-02 evening).
   */
  private thunder(logo: ChargedLogo, set: LogoBolts): void {
    const slot = logo.slot;
    if (!slot || set.thunder.length === 0) return;
    const edges = slot.edges.length / 4;
    if (edges === 0) return;
    const cx = logo.x + logo.width / 2;
    const cy = logo.y + logo.height / 2;
    const a = logo.width / 2;
    const b = logo.height / 2;
    const e = this.edge;
    const scale = thunderScale(logo);
    for (let j = 0; j < THUNDER.count; j++) {
      const bolt = set.thunder[set.thunderNext];
      set.thunderNext = (set.thunderNext + 1) % set.thunder.length;
      bolt.on = false;
      // The angle this bolt is for (on the logo's ellipse), its sector's share at random.
      let target = (2 * Math.PI * (j + Math.random())) / THUNDER.count - Math.PI;
      for (let t = 0; t < THUNDER_TRIES && !bolt.on; t++) {
        let best = 0;
        let bestError = Number.POSITIVE_INFINITY;
        for (let c = 0; c < THUNDER_CANDIDATES; c++) {
          const i = Math.floor(Math.random() * edges);
          this.edgePoint(logo, i);
          const angle = Math.atan2((e.y - cy) / b, (e.x - cx) / a);
          const error = Math.abs(Math.atan2(Math.sin(angle - target), Math.cos(angle - target)));
          if (error < bestError) {
            bestError = error;
            best = i;
          }
        }
        this.edgePoint(logo, best);
        let rx = e.x - cx;
        let ry = e.y - cy;
        const rl = Math.hypot(rx, ry) || 1;
        rx /= rl;
        ry /= rl;
        let dx = e.nx * (1 - THUNDER.radial) + rx * THUNDER.radial;
        let dy = e.ny * (1 - THUNDER.radial) + ry * THUNDER.radial;
        const dl = Math.hypot(dx, dy) || 1;
        const turn = ((Math.random() * 2 - 1) * THUNDER.turnDeg * Math.PI) / 180;
        const ux = dx / dl;
        const uy = dy / dl;
        dx = ux * Math.cos(turn) - uy * Math.sin(turn);
        dy = ux * Math.sin(turn) + uy * Math.cos(turn);
        // The logo's half-size that way (its box's ellipse), and the tip at reach times it from the centre.
        const ellipse = (a * b) / Math.max(Math.hypot(b * dx, a * dy), 1e-3);
        const length = Math.max(between(THUNDER.reach) * ellipse - rl, THUNDER_MIN_LENGTH * logo.height);
        const tx = e.x + dx * length;
        const ty = e.y + dy * length;
        if (this.pathHitsZone(e.x, e.y, tx, ty)) {
          // Down into the tagline: this sector's mirror image goes up instead.
          target = -target;
          continue;
        }
        bolt.count = displace(bolt.main, 0, THUNDER.levels, e.x, e.y, tx, ty, THUNDER.roughness, THUNDER.bendRoughness);
        // Its jag dipped into the tagline after all: another try (keepOutside would flatten it along the box's top).
        if (this.pointsInZone(bolt.main, 0, bolt.count)) continue;
        this.keepOutside(logo, bolt.main, 0, bolt.count, bolt.count);
        bolt.dirX = dx;
        bolt.dirY = dy;
        this.thunderBranches(logo, bolt, length);
        bolt.on = true;
      }
      if (!bolt.on) continue;
      bolt.born = this.time + Math.random() * THUNDER.spawnS;
      bolt.grow = between(THUNDER.growS);
      bolt.life = Math.max(between(THUNDER.lifeS), bolt.grow + 0.1);
      bolt.restrikeAt = Math.random() < THUNDER.restrikeChance ? bolt.born + bolt.grow + Math.random() * 0.6 * (bolt.life - bolt.grow) : -1;
      bolt.light = THUNDER.light * (1 - THUNDER_LIGHT_SPREAD * Math.random());
      bolt.tipSparked = false;
      bolt.scale = scale;
      // A couple of sparks off its root, along it.
      this.fling(bolt.main[0], bolt.main[1], bolt.dirX, bolt.dirY, THUNDER.sparkSpeed, THUNDER.sparkLifeS, THUNDER.sparkSpreadDeg, sparksFor(THUNDER_ROOT_SPARKS, scale));
    }
    // The shower: sparks off the whole outline, flung outward from the centre.
    const shower = sparksFor(THUNDER.sparks, scale);
    for (let k = 0; k < shower; k++) {
      this.edgePoint(logo, Math.floor(Math.random() * edges));
      let rx = e.x - cx;
      let ry = e.y - cy;
      const rl = Math.hypot(rx, ry) || 1;
      rx = (rx / rl + e.nx) / 2;
      ry = (ry / rl + e.ny) / 2;
      if (this.inZone(e.x + rx * 30, e.y + ry * 30)) ry = -Math.abs(ry);
      this.fling(e.x, e.y, rx, ry, THUNDER.sparkSpeed, THUNDER.sparkLifeS, THUNDER.sparkSpreadDeg, 1);
    }
  }

  /** A thunder bolt's branches: forks off its first part, each shooting off at an angle, kept off the glyphs and the tagline. */
  private thunderBranches(logo: ChargedLogo, bolt: ThunderBolt, length: number): void {
    bolt.branchCount = 0;
    const last = bolt.count - 1;
    for (let n = 0; n < THUNDER.branches; n++) {
      if (Math.random() >= THUNDER.branchChance) continue;
      const k = Math.max(1, Math.min(last - 1, Math.round(between(THUNDER_FORK) * last)));
      let tx = bolt.main[2 * (k + 1)] - bolt.main[2 * (k - 1)];
      let ty = bolt.main[2 * (k + 1) + 1] - bolt.main[2 * (k - 1) + 1];
      const tl = Math.hypot(tx, ty);
      if (tl < 1e-3) continue;
      tx /= tl;
      ty /= tl;
      const turn = ((Math.random() < 0.5 ? -1 : 1) * between(THUNDER.branchAngleDeg) * Math.PI) / 180;
      const dx = tx * Math.cos(turn) - ty * Math.sin(turn);
      const dy = tx * Math.sin(turn) + ty * Math.cos(turn);
      const reach = between(THUNDER.branchLength) * length * (1 - k / last);
      const sx = bolt.main[2 * k];
      const sy = bolt.main[2 * k + 1];
      if (this.pathHitsZone(sx, sy, sx + dx * reach, sy + dy * reach)) continue;
      const b = bolt.branchCount;
      const offset = b * THUNDER_BRANCH_POINTS;
      const count = displace(bolt.branches, offset, THUNDER.branchLevels, sx, sy, sx + dx * reach, sy + dy * reach, THUNDER.roughness, THUNDER.bendRoughness);
      if (this.pointsInZone(bolt.branches, offset, count)) continue;
      this.keepOutside(logo, bolt.branches, offset, count, count);
      bolt.branchFrom[b] = k;
      bolt.branchCounts[b] = count;
      bolt.branchCount++;
    }
  }

  /** The straight path from a to b passes within THUNDER_SHIELD_PX of the no-bolt zone. */
  private pathHitsZone(ax: number, ay: number, bx: number, by: number): boolean {
    if (!Number.isFinite(this.zoneTop)) return false;
    for (let k = 1; k <= THUNDER_PATH_SAMPLES; k++) {
      const t = k / THUNDER_PATH_SAMPLES;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      if (y > this.zoneTop - THUNDER_SHIELD_PX && y < this.zoneBottom + THUNDER_SHIELD_PX && x > this.zoneLeft - THUNDER_SHIELD_PX && x < this.zoneRight + THUNDER_SHIELD_PX) return true;
    }
    return false;
  }

  /** Any of a polyline's points in the no-bolt zone. */
  private pointsInZone(points: Float32Array, offset: number, count: number): boolean {
    for (let k = 0; k < count; k++) if (this.inZone(points[2 * (offset + k)], points[2 * (offset + k) + 1])) return true;
    return false;
  }

  /**
   * This frame's thunder bolts: the grown part of each (its leader's tip bright while it grows),
   * then its flicker and fade, each sheath trimmed where other bolts run with it (OVERLAP_CELL_PX).
   */
  private drawThunder(logo: ChargedLogo, set: LogoBolts, cssWidth: number, cssHeight: number): void {
    this.markThunder(set, cssWidth, cssHeight);
    for (const bolt of set.thunder) {
      if (!bolt.on) continue;
      const age = this.time - bolt.born;
      if (age < 0) continue;
      if (age >= bolt.life) {
        bolt.on = false;
        continue;
      }
      const growth = Math.min(age / bolt.grow, 1);
      let envelope = 1;
      if (growth >= 1) {
        const left = 1 - (age - bolt.grow) / (bolt.life - bolt.grow);
        envelope = left ** THUNDER_FADE_POWER * (THUNDER.flickerFloor + (1 - THUNDER.flickerFloor) * Math.random());
        if (bolt.restrikeAt >= 0 && this.time >= bolt.restrikeAt && this.time < bolt.restrikeAt + THUNDER.restrikeS) envelope = Math.max(envelope, 0.95);
        if (!bolt.tipSparked) {
          // It has landed: a few sparks off its tip, on along its way.
          bolt.tipSparked = true;
          const end = 2 * (bolt.count - 1);
          this.fling(bolt.main[end], bolt.main[end + 1], bolt.dirX, bolt.dirY, THUNDER.sparkSpeed, THUNDER.sparkLifeS, 2 * THUNDER.sparkSpreadDeg, sparksFor(THUNDER.tipSparks, bolt.scale));
        }
      }
      const light = bolt.light * envelope * logo.fade;
      const shown = growth * (bolt.count - 1);
      let n = this.grownPart(bolt.main, 0, bolt.count, shown);
      // Its widths scale with the logo (THUNDER.refHeightPx), the core never under a crisp line.
      const size = bolt.scale;
      const core = Math.max(THUNDER.coreHalfPx * size, THUNDER_MIN_CORE_PX);
      this.strip(this.grown, 0, n, THUNDER.halfWidthPx * size, core, light, light * (growth < 1 ? THUNDER.leaderLight : THUNDER.tipLight), THUNDER.glowPx * size, true);
      for (let b = 0; b < bolt.branchCount; b++) {
        const from = bolt.branchFrom[b];
        if (shown <= from) continue;
        const count = bolt.branchCounts[b];
        const branchShown = Math.min((shown - from) / Math.max(bolt.count - 1 - from, 1), 1) * (count - 1);
        n = this.grownPart(bolt.branches, b * THUNDER_BRANCH_POINTS, count, branchShown);
        const width = THUNDER_BRANCH_WIDTH * size;
        const branchCore = core * THUNDER_BRANCH_WIDTH;
        this.strip(this.grown, 0, n, THUNDER.halfWidthPx * width, branchCore, light * THUNDER.branchLight, 0, THUNDER.glowPx * width, true);
      }
    }
  }

  /**
   * Marks this frame's grown thunder in the overlap grid, a bit per pool bolt (its branches share
   * it: a fork is no overlap). Leaves the grid off (overlapCols 0) while no bolt is grown.
   */
  private markThunder(set: LogoBolts, cssWidth: number, cssHeight: number): void {
    const cols = Math.max(1, Math.ceil(cssWidth / OVERLAP_CELL_PX));
    const rows = Math.max(1, Math.ceil(cssHeight / OVERLAP_CELL_PX));
    this.overlapCols = 0;
    for (let i = 0; i < set.thunder.length; i++) {
      const bolt = set.thunder[i];
      const age = this.time - bolt.born;
      if (!bolt.on || age < 0 || age >= bolt.life) continue;
      if (this.overlapCols === 0) {
        if (this.overlap.length < cols * rows) this.overlap = new Uint32Array(cols * rows);
        this.overlap.fill(0, 0, cols * rows);
        this.overlapCols = cols;
        this.overlapRows = rows;
      }
      // The pool holds 28 (THUNDER.pool): a bit each; past 32 two bolts would share one, which only under-trims.
      const bit = 1 << (i % 32);
      const shown = Math.min(age / bolt.grow, 1) * (bolt.count - 1);
      this.markPoints(bolt.main, 0, Math.min(Math.ceil(shown), bolt.count - 1) + 1, bit);
      for (let b = 0; b < bolt.branchCount; b++) {
        const from = bolt.branchFrom[b];
        if (shown <= from) continue;
        const count = bolt.branchCounts[b];
        const branchShown = Math.min((shown - from) / Math.max(bolt.count - 1 - from, 1), 1) * (count - 1);
        this.markPoints(bolt.branches, b * THUNDER_BRANCH_POINTS, Math.min(Math.ceil(branchShown), count - 1) + 1, bit);
      }
    }
  }

  /** Sets `bit` in the cells of a polyline's first `count` points (points off the canvas are left out). */
  private markPoints(points: Float32Array, offset: number, count: number, bit: number): void {
    const o = 2 * offset;
    for (let k = 0; k < count; k++) {
      const cx = Math.floor(points[o + 2 * k] / OVERLAP_CELL_PX);
      const cy = Math.floor(points[o + 2 * k + 1] / OVERLAP_CELL_PX);
      if (cx < 0 || cy < 0 || cx >= this.overlapCols || cy >= this.overlapRows) continue;
      this.overlap[cy * this.overlapCols + cx] |= bit;
    }
  }

  /** How many thunder bolts run through the spot round (x, y) this frame: 1 at least (the one asking). */
  private overlapAt(x: number, y: number): number {
    const cx = Math.floor(x / OVERLAP_CELL_PX);
    const cy = Math.floor(y / OVERLAP_CELL_PX);
    let bits = 0;
    for (let j = Math.max(cy - 1, 0); j <= Math.min(cy + 1, this.overlapRows - 1); j++) {
      for (let i = Math.max(cx - 1, 0); i <= Math.min(cx + 1, this.overlapCols - 1); i++) bits |= this.overlap[j * this.overlapCols + i];
    }
    return Math.max(popcount(bits), 1);
  }

  /** Copies a polyline's first `shown` (fractional) segments into this.grown, its last point part-way along; returns the count. */
  private grownPart(points: Float32Array, offset: number, count: number, shown: number): number {
    const whole = Math.min(Math.floor(shown), count - 1);
    const o = 2 * offset;
    const out = this.grown;
    for (let k = 0; k <= whole; k++) {
      out[2 * k] = points[o + 2 * k];
      out[2 * k + 1] = points[o + 2 * k + 1];
    }
    const part = shown - whole;
    if (whole >= count - 1 || part <= 1e-3) return whole + 1;
    const a = o + 2 * whole;
    out[2 * whole + 2] = points[a] + (points[a + 2] - points[a]) * part;
    out[2 * whole + 3] = points[a + 1] + (points[a + 3] - points[a + 1]) * part;
    return whole + 2;
  }

  /**
   * Pushes points [offset + 1, offset + to) of a polyline out of the silhouette to clearPx along the
   * field's normal (the first point is the contact, already outside), and every point out of the
   * no-bolt zone (up, above its top).
   */
  private keepOutside(logo: ChargedLogo, points: Float32Array, offset: number, count: number, to: number): void {
    const slot = logo.slot;
    if (!slot) return;
    const clear = LOGO_ARCS.clearPx;
    for (let k = 1; k < count; k++) {
      const o = 2 * (offset + k);
      if (k < to) {
        for (let pass = 0; pass < 2; pass++) {
          const d = logoDistancePx(logo, points[o], points[o + 1]);
          if (d >= clear) break;
          slotNormal(slot, (points[o] - logo.x) / logo.unitPx, (points[o + 1] - logo.y) / logo.unitPx, this.normal);
          points[o] += this.normal.x * (clear - d);
          points[o + 1] += this.normal.y * (clear - d);
        }
      }
      if (this.inZone(points[o], points[o + 1])) points[o + 1] = this.zoneTop;
    }
  }

  /** Throws a spark off a contact (with chance: always when omitted), up to sparkSpreadDeg off its normal. */
  private spark(at: EdgePoint, speedScale: number, chance = 1): void {
    for (let n = 0; n < 2; n++) {
      if (Math.random() >= chance) continue;
      this.fling(at.x, at.y, at.nx, at.ny, LOGO_ARCS.sparkSpeed, LOGO_ARCS.sparkLifeS, LOGO_ARCS.sparkSpreadDeg, 1, speedScale);
      if (chance >= 1) return;
    }
  }

  /** Throws count sparks from (x, y) along (dx, dy), up to spreadDeg off it, at a speed and life drawn from the ranges. */
  private fling(
    x: number,
    y: number,
    dx: number,
    dy: number,
    speedRange: readonly [number, number],
    lifeRange: readonly [number, number],
    spreadDeg: number,
    count: number,
    speedScale = 1,
  ): void {
    const dl = Math.hypot(dx, dy) || 1;
    for (let n = 0; n < count; n++) {
      // A full pool re-uses a random live spark (most of them are near the end of their life).
      const spark = this.sparks[this.sparkCount < this.sparks.length ? this.sparkCount++ : Math.floor(Math.random() * this.sparks.length)];
      const turn = ((Math.random() * 2 - 1) * spreadDeg * Math.PI) / 180;
      const ux = (dx / dl) * Math.cos(turn) - (dy / dl) * Math.sin(turn);
      const uy = (dx / dl) * Math.sin(turn) + (dy / dl) * Math.cos(turn);
      const speed = between(speedRange) * speedScale;
      spark.x = x;
      spark.y = y;
      spark.vx = ux * speed;
      spark.vy = uy * speed;
      spark.age = 0;
      spark.life = between(lifeRange);
      spark.gravity = LOGO_ARCS.sparkGravity * speedScale;
    }
  }

  private flash(x: number, y: number, radius: number, life: number, light: number): void {
    const flash = this.flashes[this.flashCount < MAX_FLASHES ? this.flashCount++ : 0];
    flash.x = x;
    flash.y = y;
    flash.radius = radius;
    flash.age = 0;
    flash.life = life;
    flash.light = light;
  }

  /**
   * Moves, fades and draws the live sparks. One that flies into the tagline's box (grown by
   * SHIELD_PX) goes out there: the hero's sparks fall off its lower edges, and nothing may glint
   * between the tagline's letters (owner, 2026-11-02 evening: its border has no sparkles).
   */
  private updateSparks(dt: number, tagline: AnchorRect | null): void {
    let kept = 0;
    for (let i = 0; i < this.sparkCount; i++) {
      const spark = this.sparks[i];
      spark.age += dt;
      if (spark.age >= spark.life) continue;
      spark.vy += spark.gravity * dt;
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      if (
        tagline &&
        spark.x > tagline.x - SHIELD_PX &&
        spark.x < tagline.x + tagline.width + SHIELD_PX &&
        spark.y > tagline.y - SHIELD_PX &&
        spark.y < tagline.y + tagline.height + SHIELD_PX
      ) {
        continue;
      }
      // Keep the live ones first (a swap: the pool's objects are never lost).
      this.sparks[i] = this.sparks[kept];
      this.sparks[kept++] = spark;
      const fade = (1 - spark.age / spark.life) ** 2;
      const tail = this.streak;
      tail[0] = spark.x - spark.vx * LOGO_ARCS.sparkTrailS;
      tail[1] = spark.y - spark.vy * LOGO_ARCS.sparkTrailS;
      tail[2] = spark.x;
      tail[3] = spark.y;
      this.strip(tail, 0, 2, LOGO_ARCS.sparkHalfWidthPx, LOGO_ARCS.sparkCorePx, fade * SPARK_TAIL_LIGHT, fade, 0);
    }
    this.sparkCount = kept;
  }

  private updateFlashes(dt: number): void {
    let kept = 0;
    for (let i = 0; i < this.flashCount; i++) {
      const flash = this.flashes[i];
      flash.age += dt;
      if (flash.age >= flash.life) continue;
      this.flashes[i] = this.flashes[kept];
      this.flashes[kept++] = flash;
      this.disc(flash.x, flash.y, flash.radius, LOGO_ARCS.flashAlpha * flash.light * (1 - flash.age / flash.life) ** 2);
    }
    this.flashCount = kept;
  }

  private vertex(x: number, y: number, kind: number, u: number, v: number, light: number, halfWidth: number, core: number, glowPx: number): void {
    const i = this.vertexCount++;
    this.positions[3 * i] = x;
    this.positions[3 * i + 1] = y;
    this.positions[3 * i + 2] = kind;
    this.profiles[4 * i] = u;
    this.profiles[4 * i + 1] = v;
    this.profiles[4 * i + 2] = light;
    this.profiles[4 * i + 3] = glowPx;
    this.sizes[2 * i] = halfWidth;
    this.sizes[2 * i + 1] = core;
  }

  /**
   * A strip along points [offset, offset + count): a vertex pair per point, mitred at the turns;
   * light runs from light0 to light1; glowPx: its sheath's falloff (0: LOGO_ARCS.glowPx); trim: a
   * thunder strip, whose falloff narrows where other thunder bolts run with it (overlapAt).
   */
  private strip(points: Float32Array, offset: number, count: number, halfWidth: number, core: number, light0: number, light1: number, glowPx: number, trim = false): void {
    if (count < 2 || this.vertexCount + 2 * count > LOGO_ARCS.maxVertices || this.indexCount + 6 * (count - 1) > this.indices.length) return;
    const first = this.vertexCount;
    const o = 2 * offset;
    for (let k = 0; k < count; k++) {
      const kp = Math.max(k - 1, 0);
      const kn = Math.min(k + 1, count - 1);
      let tx = points[o + 2 * kn] - points[o + 2 * kp];
      let ty = points[o + 2 * kn + 1] - points[o + 2 * kp + 1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      // Mitre: the pair spreads by 1 / cos(half the turn) so the strip keeps its width round a corner (capped at 2).
      let scale = 1;
      if (k > 0 && k < count - 1) {
        let sx = points[o + 2 * k] - points[o + 2 * kp];
        let sy = points[o + 2 * k + 1] - points[o + 2 * kp + 1];
        const sl = Math.hypot(sx, sy) || 1;
        sx /= sl;
        sy /= sl;
        scale = 1 / Math.max(tx * sx + ty * sy, 0.5);
      }
      const nx = -ty * halfWidth * scale;
      const ny = tx * halfWidth * scale;
      const t = k / (count - 1);
      const light = light0 + (light1 - light0) * t;
      const x = points[o + 2 * k];
      const y = points[o + 2 * k + 1];
      const glow = trim && this.overlapCols > 0 ? Math.min(glowPx, Math.max(glowPx / this.overlapAt(x, y), OVERLAP_MIN_GLOW_PX)) : glowPx;
      this.vertex(x + nx, y + ny, 0, t, -1, light, halfWidth, core, glow);
      this.vertex(x - nx, y - ny, 0, t, 1, light, halfWidth, core, glow);
    }
    const index = this.indices;
    for (let k = 0; k < count - 1; k++) {
      const a = first + 2 * k;
      const i = this.indexCount;
      index[i] = a;
      index[i + 1] = a + 1;
      index[i + 2] = a + 2;
      index[i + 3] = a + 1;
      index[i + 4] = a + 3;
      index[i + 5] = a + 2;
      this.indexCount += 6;
    }
  }

  /** A flash's soft disc of radius r round (x, y). */
  private disc(x: number, y: number, r: number, light: number): void {
    if (r <= 0 || this.vertexCount + 4 > LOGO_ARCS.maxVertices || this.indexCount + 6 > this.indices.length) return;
    const first = this.vertexCount;
    this.vertex(x - r, y - r, 1, -1, -1, light, r, 0, 0);
    this.vertex(x + r, y - r, 1, 1, -1, light, r, 0, 0);
    this.vertex(x - r, y + r, 1, -1, 1, light, r, 0, 0);
    this.vertex(x + r, y + r, 1, 1, 1, light, r, 0, 0);
    const index = this.indices;
    const i = this.indexCount;
    index[i] = first;
    index[i + 1] = first + 1;
    index[i + 2] = first + 2;
    index[i + 3] = first + 1;
    index[i + 4] = first + 3;
    index[i + 5] = first + 2;
    this.indexCount += 6;
  }

  /** Hands this frame's vertices and indices to three (only the used ranges are re-sent). */
  private upload(): void {
    for (const attribute of this.attributes) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, this.vertexCount * attribute.itemSize);
      attribute.needsUpdate = this.vertexCount > 0;
    }
    this.indexAttribute.clearUpdateRanges();
    this.indexAttribute.addUpdateRange(0, this.indexCount);
    this.indexAttribute.needsUpdate = this.indexCount > 0;
    this.geometry.setDrawRange(0, this.indexCount);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
