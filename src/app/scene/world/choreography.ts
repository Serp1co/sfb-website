/* ------------------------------------------------------------------ */
/*  Poses: where the camera, the orb and the circuitry stand for each  */
/*  [data-story] section. Tunable. World units; the camera looks at    */
/*  `look`. The rig holds the pose of the section being read and, when */
/*  that changes, moves to the next one on its own clock (a timed,     */
/*  eased blend of the two, section-transition.ts), then springs: no   */
/*  pose follows the scroll position proportionally (v3.1).            */
/*                                                                     */
/*  The orb lives inside the panels (owner decisions 2026-11-02): a    */
/*  pose splits it into as many bodies as its section has panels, one */
/*  inside each, behind the glass (cells): the hero's one big orb,     */
/*  About's two, Services' three windows, the Contact cards' three,    */
/*  and on a practice page one per feature card, one behind the pill   */
/*  row (which dissolves into a droplet in each pill, v3.1) and one in */
/*  the call to action (v3). One model on every screen:                */
/*  phones split into the same cells, stacked. Through Partners the    */
/*  page leaves empty gaps (slots) for the merged orb, and the rig's   */
/*  tracker (orb-slots.ts) moves it from slot A to slot B and on into  */
/*  the contact cards. Every body rides with its own cell as the page  */
/*  scrolls (the rig carries them), off screen too: when its panel     */
/*  comes into view, the body is already inside it. The other holds    */
/*  come from an anchor and keep the orb's disc clear of the bare text */
/*  over the scene (the copy anchors). Transits dive in depth, so they */
/*  pass behind the copy small and fogged. No pose shows a body so     */
/*  large that its marching-cubes cells become visible facets.          */
/* ------------------------------------------------------------------ */

import * as THREE from "three";
import { SERVICE_SLUGS } from "../../data/site-data";
import { ANCHORS, anchorRects, type AnchorRect } from "../../glass/contract";
import { motion } from "../../motion/store";
import { clamp, lerp } from "../../aquaism/core/math";
import { MAX_CLUSTERS } from "../../aquaism/core/orb-controls";
import {
  FIELD_ROOM,
  FIELD_SCALE,
  ORB_RADIUS,
  SATELLITE_COLUMN,
  SATELLITE_RADIUS,
  satelliteOffset,
  splitRadius,
} from "../../aquaism/core/orb-field";
import {
  clientToPlaneZ,
  pixelsPerUnitAt,
  worldToClient,
  type ScreenBox,
  type ScreenPoint,
} from "../../aquaism/core/projection";
import { satelliteSide } from "./orb-direction";
import type { SlotChoice, SlotView } from "./orb-slots";

type Vec3 = readonly [number, number, number];

/**
 * How a hold keeps the orb clear of bare text: "move" it down or aside (up only when much
 * shorter), "shrink" it in place (it must stay behind its anchor) and move only if that is not
 * enough, or "vertical" (up or down only).
 */
type Avoid = "move" | "shrink" | "vertical";

/**
 * The panels a pose splits the orb into (see PoseSpec.cells): the home page's hero slot, About's
 * panels, the Services windows, the contact cards; a practice page's feature cards ("practice"),
 * its technology pill row ("tech") and its call-to-action panel ("cta").
 */
type CellSource = "hero" | "about" | "services" | "contact" | "practice" | "tech" | "cta";

interface PoseSpec {
  camera: Vec3;
  look: Vec3;
  /** Orb centre (the field centre). Layout poses replace it from the page's anchors; its z is the bodies' depth. */
  orb: Vec3;
  /** Orb scale about its centre. */
  scale: number;
  /** Circuit board brightness. */
  boards: number;
  /** Partner nodes and their traces. */
  nodes: number;
  /**
   * "behind": the orb's centre behind the centre of `anchor`. "slot": Partners and Contact, where
   * the orb sits in the slot the rig's tracker holds (orb-slots.ts), seen through the partners
   * camera and sized to the gap; in the contact cards (station C); in the fallback, the contact
   * close-up behind the contact row; and on a page without slots the spec's own hold behind `anchor`.
   */
  layout?: "hero" | "practice-hero" | "behind" | "slot";
  anchor?: string;
  /**
   * The panels the orb splits into, one body inside each, on every screen (stacked on a phone).
   * Without them laid out, the pose's other placement holds.
   */
  cells?: CellSource;
  /** A practice page's hero: the other two practices float beside the practice's body as satellites. */
  satellites?: boolean;
  avoid?: Avoid;
  /** Practice pages: 0 puts the satellites in a column beside the orb, 1 in a row (blended). */
  satelliteRow?: number;
}

/**
 * Where a pose puts the orb's bodies, on screen: `count` cells (one merged body, or one per
 * panel), each the centre of a body (client CSS px) of `radius` px silhouette.
 */
export interface CellSet {
  /** 1..MAX_CLUSTERS. */
  count: number;
  /** MAX_CLUSTERS entries; the first `count` are the bodies' centres (on the page: off screen too). */
  x: number[];
  y: number[];
  radius: number;
  /** The panel each body sits in, x0, y0, x1, y1 per cell (client px; zeros: none): the hover swell's. */
  panels: Float64Array;
  /**
   * The bodies are held inside those panels (owner decision 2026-11-02, v3.1: "make the interaction
   * contained inside the panel"): pushes, stirs and splashes never take a body out of its panel.
   * The cards and panels only; the hero's orb and the slots' keep the free behaviour.
   */
  walled: boolean;
}

export function createCellSet(): CellSet {
  return {
    count: 1,
    x: Array.from({ length: MAX_CLUSTERS }, () => 0),
    y: Array.from({ length: MAX_CLUSTERS }, () => 0),
    radius: 0,
    panels: new Float64Array(4 * MAX_CLUSTERS),
    walled: false,
  };
}

export function copyCellSet(out: CellSet, from: CellSet): void {
  out.count = from.count;
  for (let k = 0; k < MAX_CLUSTERS; k++) {
    out.x[k] = from.x[k];
    out.y[k] = from.y[k];
  }
  out.radius = from.radius;
  out.panels.set(from.panels);
  out.walled = from.walled;
}

/** A pose evaluated for this frame. */
export interface Pose {
  camera: THREE.Vector3;
  look: THREE.Vector3;
  orb: THREE.Vector3;
  scale: number;
  boards: number;
  nodes: number;
  satelliteRow: number;
  /**
   * The bodies' cells, and while two poses blend the next pose's too, with how far the bodies have
   * gone from `cells` to `next` (0..1). A single pose has cellMix 0.
   */
  cells: CellSet;
  next: CellSet;
  cellMix: number;
  /**
   * How much of the orb's placement rides with the page, 0..1 as blended: a body inside a panel or
   * a slot moves with it as it scrolls, and the rig carries that share of the orb with the page.
   */
  anchored: number;
  /** How much of the pose is the Services split, 0..1: the practice photos and the service circuitry. */
  practices: number;
  /** How much of the pose keeps a practice page's satellites, 0..1 (its hero only). */
  satellites: number;
  /** How much of the pose is a practice page's cells, 0..1: the cell circuitry (cell-links.tsx). */
  cellLinks: number;
  /**
   * How much of the pose is the technology pills' (v3.1), 0..1: the bodies flow to the pill row and
   * dissolve into one droplet in each pill as this comes in (orb-direction.ts), and back out of them.
   */
  droplets: number;
}

