import * as THREE from "three";
import { MAX_ORB_BODIES } from "../../motion/store";

/** The three practice groups, in SERVICE_SLUGS order: infrastructure, development, security. */
export const GROUP_COUNT = 3;

/**
 * Most bodies the orb splits into: one per panel cell (motion/store.ts MAX_ORB_BODIES: About 2,
 * Services 3, Contact 3, and since v3 a practice page's feature cards, up to 9).
 */
export const MAX_CLUSTERS = MAX_ORB_BODIES;
/** Most technology pills given a droplet (v3.1): each is published as one of motion.bodies too. */
export const MAX_DROPLETS = MAX_ORB_BODIES;

/** One value per practice group. */
export type GroupValues = [number, number, number];

/** One value per cluster (MAX_CLUSTERS entries). */
export type ClusterValues = number[];

function clusterValues(value: number): ClusterValues {
  return Array.from({ length: MAX_CLUSTERS }, () => value);
}

/**
 * One arrangement of the orb's bodies (owner decision 2026-11-02: the orb splits into as many
 * bodies as a section has panels): `count` clusters, metaball i in cluster i % count. One cluster
 * is the merged orb at the centre.
 */
export interface OrbLayout {
  /** 1..MAX_CLUSTERS. */
  count: number;
  /**
   * Physics-space offsets of the clusters from the centre (MAX_CLUSTERS of them; the first `count`
   * are used): each its cell's centre, wherever on the page the cell is.
   */
  clusters: THREE.Vector3[];
}

export function createOrbLayout(): OrbLayout {
  return { count: 1, clusters: Array.from({ length: MAX_CLUSTERS }, () => new THREE.Vector3()) };
}

/**
 * The view box (orb-field.ts, choreography v3), as the rig measured it this frame in world units:
 * the camera's visible region at the bodies' depth (narrowed to the cells' extent), a slab as deep
 * as the bodies need, and the grid cell that keeps the bodies smooth at their size on screen.
 */
export interface ViewBox {
  /** The bodies are split into cells (a layout in play has two or more): the orb uses this box. */
  split: boolean;
  centre: THREE.Vector3;
  /** Half extents per axis, world units. */
  half: THREE.Vector3;
  /** Side of a grid cell, world units (before the orb's cell budget coarsens it). */
  cell: number;
  /**
   * The balls' reach cut, physics units (orb-field SPLIT_REACH_RADII of the split's bodies), or 0
   * for none: a split of big bodies keeps three's full reach.
   */
  reach: number;
}

/**
 * What the choreography asks of the orb this frame. Written by the world's rig (one writer, at
 * FRAME_ORDER.rig), read by the orb and the pointer body; `field.floor` is the orb's own answer
 * (see there). Plain mutable data, never React state.
 */
