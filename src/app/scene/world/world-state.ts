import * as THREE from "three";
import { FIELD_FLOOR_STEPS } from "../../aquaism/core/orb-field";
import { createOrbControls, type OrbControls } from "../../aquaism/core/orb-controls";
import { FLOOR_Y } from "./layers";
import { createSlotView, type SlotView } from "./orb-slots";
import { createTechPills, type TechPills } from "./tech-pills";

/** Where the orb waits before the rig's first frame (about the hero's centre at 1440 x 900). */
export const INITIAL_ORB_CENTRE = new THREE.Vector3(0, 0, 0);

/**
 * Per-frame state of the world, shared by its parts. One instance per World mount, written by
 * the camera rig at FRAME_ORDER.rig and read by everything after it. Never React state.
 */
export interface WorldState {
  /** What the orb should do (centre, scale, layouts, emphasis, slosh). */
  orb: OrbControls;
  /** Shader seconds for the circuitry and droplets (scene clock): frozen while still or paused. */
  time: number;
  /** Scroll flight through the boards, world units (0 with reduced motion). */
  travel: number;
  /** Board brightness from the pose. */
  boardEmphasis: number;
  /** 0..1: how much of the partners pose is in view (the partner nodes and traces fade with it). */
  nodes: number;
  /**
   * 0..1: how settled the orb is in the slot it holds (1 when it holds none): the partner traces
   * first appear only once it has arrived (owner decision 2026-11-02: the orb first, then the circuit).
   */
  dock: number;
  /**
   * 0..1: where the orb is between slot A and slot B on screen (0 in A, 1 in B and beyond): the
   * partner traces morph from A's routing to B's with it, never fading out. Measured through the
   * pose's own camera (no parallax, breathing or drag), so it is exactly 0 or 1 at rest.
   */
  traceMorph: number;
  /**
   * The orb has left the slots for the contact cards (or the close-up): the partner circuit fades
   * with the pose, its junction riding the orb as drawn (motion.orb) instead of traceMorph, so it
   * never runs ahead of the liquid toward slot B.
   */
  traceFollowsOrb: boolean;
  /**
   * CSS px the camera's breathing and parallax move the orb's centre on screen off the path
   * traceMorph measures (through the pose's camera): the junction takes it, so it stays under the
   * orb's centre while the circuit's routes keep to the page.
   */
  junctionShift: THREE.Vector2;
  /** The two slots this frame (client px), for the traces' two routings. */
  slotA: SlotView;
  slotB: SlotView;
  /** 0..1: how much of the pose is the Services split: the service circuitry's weight. */
  links: number;
  /** 0..1: how much of the pose is a practice page's cells: the cell circuitry's weight (cell-links.tsx). */
  cellLinks: number;
  /** A practice page's technology pills this frame (client px; measured by the rig, tech-pills.ts). */
  pills: TechPills;
  /**
   * 0..1: how far the orb has handed over to the pills' droplets (v3.1: the bodies dissolve into a
   * droplet in each pill): the droplets' size and the pills' own circuitry's weight.
   */
  droplets: number;
  /** Camera to orb distance, the droplets' focus plane. */
  focusDistance: number;
  /** Height of the floor board: lower in portrait, where the camera sits further back. */
  floorY: number;
  /**
   * performance.now() ms when the circuitry powers on: scheduled a little after the WebGL glass
   * takes over (so it may lie ahead), or set in the past while paused (fully powered); 0 until then.
   */
  powerStartMs: number;
  /** World position the power-on spreads from (the orb at that moment). */
  powerOrigin: THREE.Vector3;
}

export function createWorldState(): WorldState {
  return {
    orb: createOrbControls(INITIAL_ORB_CENTRE, FIELD_FLOOR_STEPS[0]),
    time: 0,
    travel: 0,
    boardEmphasis: 1,
    nodes: 0,
    dock: 1,
    traceMorph: 0,
    traceFollowsOrb: false,
    junctionShift: new THREE.Vector2(),
    slotA: createSlotView(),
    slotB: createSlotView(),
    links: 0,
    cellLinks: 0,
    pills: createTechPills(),
    droplets: 0,
    focusDistance: 5,
    floorY: FLOOR_Y,
    powerStartMs: 0,
    powerOrigin: INITIAL_ORB_CENTRE.clone(),
  };
}