export function createPose(): Pose {
  return {
    camera: new THREE.Vector3(0, 0, 5),
    look: new THREE.Vector3(),
    orb: new THREE.Vector3(),
    scale: 1,
    boards: 1,
    nodes: 0,
    satelliteRow: 0,
    cells: createCellSet(),
    next: createCellSet(),
    cellMix: 0,
    anchored: 0,
    practices: 0,
    satellites: 0,
    cellLinks: 0,
    droplets: 0,
  };
}

/** The pose used for an empty story (a page without [data-story]) and for unknown names. */
export const FALLBACK_POSE = "hero";

/**
 * Landscape (desktop) poses. Layout poses take the orb from the page; their table values are the
 * fallbacks before the anchors are measured (and about right at 1440 x 900). Board emphasis is
 * restrained (hero 0.7): the circuitry is depth behind the copy, not a second subject.
 */
const LANDSCAPE: Record<string, PoseSpec> = {
  // One big merged orb centred on the hero section, the logo and the tagline over it (owner
  // decision 2026-11-02). Without the hero's slot (the 404): on the actions row, clear of the copy.
  hero: { camera: [0, 0, 5], look: [0, 0, 0], orb: [0, -2.4, 0], scale: 1, boards: 0.7, nodes: 0, layout: "hero", cells: "hero" },
  // Two bodies, one inside each panel (Mission, Approach). Without the cells: behind Approach.
  about: {
    camera: [-0.5, 0.25, 5.3],
    look: [0.4, 0, 0],
    orb: [3, -0.2, -0.8],
    scale: 0.95,
    boards: 0.6,
    nodes: 0,
    layout: "behind",
    anchor: ANCHORS.aboutApproach,
    cells: "about",
  },
  // Three bodies, one in each practice card's window, each reflecting its practice's photo; the
  // service circuitry links the cards.
  services: {
    camera: [0, 0.1, 5.2],
    look: [0, 0, 0],
    orb: [0, -0.25, 0],
    scale: 1,
    boards: 0.55,
    nodes: 0,
    avoid: "vertical",
    cells: "services",
  },
  // Partners and Contact hold the orb in the page's slots: above the Partners heading, then
  // between the customers band and "Get in touch", the hub the logo nodes are wired to, then in
  // the contact cards. This camera and orb depth are the slots' (SLOT_POSE). Without slots: small,
  // behind the centre of the partners band, as before.
  partners: {
    camera: [0, -0.4, 6],
    look: [0, 0.4, -2],
    orb: [0, 2.3, -3],
    scale: 0.65,
    boards: 0.75,
    nodes: 1,
    layout: "slot",
    anchor: ANCHORS.partnersBand,
    avoid: "shrink",
  },
  // In slot B the traces still fan up into the bands; once the contact cards are in view the orb
  // splits into them (station C, through the slots' camera). The fallback when the page has slots
  // but no contact cells, once B has left the view, and the hold without slots: the camera dollies
  // in, the orb close and large behind the Email card, shrunk if its top would reach the lead.
  contact: {
    camera: [0, -0.1, 4.4],
    look: [0, 0, 0],
    orb: [0, -0.2, 1],
    scale: 1,
    boards: 0.65,
    nodes: 0,
    layout: "slot",
    anchor: ANCHORS.contactRow,
    avoid: "shrink",
  },
  // Right of the title block, clear of it by PRACTICE_ORB_GAP: the practice's body with the other
  // two practices beside it as satellites (unchanged by v3).
  "practice-hero": {
    camera: [0, 0, 5],
    look: [0, 0, 0],
    orb: [4, 0, -1.5],
    scale: 1,
    boards: 0.65,
    nodes: 0,
    layout: "practice-hero",
    satellites: true,
  },
  // One body inside each feature card (owner decision 2026-11-02, v3: the practice pages behave like
  // the home page), the cell circuitry linking neighbouring cards. Without the cards: behind the
  // first column, as before.
  "practice-features": {
    camera: [0.3, 0.1, 5.2],
    look: [0, 0, 0],
    orb: [-4.2, -0.3, -2],
    scale: 0.95,
    boards: 0.6,
    nodes: 0,
    cells: "practice",
  },
  // One body behind the pill row (the pills it overlaps glow), on a bus of traces with a stub to
  // each pill. Without the row: small, behind its anchor, shrunk clear of the heading.
  "practice-tech": {
    camera: [0, 0, 5.4],
    look: [0, 0, 0],
    orb: [0, -0.1, -2.2],
    scale: 0.75,
    boards: 0.6,
    nodes: 0,
    layout: "behind",
    anchor: ANCHORS.practiceTech,
    avoid: "shrink",
    cells: "tech",
    satelliteRow: 1,
  },
  // One body inside the call-to-action panel, joined to the feature grid by the circuitry.
  "practice-cta": {
    camera: [0, -0.1, 4.6],
    look: [0, 0, 0],
    orb: [0, -0.3, 0.6],
    scale: 1,
    boards: 0.65,
    nodes: 0,
    cells: "cta",
    satelliteRow: 1,
  },
};

/**
 * Portrait and narrow viewports: the camera further back, and where there are no cells, centred
 * poses that move only vertically. The cells are the same as on a desktop, stacked (v3: phones
 * split like desktops; the view box keeps far-apart cells smooth, orb-field.ts).
 */
const PORTRAIT_PULLBACK = 2.6;
const PORTRAIT_OVERRIDES: Record<string, Partial<PoseSpec>> = {
  // Below the stacked copy (placed from its rect), out of the way of the long practice description.
  "practice-hero": { orb: [0, -1.9, -1.5], scale: 0.85 },
};

function toPortrait(name: string, spec: PoseSpec): PoseSpec {
  return {
    ...spec,
    camera: [0, spec.camera[1], spec.camera[2] + PORTRAIT_PULLBACK],
    look: [0, spec.look[1], spec.look[2]],
    orb: [0, spec.orb[1], spec.orb[2]],
    // Centred compositions dodge text vertically (or shrink), never sideways.
    avoid: spec.avoid === "shrink" ? "shrink" : "vertical",
    ...PORTRAIT_OVERRIDES[name],
  };
}

const PORTRAIT: Record<string, PoseSpec> = Object.fromEntries(
  Object.entries(LANDSCAPE).map(([name, spec]) => [name, toPortrait(name, spec)]),
);

/** Portrait below this aspect (width / height), or narrower than this many CSS px. */
const PORTRAIT_MAX_ASPECT = 1;
const PORTRAIT_MAX_WIDTH = 760;

export function isPortrait(box: ScreenBox): boolean {
  return box.width < PORTRAIT_MAX_WIDTH || box.width / Math.max(box.height, 1) < PORTRAIT_MAX_ASPECT;
}