export interface OrbControls {
  /** Field centre, world units. Physics and render space share it (see orb-field.ts). */
  centre: THREE.Vector3;
  /** Pose scale of the orb about its centre (1 = field scale 5). */
  scale: number;
  /**
   * The layout the bodies come from and the one they go to, and how far (0..1): metaball i aims at
   * mix(from.clusters[i % from.count], to.clusters[i % to.count], mix), so moving between layouts
   * of different counts the bodies divide and merge like liquid. Holding, both are the same.
   */
  from: OrbLayout;
  to: OrbLayout;
  mix: number;
  /**
   * The streams' sideways sweep between two layouts goes by the direction from `from` to `to`: -1
   * while the rig runs a move back over one the other way (a reversal), so the sweep keeps its side
   * and the bodies turn back where they are instead of swinging across.
   */
  sweep: number;
  /** Metaball strength multiplier per practice group: practice emphasis. */
  strength: GroupValues;
  /** Vertex-colour gain per practice group. */
  brightness: GroupValues;
  /**
   * Per cluster of the layout the bodies are in (to when mix >= 0.5, else from): a strength gain
   * (the hovered panel's body swells, a click's short swell) and a vertex-colour gain.
   */
  swell: ClusterValues;
  glow: ClusterValues;
  /**
   * Iso radius of one body of the layout the bodies are in (physics units at scale 1, orb-field
   * splitRadius): the cursor's body and the splash are sized to the bodies they act on.
   */
  bodyRadius: number;
  /**
   * 0..1: how much of the layout is the Services one, where each of the three bodies reflects its
   * practice's photo instead of the circuit (owner decision 2026-11-02).
   */
  practiceMix: number;
  /** Group of the current practice page, or -1. */
  practiceGroup: number;
  /** 0..1: how far the other two groups have moved out as satellites of the practice body. */
  satellite: number;
  /** Physics-space offsets of the two satellites (other groups in ascending order) from the centre. */
  satellites: [THREE.Vector3, THREE.Vector3];
  /** Extra acceleration for every body, units/s^2 (the scroll's inertial slosh, already clamped). */
  inertia: THREE.Vector3;
  /**
   * The panels the bodies are held in (owner decision 2026-11-02, v3.1: "make the interaction
   * contained inside the panel"). While `active` (the layout holds, and its cells are panels), the
   * body of cluster k stays inside panels[4k..4k+3] (client px x0, y0, x1, y1 as laid out this frame;
   * zeros: free): a soft wall at that rect, less the body's iso margin and a small margin, keeps its
   * metaballs in under pushes, stirs and splashes (orb.tsx). The hero's orb and the slots' are free.
   */
  contain: { active: boolean; count: number; panels: Float64Array };
  /**
   * The technology pills' droplets (v3.1): one small liquid droplet in each pill, drawn as instanced
   * refractive beads (pill-droplets.ts), a pill being too small for the field's grid. Client px per
   * pill: where its droplet rests and the room it has there (the centre and half extents of the
   * pill's bead window, logo-v3-2.md: the droplet stays wholly inside it), its droplet's radius,
   * and the pill's rect (left, top, right, bottom: the pointer over it stirs the droplet).
   * `handover` 0..1: how far the liquid has gone from the orb's body into them (they leave its
   * body, fly to their pills and grow; and back).
   */
  droplets: {
    count: number;
    x: Float64Array;
    y: Float64Array;
    hw: Float64Array;
    hh: Float64Array;
    radius: Float64Array;
    pill: Float64Array;
    handover: number;
  };
  /** 0..1: how far the metaballs have dissolved into the droplets meanwhile (their strength x (1 - dissolve)). */
  dissolve: number;
  /**
   * World units the rig moved the centre this frame to keep an anchored orb with the page (its
   * bodies sit in panels and slots that scroll), zero otherwise. The orb moves its bodies and its
   * built field by the same amount, so the liquid travels with the page instead of trailing it
   * (its springs could not keep up with a scroll); the scroll's slosh above still rocks it.
   */
  carry: THREE.Vector3;
  /**
   * The rig is gliding the orb between the Partners slots (A and B) and carrying it there: `carry`
   * is then the centre's whole motion, so the liquid rides the glide, and the bodies' springs hold
   * its shape as tightly as in a move between two sections (orb.tsx).
   */
  gliding: boolean;
  /**
   * World units/s the rig hands to every body once (then zeroes): a glide cut short by another
   * station leaves the liquid moving at the glide's speed instead of stopping it dead (the carry
   * moved the bodies; their own velocity was the springs' alone).
   */
  handoff: THREE.Vector3;
  /**
   * The field box (orb-field.ts). wish: the largest half extent that keeps the grid's cells under
   * their cap at the orb's size on screen this frame (the rig's; FIELD_SCALE when nothing caps it).
   * floor: the smallest the orb allows from its measured rebuild cost (the orb's, read by the poses
   * so they size the orb for the cells it can afford). These two are the compact box's, centred on
   * the orb (the merged orb's, v2). view: the view box the orb uses instead while it is split, or
   * while bodies are still too far out for the compact box (the rig's, every frame).
   */
  field: { wish: number; floor: number; view: ViewBox };
  /** The pointer may push the orb (off with reduced motion). */
  pointerEnabled: boolean;
  /** Reduced motion has settled: physics is paused and the frame must not change. */
  still: boolean;
  /** Written by the orb each frame: how many of motion.bodies are its liquid bodies (the droplets follow them). */
  liquidBodies: number;
  /**
   * Bumped by the rig when the pose jumped instead of moving (first frame, or a new page while
   * the scene is still or paused). With the scene's clock stopped the bodies cannot fly there, so
   * the orb settles them into the new pose at once (see orb.tsx settleNow).
   */
  settleSerial: number;
}

export function createOrbControls(centre: THREE.Vector3, fieldFloor: number): OrbControls {
  return {
    centre: centre.clone(),
    scale: 1,
    from: createOrbLayout(),
    to: createOrbLayout(),
    mix: 0,
    sweep: 1,
    strength: [1, 1, 1],
    brightness: [1, 1, 1],
    swell: clusterValues(1),
    glow: clusterValues(1),
    bodyRadius: 1.15,
    practiceMix: 0,
    practiceGroup: -1,
    satellite: 0,
    satellites: [new THREE.Vector3(), new THREE.Vector3()],
    inertia: new THREE.Vector3(),
    contain: { active: false, count: 1, panels: new Float64Array(4 * MAX_CLUSTERS) },
    droplets: {
      count: 0,
      x: new Float64Array(MAX_DROPLETS),
      y: new Float64Array(MAX_DROPLETS),
      hw: new Float64Array(MAX_DROPLETS),
      hh: new Float64Array(MAX_DROPLETS),
      radius: new Float64Array(MAX_DROPLETS),
      pill: new Float64Array(4 * MAX_DROPLETS),
      handover: 0,
    },
    dissolve: 0,
    carry: new THREE.Vector3(),
    gliding: false,
    handoff: new THREE.Vector3(),
    field: {
      wish: 5,
      floor: fieldFloor,
      view: { split: false, centre: centre.clone(), half: new THREE.Vector3(5, 5, 5), cell: 0, reach: 0 },
    },
    pointerEnabled: true,
    still: false,
    liquidBodies: 0,
    settleSerial: 0,
  };
}

/** The layout the bodies are in for per-body questions (which cluster swells, which body to publish). */
export function dominantLayout(controls: OrbControls): OrbLayout {
  return controls.mix >= 0.5 ? controls.to : controls.from;
}