function specFor(name: string | undefined, portrait: boolean): PoseSpec {
  const table = portrait ? PORTRAIT : LANDSCAPE;
  return (name !== undefined ? table[name] : undefined) ?? table[FALLBACK_POSE];
}

/* -- The slots: Partners and Contact ------------------------------------ */

/** The pose whose camera and orb depth the slot holds share, so moving between the slots never moves the camera. */
const SLOT_POSE = "partners";
/** The pose whose close-up the fallback is, once slot B has left the view and there are no contact cells. */
const SLOT_FALLBACK_POSE = "contact";

/** What a "slot" spec resolves to this frame, per table: held in a slot, in the contact cards, the fallback, or no slots. */
interface SlotSpecs {
  hold: PoseSpec;
  cells: PoseSpec;
  fallback: PoseSpec;
  legacy: PoseSpec;
}

function slotSpecs(table: Record<string, PoseSpec>): Record<string, SlotSpecs> {
  const slot = table[SLOT_POSE];
  const close = table[SLOT_FALLBACK_POSE];
  const out: Record<string, SlotSpecs> = {};
  for (const [name, spec] of Object.entries(table)) {
    if (spec.layout !== "slot") continue;
    out[name] = {
      // Clear of the copy by construction: the slot is the gap itself. The traces are wired to it.
      hold: { ...spec, camera: slot.camera, look: slot.look, orb: [0, 0, slot.orb[2]], avoid: undefined, nodes: 1 },
      // Station C, the contact cards: still through the slots' camera (no camera move from B), the
      // nodes going out as the orb leaves B (the bands are above it by then).
      cells: { ...spec, camera: slot.camera, look: slot.look, orb: [0, 0, slot.orb[2]], avoid: undefined, nodes: 0, cells: "contact" },
      // The nodes go out with the close-up: the bands are far above it by then.
      fallback: { ...close, layout: "behind", nodes: 0 },
      legacy: { ...spec, layout: "behind" },
    };
  }
  return out;
}

const LANDSCAPE_SLOTS = slotSpecs(LANDSCAPE);
const PORTRAIT_SLOTS = slotSpecs(PORTRAIT);

/**
 * The orb's radius in a slot, as a share of the slot's height: it sits wholly in the gap, with a
 * little room above and below (owner decision 2026-11-02).
 */
const SLOT_FILL = 0.42;

/** The spec for this frame: a slot pose resolves to the hold, the cells, the fallback or the pre-slot hold. */
function resolveSpec(name: string | undefined, ctx: PoseContext): PoseSpec {
  const spec = specFor(name, ctx.portrait);
  if (spec.layout !== "slot") return spec;
  const specs = (ctx.portrait ? PORTRAIT_SLOTS : LANDSCAPE_SLOTS)[name ?? ""];
  if (!specs) return spec;
  if (ctx.slot === "fallback") return specs.fallback;
  if (ctx.slot === "c") return ctx.slotC.valid ? specs.cells : specs.fallback;
  const view = ctx.slot === "a" ? ctx.slotA : ctx.slotB;
  return (ctx.slot === "a" || ctx.slot === "b") && view.valid ? specs.hold : specs.legacy;
}

/**
 * The orb sits in a slot in both slot poses (Partners and Contact) whenever the page has slots, so
 * the rig's move between those two poses must not dive: the slot glide has its own (rig).
 */
export function holdsSlot(name: string | undefined, ctx: PoseContext): boolean {
  return specFor(name, ctx.portrait).layout === "slot" && ctx.slot !== "none";
}

/* -- The grid caps the orb's size on screen ----------------------------- */

/**
 * The orb is one marching-cubes surface on a grid that scales with it: a cell is 2 x F / resolution
 * physics units (F the field box's half extent, FIELD_SCALE unless the box has shrunk), times the
 * pose's scale. So the larger a body is on screen, the larger its cells, and a large cell is a flat
 * facet and a straight run of silhouette: every body faceted at the practice call to action on
 * 2560 x 1440 (~33 px cells). Every pose keeps one cell at the orb's centre under a size that
 * depends on how big its bodies are in cells, by limiting its scale, so tall viewports, the close
 * poses and a field stepped down to a coarser grid get a smaller orb, never a faceted one. The
 * cell layouts shrink the box instead, down to the floor the orb affords (orb-field.ts).
 *
 * The merged orb (radius ~8 cells at 72 in the full box) stays round up to ~16 px cells: the old
 * 1440 x 900 hero drew 16.3 px, and steps only show from ~26 px (scratch p1).
 */
const MERGED_CELL_PX = 16.5;
/**
 * Small bodies (a practice page's three, a three-way split's: ~5-6 cells of radius at 72 in the
 * full box) facet sooner, from ~12 px. The satellites sit deeper than the centre this measures, so
 * draw smaller. A two-way split's bodies (15 metaballs) count as big.
 */
const SMALL_CELL_PX = 12;

/** The cap on a grid cell (CSS px) for bodies of a `count`-way layout; a practice page's are small. */
export function bodyCellPx(count: number, practicePage: boolean): number {
  return practicePage || count >= 3 ? SMALL_CELL_PX : MERGED_CELL_PX;
}

/* -- Cells: one body inside each panel ---------------------------------- */

/** A body's radius is at most this share of its panel's shorter side: wholly inside, with room (owner). */
export const CELL_FILL = 0.35;
/** A technology pill's droplet: its radius this share of the pill's height (owner, v3.1: "sized to the pill"). */
export const DROPLET_FILL = 0.3;
/** The hero's merged orb: this share of the viewport's height (owner: centred and bigger), the grid permitting... */
const HERO_FILL = 0.3;
/** ...and at most this share of the hero section's shorter side. */
const HERO_SECTION_FILL = 0.42;
/**
 * The outermost metaball of a settled merged body from its centroid (physics units; scratch
 * W/radii.cjs): with FIELD_ROOM, the room it needs inside the compact field box.
 */
const MERGED_BODY_EXTENT = 0.69;

/* -- Layout-derived poses (no cells) ------------------------------------ */

/** The hero orb's centre stays within this band of the viewport height (fractions from the top). */
const HERO_BAND: readonly [number, number] = [0.15, 0.92];
/** The hero orb's top edge stays this far below the lowest bare text above its row (review C9). */
const HERO_COPY_GAP = 24;
/** If that pushes it past the band, it shrinks instead, down to this share of its scale. */
const HERO_MIN_SCALE = 0.7;

/**
 * The practice-copy anchor is the title block, which may be a full-width container with centred
 * text. Its text column is at most this wide on each side of its centre (the 54ch lead at 20 px).
 */
const PRACTICE_COPY_MAX_HALF_WIDTH = 330;
/** The orb's left edge stays at least this far right of the text column (CSS px). */
const PRACTICE_ORB_GAP = 32;
/** ...and its right edge this far inside the viewport, shrinking the orb (down to this share of its scale) to fit. */
const PRACTICE_EDGE_MARGIN = 24;
const PRACTICE_MIN_SCALE = 0.65;
const PRACTICE_Y_BAND: readonly [number, number] = [0.35, 0.6];
/** Portrait: the orb sits PRACTICE_ORB_GAP below the stacked copy, its centre kept within this band. */
const PRACTICE_PORTRAIT_Y_BAND: readonly [number, number] = [0.35, 0.88];

/** A "behind" hold's centre stays within this band of the viewport height while its anchor scrolls. */
const BEHIND_BAND: readonly [number, number] = [0.2, 0.8];

/* -- Keeping the orb clear of bare text ------------------------------- */

/** Clearance between the orb's disc and a copy rect (CSS px). */
const COPY_GAP = 24;
/** The orb's measured silhouette is ~7% wider than ORB_RADIUS x px-per-unit (review C9). */
export const SILHOUETTE = 1.07;
/** "shrink" goes no smaller than this share of the pose's scale before it moves the orb as well. */
const AVOID_MIN_SCALE = 0.55;
/** A dodge keeps the orb's centre inside this vertical band of the viewport (fractions from the top). */
const AVOID_BAND: readonly [number, number] = [0.1, 0.92];
/** Moving up costs this much more than down or aside: the copy mostly sits above the orb's anchor. */
const UP_PENALTY = 1.3;
/** Copy rects considered per frame (the most a page shows at once is far fewer). */
const MAX_COPY_RECTS = 16;
/** Passes of the dodge: clearing one rect can meet the next. */
const AVOID_PASSES = 4;
const SHRINK_STEPS = 10;

export interface PoseContext {
  box: ScreenBox;
  /** The real camera's vertical fov in degrees, copied onto the scratch camera. */
  fov: number;
  /** Cells per axis of the orb's live marching-cubes grid (0: unknown, no cap). */
  fieldResolution: number;
  /** The smallest field box the orb affords (OrbControls.field.floor): bodies are sized for its cells. */
  fieldFloor: number;
  /** The satellites' side now (orb-direction), which an orb near the screen's centre line keeps. */
  satelliteSide: number;
  portrait: boolean;
  /** Added to anchor y: the scroll offset with reduced motion (a still frame of the page top), else 0. */
  documentScroll: number;
  /** The slot the rig's tracker holds this frame (orb-slots.ts), and the slots as measured (C: the contact cards). */
  slot: SlotChoice;
  slotA: SlotView;
  slotB: SlotView;
  slotC: SlotView;
  /**
   * The rig's timed glide between slots A and B (camera-rig.tsx): how far it is, eased (1: none
   * under way), and the slot it left, measured this frame. A slot hold puts the orb between the two.
   */
  glide: number;
  glideFrom: SlotView;
  /** Reused camera for projecting anchors through a pose's camera. */
  scratch: THREE.PerspectiveCamera;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** One disc to keep clear: centre offset from the orb's projected centre, and radius (CSS px). */
interface Disc {
  dx: number;
  dy: number;
  r: number;
}

const _hit = new THREE.Vector3();
const _point = new THREE.Vector3();
const _screen: ScreenPoint = { x: 0, y: 0, depth: 0 };
const _satellite: ScreenPoint = { x: 0, y: 0, depth: 0 };
const _copy: Rect[] = Array.from({ length: MAX_COPY_RECTS }, () => ({ x0: 0, y0: 0, x1: 0, y1: 0 }));
const _discs: Disc[] = Array.from({ length: 1 + SATELLITE_COLUMN.length }, () => ({ dx: 0, dy: 0, r: 0 }));
/** The panels of a cell layout this frame (at most MAX_CLUSTERS). */
const _panels: AnchorRect[] = Array.from({ length: MAX_CLUSTERS }, () => ({ x: 0, y: 0, width: 0, height: 0, visible: false }));

function laidOut(rects: AnchorRect[] | undefined): AnchorRect | null {
  if (!rects) return null;
  for (const rect of rects) if (rect.width > 0 && rect.height > 0) return rect;
  return null;
}

function aimScratch(ctx: PoseContext, camera: THREE.Vector3, look: THREE.Vector3): THREE.PerspectiveCamera {
  const scratch = ctx.scratch;
  const aspect = ctx.box.width / Math.max(ctx.box.height, 1);
  if (scratch.fov !== ctx.fov || scratch.aspect !== aspect) {
    scratch.fov = ctx.fov;
    scratch.aspect = aspect;
    scratch.updateProjectionMatrix();
  }
  scratch.position.copy(camera);
  scratch.lookAt(look);
  scratch.updateMatrixWorld();
  return scratch;
}

/**
 * Limits out.scale so that one grid cell at the orb's centre spans at most `cellPx` CSS px through
 * the pose's camera (in the full box: these poses keep it), but not below `floor`. Only ever
 * shrinks, about the centre: every clearance the pose found holds.
 */
function capToGrid(out: Pose, ctx: PoseContext, floor: number, maxCellPx: number): void {
  if (!(ctx.fieldResolution > 0)) return;
  const camera = aimScratch(ctx, out.camera, out.look);
  if (!worldToClient(_screen, camera, ctx.box, out.orb)) return;
  const cellPx = ((2 * FIELD_SCALE) / ctx.fieldResolution) * pixelsPerUnitAt(camera, ctx.box, _screen.depth);
  if (cellPx * out.scale > maxCellPx) out.scale = Math.min(out.scale, Math.max(maxCellPx / cellPx, floor));
}

/* -- Placing the bodies in their panels --------------------------------- */

/** Copies up to MAX_CLUSTERS laid-out rects of `name` into _panels; returns how many. */
function collectPanels(name: string, ctx: PoseContext): number {
  const rects = anchorRects.get(name);
  if (!rects) return 0;
  let count = 0;
  for (const rect of rects) {
    if (count >= MAX_CLUSTERS) break;
    if (!(rect.width > 0 && rect.height > 0)) continue;
    const panel = _panels[count++];
    panel.x = rect.x;
    panel.y = rect.y + ctx.documentScroll;
    panel.width = rect.width;
    panel.height = rect.height;
    panel.visible = rect.visible;
  }
  return count;
}

/**
 * The panels a cell pose splits into, into _panels, on every screen (side by side or stacked):
 * their count, or 0 when they are not laid out this frame and the pose's other placement holds.
 */
function cellPanels(source: CellSource, ctx: PoseContext): number {
  switch (source) {
    case "hero":
      return collectPanels(ANCHORS.orbSlotHero, ctx) > 0 ? 1 : 0;
    case "about":
      return collectPanels(ANCHORS.aboutCell, ctx);
    case "contact":
      return collectPanels(ANCHORS.contactCell, ctx);
    case "practice":
      return collectPanels(ANCHORS.practiceCell, ctx);
    case "tech":
      return collectPanels(ANCHORS.practiceTech, ctx) > 0 ? 1 : 0;
    case "cta":
      return collectPanels(ANCHORS.practiceCtaCell, ctx) > 0 ? 1 : 0;
    case "services": {
      // The windows of the three practice cards, in SERVICE_SLUGS order (the bodies' practice groups).
      for (let g = 0; g < SERVICE_SLUGS.length; g++) {
        const frame = laidOut(anchorRects.get(ANCHORS.practice(SERVICE_SLUGS[g])));
        if (!frame) return 0;
        const panel = _panels[g];
        panel.x = frame.x;
        panel.y = frame.y + ctx.documentScroll;
        panel.width = frame.width;
        panel.height = frame.height;
        panel.visible = frame.visible;
      }
      return SERVICE_SLUGS.length;
    }
  }
}

/**
 * The body's radius (CSS px) a cell source gives a panel: wholly inside it, with room. The pill
 * row counts as a panel too: its body sits behind the middle pills, which glow (a phone's row wraps
 * into a tall block, a wide screen's is one or two pills tall).
 */
function cellFit(source: CellSource, panel: AnchorRect, box: ScreenBox): number {
  const side = Math.min(panel.width, panel.height);
  if (source === "hero") return Math.min(HERO_FILL * box.height, HERO_SECTION_FILL * side);
  return CELL_FILL * side;
}

/**
 * The scale at which bodies of a `count`-way split are `radius` px on screen. Split, that is all:
 * the view box gives them cells of the size they need however far apart they are (orb-field.ts).
 * Merged (one cell: the hero, the pill row, the call to action), the compact box's grid caps it at
 * the box the orb affords.
 */
function cellScale(count: number, radius: number, unitPx: number, ctx: PoseContext): number {
  const scale = radius / (splitRadius(count) * SILHOUETTE * unitPx);
  if (count > 1 || !(ctx.fieldResolution > 0)) return scale;
  const half = Math.max(ctx.fieldFloor, MERGED_BODY_EXTENT + FIELD_ROOM);
  // At the floor: cell = 2 F / res x unitPx x scale.
  return Math.min(scale, (bodyCellPx(1, false) * ctx.fieldResolution) / (2 * half * unitPx));
}

/**
 * Cell poses: one body inside each panel, its centre on the panel's centre and its radius
 * cellFit of the panel (the smallest panel's, so every body is the same size), the merged orb's
 * within the grid's cap. Every body sits on its own panel wherever the panel is, off screen too,
 * and the whole pose rides with the page (the rig carries it).
 */
function placeCells(out: Pose, spec: PoseSpec, ctx: PoseContext, count: number, source: CellSource): void {
  const box = ctx.box;
  const camera = aimScratch(ctx, out.camera, out.look);
  let radius = Infinity;
  let cx = 0;
  let cy = 0;
  for (let k = 0; k < count; k++) {
    const p = _panels[k];
    radius = Math.min(radius, cellFit(source, p, box));
    cx += (p.x + p.width / 2) / count;
    cy += (p.y + p.height / 2) / count;
  }
  if (!clientToPlaneZ(_hit, camera, box, cx, cy, spec.orb[2]) || !worldToClient(_screen, camera, box, _hit)) return;
  const unitPx = pixelsPerUnitAt(camera, box, _screen.depth);
  if (!(unitPx > 0)) return;
  const scale = cellScale(count, radius, unitPx, ctx);
  const cells = out.cells;
  for (let k = 0; k < count; k++) {
    const p = _panels[k];
    cells.x[k] = p.x + p.width / 2;
    cells.y[k] = p.y + p.height / 2;
    cells.panels[4 * k] = p.x;
    cells.panels[4 * k + 1] = p.y;
    cells.panels[4 * k + 2] = p.x + p.width;
    cells.panels[4 * k + 3] = p.y + p.height;
  }
  for (let k = count; k < MAX_CLUSTERS; k++) {
    cells.x[k] = cx;
    cells.y[k] = cy;
    cells.panels.fill(0, 4 * k, 4 * k + 4);
  }
  cells.count = count;
  cells.radius = splitRadius(count) * SILHOUETTE * unitPx * scale;
  // The panels hold their bodies in; the hero's slot and the pill row (whose body dissolves into
  // the pills' droplets) are no panels.
  cells.walled = source !== "hero" && source !== "tech";
  out.orb.copy(_hit);
  out.scale = scale;
  out.anchored = 1;
  out.practices = source === "services" ? 1 : 0;
  out.cellLinks = source === "practice" || source === "tech" || source === "cta" ? 1 : 0;
  out.droplets = source === "tech" ? 1 : 0;
}

/** The single cell of a merged orb, where the pose put its centre (as seen through the pose's camera). */
function singleCell(out: Pose, ctx: PoseContext): void {
  const cells = out.cells;
  cells.count = 1;
  cells.panels.fill(0);
  cells.walled = false;
  const camera = aimScratch(ctx, out.camera, out.look);
  if (!worldToClient(_screen, camera, ctx.box, out.orb)) return;
  cells.radius = ORB_RADIUS * SILHOUETTE * out.scale * pixelsPerUnitAt(camera, ctx.box, _screen.depth);
  for (let k = 0; k < MAX_CLUSTERS; k++) {
    cells.x[k] = _screen.x;
    cells.y[k] = _screen.y;
  }
}

/* -- Placing the orb in a slot ------------------------------------------ */

/**
 * The orb's silhouette radius (CSS px) in a slot `height` px tall: SLOT_FILL of it, within the
 * grid's cap for the merged orb at this resolution (the cap as a radius: MERGED_CELL_PX per cell
 * times ORB_RADIUS in cells, in the full box, the same at any depth).
 */
export function slotRadius(height: number, resolution: number): number {
  const fit = SLOT_FILL * height;
  if (!(resolution > 0)) return fit;
  return Math.min(fit, MERGED_CELL_PX * ((ORB_RADIUS * SILHOUETTE * resolution) / (2 * FIELD_SCALE)));
}

/** Measures a slot from its anchor this frame (shifted by documentScroll, like every hold). */
export function measureSlot(out: SlotView, name: string, ctx: PoseContext): void {
  const rect = laidOut(anchorRects.get(name));
  out.valid = rect !== null;
  if (!rect) return;
  // Centred compositions keep the orb on the centre line, as every portrait hold does.
  out.x = ctx.portrait ? ctx.box.left + ctx.box.width / 2 : rect.x + rect.width / 2;
  out.y = rect.y + rect.height / 2 + ctx.documentScroll;
  out.height = rect.height;
  out.radius = slotRadius(rect.height, ctx.fieldResolution);
}

/**
 * Measures station C, the contact cards, as the tracker sees it: valid with the cards laid out
 * (side by side, or stacked on a phone), centred on them, the bodies' radius CELL_FILL of a card's
 * shorter side.
 */
export function measureContactCells(out: SlotView, ctx: PoseContext): void {
  const count = collectPanels(ANCHORS.contactCell, ctx);
  out.valid = count > 0;
  if (!out.valid) return;
  let x = 0;
  let y = 0;
  let side = Infinity;
  let height = 0;
  for (let k = 0; k < count; k++) {
    const p = _panels[k];
    x += (p.x + p.width / 2) / count;
    y += (p.y + p.height / 2) / count;
    side = Math.min(side, p.width, p.height);
    height = Math.max(height, p.height);
  }
  out.x = x;
  out.y = y;
  out.height = height;
  out.radius = CELL_FILL * side;
}

const _slotEye = new THREE.Vector3();
const _slotLook = new THREE.Vector3();

/**
 * Where the orb's centre goes in a slot: the slot's centre on the slots' plane, through the slots'
 * camera (both SLOT_POSE's). Leaves ctx.scratch aimed through that camera. False if not laid out.
 */
function slotCentre(out: THREE.Vector3, view: SlotView, ctx: PoseContext): boolean {
  if (!view.valid) return false;
  const spec = specFor(SLOT_POSE, ctx.portrait);
  _slotEye.set(spec.camera[0], spec.camera[1], spec.camera[2]);
  _slotLook.set(spec.look[0], spec.look[1], spec.look[2]);
  const camera = aimScratch(ctx, _slotEye, _slotLook);
  return clientToPlaneZ(out, camera, ctx.box, view.x, view.y, spec.orb[2]);
}

/**
 * The orb's scale whose silhouette is `view`'s radius at `centre` (on the slots' plane), through
 * ctx.scratch as slotCentre left it aimed. NaN if it does not project.
 */
function slotScale(view: SlotView, centre: THREE.Vector3, ctx: PoseContext): number {
  if (!worldToClient(_screen, ctx.scratch, ctx.box, centre)) return NaN;
  const unitPx = pixelsPerUnitAt(ctx.scratch, ctx.box, _screen.depth);
  return unitPx > 0 ? view.radius / (ORB_RADIUS * SILHOUETTE * unitPx) : NaN;
}

const _glideFrom = new THREE.Vector3();

/**
 * A slot hold: the orb's centre at the slot's centre, its silhouette the slot's radius. Mid-glide
 * (ctx.glide < 1) it is that far from the slot it left to this one, both measured this frame, so the
 * page's scroll still carries the whole path.
 */
function placeInSlot(out: Pose, ctx: PoseContext): void {
  const view = ctx.slot === "a" ? ctx.slotA : ctx.slotB;
  if (!slotCentre(_hit, view, ctx)) return;
  let scale = slotScale(view, _hit, ctx);
  if (!Number.isFinite(scale)) return;
  const from = ctx.glideFrom;
  if (ctx.glide < 1 && from.valid && slotCentre(_glideFrom, from, ctx)) {
    const fromScale = slotScale(from, _glideFrom, ctx);
    if (Number.isFinite(fromScale)) {
      _hit.lerpVectors(_glideFrom, _hit, ctx.glide);
      scale = lerp(fromScale, scale, ctx.glide);
    }
  }
  out.orb.copy(_hit);
  out.scale = scale;
  out.anchored = 1;
}

/** The bare text on screen this frame (shifted by documentScroll), into _copy. Returns the count. */
function collectCopy(ctx: PoseContext): number {
  const box = ctx.box;
  let count = 0;
  for (const name of [ANCHORS.copy, ANCHORS.practiceCopy]) {
    const rects = anchorRects.get(name);
    if (!rects) continue;
    for (const rect of rects) {
      if (count >= MAX_COPY_RECTS) return count;
      if (!(rect.width > 0 && rect.height > 0)) continue;
      const y = rect.y + ctx.documentScroll;
      if (y + rect.height <= box.top || y >= box.top + box.height) continue;
      if (rect.x + rect.width <= box.left || rect.x >= box.left + box.width) continue;
      const out = _copy[count++];
      out.x0 = rect.x;
      out.y0 = y;
      out.x1 = rect.x + rect.width;
      out.y1 = y + rect.height;
    }
  }
  return count;
}

/**
 * Hero without its slot (the 404): the orb's centre on the top edge of the doors row (or the
 * bottom of the actions row).
 */
function placeHeroOrb(out: Pose, spec: PoseSpec, ctx: PoseContext): void {
  const box = ctx.box;
  const doors = laidOut(anchorRects.get(ANCHORS.heroDoors));
  // Below 900 px the doors are hidden: the actions row is the fallback, its bottom edge in the
  // doors' role, so the buttons still get the orb's upper half.
  const actions = doors ? null : laidOut(anchorRects.get(ANCHORS.heroActions));
  const row = doors ?? actions;
  if (!row) return;
  // Aimed first: the clamp below needs the orb's projected size.
  const camera = aimScratch(ctx, out.camera, out.look);
  const x = ctx.portrait ? box.left + box.width / 2 : row.x + row.width / 2;
  const bandTop = box.top + HERO_BAND[0] * box.height;
  const bandBottom = box.top + HERO_BAND[1] * box.height;
  let y = clamp((doors ? row.y : row.y + row.height) + ctx.documentScroll, bandTop, bandBottom);

  // Legibility wins over the composition: the orb's top edge stays HERO_COPY_GAP below the lowest
  // bare text above the row (the lead; the 404's h1), shrinking the orb rather than leaving the band.
  // On screen or not: the rule must not let go (and the orb jump) as the lead scrolls away.
  const rowTop = row.y + ctx.documentScroll;
  let copyBottom = -Infinity;
  for (const rect of anchorRects.get(ANCHORS.copy) ?? []) {
    if (!(rect.width > 0 && rect.height > 0)) continue;
    const bottom = rect.y + rect.height + ctx.documentScroll;
    if (bottom <= rowTop + 1) copyBottom = Math.max(copyBottom, bottom);
  }
  if (copyBottom > -Infinity) {
    const unitPx = pixelsPerUnitAt(camera, box, Math.max(out.camera.z - spec.orb[2], 0.5));
    let radius = ORB_RADIUS * out.scale * unitPx * SILHOUETTE;
    if (copyBottom + HERO_COPY_GAP + radius > bandBottom && radius > 0) {
      const room = Math.max(bandBottom - copyBottom - HERO_COPY_GAP, 0);
      // From the grid-capped scale: the floor never grows the orb back past the cap.
      const scale = Math.max(HERO_MIN_SCALE * out.scale, (out.scale * room) / radius);
      radius *= scale / out.scale;
      out.scale = scale;
    }
    y = Math.max(y, copyBottom + HERO_COPY_GAP + radius);
  }
  if (clientToPlaneZ(_hit, camera, box, x, y, spec.orb[2])) out.orb.copy(_hit);
}

/**
 * Practice hero: the orb right of the title block, its left edge PRACTICE_ORB_GAP clear of the
 * text. Portrait (the copy spans the width): centred, its top edge that far below the copy.
 */
function placePracticeOrb(out: Pose, spec: PoseSpec, ctx: PoseContext): void {
  const box = ctx.box;
  const copy = laidOut(anchorRects.get(ANCHORS.practiceCopy));
  if (!copy) return;
  const camera = aimScratch(ctx, out.camera, out.look);
  const depth = Math.max(out.camera.z - spec.orb[2], 0.5);
  const unitPx = pixelsPerUnitAt(camera, box, depth);

  if (ctx.portrait) {
    const below = copy.y + copy.height + ctx.documentScroll + PRACTICE_ORB_GAP + ORB_RADIUS * out.scale * unitPx;
    const y = clamp(below, box.top + PRACTICE_PORTRAIT_Y_BAND[0] * box.height, box.top + PRACTICE_PORTRAIT_Y_BAND[1] * box.height);
    if (clientToPlaneZ(_hit, camera, box, box.left + box.width / 2, y, spec.orb[2])) out.orb.copy(_hit);
    return;
  }

  const centreX = copy.x + copy.width / 2;
  const textRight = centreX + Math.min(copy.width / 2, PRACTICE_COPY_MAX_HALF_WIDTH);
  // From the grid-capped scale, so the gap to the text is measured on the orb as it will be drawn.
  let scale = out.scale;
  let radius = ORB_RADIUS * scale * unitPx;
  const room = box.left + box.width - PRACTICE_EDGE_MARGIN - (textRight + PRACTICE_ORB_GAP);
  if (2 * radius > room && radius > 0) {
    scale = Math.max(PRACTICE_MIN_SCALE * out.scale, (scale * Math.max(room, 0)) / (2 * radius));
    radius = ORB_RADIUS * scale * unitPx;
  }
  const x = textRight + PRACTICE_ORB_GAP + radius;
  const y = clamp(
    copy.y + copy.height / 2 + ctx.documentScroll,
    box.top + PRACTICE_Y_BAND[0] * box.height,
    box.top + PRACTICE_Y_BAND[1] * box.height,
  );
  if (clientToPlaneZ(_hit, camera, box, x, y, spec.orb[2])) {
    out.orb.copy(_hit);
    out.scale = scale;
  }
}

/** A hold behind an element: the orb's centre behind the centre of the spec's anchor. */
function placeBehind(out: Pose, spec: PoseSpec, ctx: PoseContext): void {
  const rect = spec.anchor ? laidOut(anchorRects.get(spec.anchor)) : null;
  if (!rect) return;
  const box = ctx.box;
  const camera = aimScratch(ctx, out.camera, out.look);
  const x = ctx.portrait ? box.left + box.width / 2 : rect.x + rect.width / 2;
  const y = clamp(
    rect.y + rect.height / 2 + ctx.documentScroll,
    box.top + BEHIND_BAND[0] * box.height,
    box.top + BEHIND_BAND[1] * box.height,
  );
  if (clientToPlaneZ(_hit, camera, box, x, y, spec.orb[2])) out.orb.copy(_hit);
}

/* -- The dodge --------------------------------------------------------- */

/**
 * The shift (CSS px, >= 0) along one axis direction that takes a disc of radius `reach`
 * (radius + gap) at (cx, cy) clear of a rect, or 0 when it is already clear.
 * axis 0: +y (down), 1: -y (up), 2: +x (right), 3: -x (left).
 */
function shiftToClear(cx: number, cy: number, reach: number, rect: Rect, axis: number): number {
  const nx = cx < rect.x0 ? rect.x0 - cx : cx > rect.x1 ? cx - rect.x1 : 0;
  const ny = cy < rect.y0 ? rect.y0 - cy : cy > rect.y1 ? cy - rect.y1 : 0;
  if (nx * nx + ny * ny >= reach * reach) return 0;
  if (axis <= 1) {
    // Vertical: how far beyond the rect's edge the centre must be, given its sideways distance.
    const h = nx > 0 ? Math.sqrt(reach * reach - nx * nx) : reach;
    return axis === 0 ? Math.max(rect.y1 + h - cy, 0) : Math.max(cy - (rect.y0 - h), 0);
  }
  const w = ny > 0 ? Math.sqrt(reach * reach - ny * ny) : reach;
  return axis === 2 ? Math.max(rect.x1 + w - cx, 0) : Math.max(cx - (rect.x0 - w), 0);
}

const AXIS_X = [0, 0, 1, -1] as const;
const AXIS_Y = [1, -1, 0, 0] as const;

/** Total shift along `axis` that clears every disc from every rect (a few passes), or Infinity. */
function dodgeAlong(cx: number, cy: number, discs: Disc[], discCount: number, scale: number, rects: number, axis: number): number {
  let shift = 0;
  for (let pass = 0; pass < AVOID_PASSES; pass++) {
    const x = cx + AXIS_X[axis] * shift;
    const y = cy + AXIS_Y[axis] * shift;
    let need = 0;
    for (let d = 0; d < discCount; d++) {
      const disc = discs[d];
      const reach = disc.r * scale + COPY_GAP;
      for (let i = 0; i < rects; i++) {
        need = Math.max(need, shiftToClear(x + disc.dx * scale, y + disc.dy * scale, reach, _copy[i], axis));
      }
    }
    if (need <= 0.5) return shift;
    shift += need;
  }
  return Infinity;
}

/** Every disc is clear of every rect (to half a pixel: a placement exactly at the gap counts). */
function clearAt(cx: number, cy: number, discs: Disc[], discCount: number, scale: number, rects: number): boolean {
  for (let d = 0; d < discCount; d++) {
    const disc = discs[d];
    const reach = disc.r * scale + COPY_GAP;
    for (let i = 0; i < rects; i++) {
      if (shiftToClear(cx + disc.dx * scale, cy + disc.dy * scale, reach, _copy[i], 0) > 0.5) return false;
    }
  }
  return true;
}

/**
 * The orb's discs on screen, relative to its projected centre (at scale 1 of the pose): the orb,
 * and on a practice page its two satellites in the pose's arrangement. Returns the count.
 */
function orbDiscs(out: Pose, camera: THREE.Camera, ctx: PoseContext, cx: number, cy: number, unitPx: number): number {
  _discs[0].dx = 0;
  _discs[0].dy = 0;
  _discs[0].r = ORB_RADIUS * out.scale * unitPx * SILHOUETTE;
  let count = 1;
  if (motion.story.practice !== "" && out.satellites > 0) {
    // Satellites go to the outer side of the main body, as orb-direction places them.
    const side = satelliteSide(cx, ctx.box, ctx.satelliteSide);
    for (let k = 0; k < SATELLITE_COLUMN.length; k++) {
      satelliteOffset(_point, k, out.satelliteRow, side, out.camera, out.look, out.orb).multiplyScalar(out.scale).add(out.orb);
      if (!worldToClient(_satellite, camera, ctx.box, _point)) continue;
      const disc = _discs[count++];
      disc.dx = _satellite.x - cx;
      disc.dy = _satellite.y - cy;
      disc.r = SATELLITE_RADIUS * out.scale * pixelsPerUnitAt(camera, ctx.box, _satellite.depth) * SILHOUETTE;
    }
  }
  // Offsets and radii above are at the pose's scale; the dodge scales them from 1. The lone orb
  // too: left at the pose's scale, it counted scale^2 of its radius (harmless only at scale 1).
  const s = out.scale > 0 ? out.scale : 1;
  for (let d = 0; d < count; d++) {
    _discs[d].dx /= s;
    _discs[d].dy /= s;
    _discs[d].r /= s;
  }
  return count;
}

/**
 * Keeps the orb's disc (and its satellites') COPY_GAP clear of every copy rect on screen, by the
 * spec's rule, after the pose is placed. Scale changes go to out.scale, moves to out.orb.
 */
function avoidCopy(out: Pose, spec: PoseSpec, ctx: PoseContext): void {
  const rects = collectCopy(ctx);
  if (rects === 0) return;
  const box = ctx.box;
  const camera = aimScratch(ctx, out.camera, out.look);
  if (!worldToClient(_screen, camera, box, out.orb)) return;
  const cx = _screen.x;
  const cy = _screen.y;
  const unitPx = pixelsPerUnitAt(camera, box, _screen.depth);
  if (!(unitPx > 0)) return;
  const discs = orbDiscs(out, camera, ctx, cx, cy, unitPx);
  let scale = out.scale > 0 ? out.scale : 1;
  if (clearAt(cx, cy, _discs, discs, scale, rects)) return;

  const mode: Avoid = spec.avoid ?? "move";
  if (mode === "shrink") {
    // The largest scale (down to the floor) at which the orb clears where it is.
    const floor = AVOID_MIN_SCALE * scale;
    if (clearAt(cx, cy, _discs, discs, floor, rects)) {
      let lo = floor;
      let hi = scale;
      for (let i = 0; i < SHRINK_STEPS; i++) {
        const mid = (lo + hi) / 2;
        if (clearAt(cx, cy, _discs, discs, mid, rects)) lo = mid;
        else hi = mid;
      }
      out.scale = lo;
      return;
    }
    // Not even the smallest orb fits here: shrink to the floor, then move it as well.
    scale = floor;
  }

  const top = box.top + AVOID_BAND[0] * box.height;
  const bottom = box.top + AVOID_BAND[1] * box.height;
  let bestAxis = -1;
  let bestShift = 0;
  let bestCost = Infinity;
  for (let axis = 0; axis < 4; axis++) {
    if (mode === "vertical" && axis > 1) continue;
    const shift = dodgeAlong(cx, cy, _discs, discs, scale, rects, axis);
    if (!Number.isFinite(shift)) continue;
    const x = cx + AXIS_X[axis] * shift;
    const y = cy + AXIS_Y[axis] * shift;
    const r = _discs[0].r * scale;
    if (y < top || y > bottom || x - r < box.left || x + r > box.left + box.width) continue;
    const cost = shift * (axis === 1 ? UP_PENALTY : 1);
    if (cost < bestCost) {
      bestCost = cost;
      bestAxis = axis;
      bestShift = shift;
    }
  }
  out.scale = scale;
  // Nowhere on screen clears the text: stay put (the composite's guard keeps the text legible).
  if (bestAxis < 0) return;
  const x = cx + AXIS_X[bestAxis] * bestShift;
  const y = cy + AXIS_Y[bestAxis] * bestShift;
  if (clientToPlaneZ(_hit, camera, box, x, y, out.orb.z)) out.orb.copy(_hit);
}

/** Evaluates a named pose for this frame (unknown or missing names use the fallback pose). */
export function evaluatePose(out: Pose, name: string | undefined, ctx: PoseContext): void {
  const spec = resolveSpec(name, ctx);
  out.camera.set(spec.camera[0], spec.camera[1], spec.camera[2]);
  out.look.set(spec.look[0], spec.look[1], spec.look[2]);
  out.orb.set(spec.orb[0], spec.orb[1], spec.orb[2]);
  out.scale = spec.scale;
  out.boards = spec.boards;
  out.nodes = spec.nodes;
  out.satelliteRow = spec.satelliteRow ?? 0;
  out.cellMix = 0;
  out.anchored = 0;
  out.practices = 0;
  out.cellLinks = 0;
  out.droplets = 0;
  out.satellites = spec.satellites ? 1 : 0;
  const isSlot = spec.layout === "slot" && spec.cells === undefined;

  // The orb inside the section's panels, when the page lays them out.
  const cellCount = spec.cells ? cellPanels(spec.cells, ctx) : 0;
  if (spec.cells && cellCount > 0) {
    // Inside its panel by construction, so clear of the section heads around it: no dodge.
    placeCells(out, spec, ctx, cellCount, spec.cells);
    return;
  }
  // Sized to its gap, within the grid's cap (slotRadius), and clear of the copy by construction.
  if (isSlot) {
    placeInSlot(out, ctx);
    singleCell(out, ctx);
    return;
  }
  // The cap by body size: a practice page's bodies are small; everything else is the merged orb.
  const maxCellPx = motion.story.practice !== "" ? SMALL_CELL_PX : MERGED_CELL_PX;
  // The grid's cap first, so a layout places the orb at the size it will be drawn...
  capToGrid(out, ctx, 0, maxCellPx);
  if (spec.layout === "hero") placeHeroOrb(out, spec, ctx);
  else if (spec.layout === "practice-hero") placePracticeOrb(out, spec, ctx);
  else if (spec.layout === "behind") placeBehind(out, spec, ctx);
  avoidCopy(out, spec, ctx);
  // ...and again where it ended up: through a tilted camera a moved orb has another depth.
  capToGrid(out, ctx, 0, maxCellPx);
  singleCell(out, ctx);
}

/* -- Blending ---------------------------------------------------------- */

/**
 * Transits dive: mid-way the orb is this much deeper and lower (world units, at the peak of
 * 4u(1 - u)), so it passes under and behind the copy ~30% smaller and fogged, then resurfaces
 * at the next pose (review M7). The same arc bridges a page change and a change of slot (camera-rig).
 */
const TRANSIT_RECEDE = 2;
const TRANSIT_DIP = 0.6;

/** Adds the transit dive at progress u (0..1) to a pose's orb, `weight` of it (a partial blend). */
export function applyTransitArc(out: Pose, u: number, weight = 1): void {
  const arc = 4 * u * (1 - u) * weight;
  if (!(arc > 0)) return;
  out.orb.z -= TRANSIT_RECEDE * arc;
  out.orb.y -= TRANSIT_DIP * arc;
}

/**
 * Blends two single poses at t (the rig's timed move between two sections, eased); `dive` adds the
 * transit arc (not between two poses that hold the same slot). The bodies go from a's cells to
 * b's: out.cells is a's, out.next b's, out.cellMix t. The droplets' share blends by the move's
 * `linear` progress instead, so their hand-over runs at an even pace over its part of the move
 * (on the eased t it would crowd into a fifth of a second).
 */
export function blendPoses(out: Pose, a: Pose, b: Pose, t: number, dive = true, linear = t): void {
  out.camera.lerpVectors(a.camera, b.camera, t);
  out.look.lerpVectors(a.look, b.look, t);
  out.orb.lerpVectors(a.orb, b.orb, t);
  out.scale = lerp(a.scale, b.scale, t);
  out.boards = lerp(a.boards, b.boards, t);
  out.nodes = lerp(a.nodes, b.nodes, t);
  out.satelliteRow = lerp(a.satelliteRow, b.satelliteRow, t);
  copyCellSet(out.cells, a.cells);
  copyCellSet(out.next, b.cells);
  out.cellMix = t;
  out.anchored = lerp(a.anchored, b.anchored, t);
  out.practices = lerp(a.practices, b.practices, t);
  out.satellites = lerp(a.satellites, b.satellites, t);
  out.cellLinks = lerp(a.cellLinks, b.cellLinks, t);
  out.droplets = lerp(a.droplets, b.droplets, linear);
  if (dive) applyTransitArc(out, t);
}
