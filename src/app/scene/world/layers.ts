/* ------------------------------------------------------------------ */
/*  Where the circuitry sits in depth (world units). The camera lives  */
/*  around z 4.4..6 looking down -z; the orb between z 1 and -3.       */
/* ------------------------------------------------------------------ */

/**
 * Floor board: below the lowest landscape orb (a hero orb at the bottom of its band, 0.92 of the
 * viewport, is at y -3.2 through the camera at z 5; the orb floats 0.5 above the floor).
 */
export const FLOOR_Y = -5.2;
/**
 * Portrait: the camera sits 2.6 further back, so the same band reaches y -4.9 (a phone's hero orb
 * on the actions row is at about -4.2). A higher floor would push that orb up into the lead.
 */
export const FLOOR_Y_PORTRAIT = -6.6;
/** Width (x) and depth (z) of the floor plane, and its centre: it spans z +6 .. -46 into the fog. */
export const FLOOR_SIZE: readonly [number, number] = [64, 52];
export const FLOOR_CENTRE_Z = -20;
/** World units per circuit tile on the floor (~0.7 screen px per texel just below the orb). */
export const FLOOR_TILE = 16;

/** Back wall far behind everything, faint in the board fog. */
export const WALL_Z = -24;
export const WALL_SIZE: readonly [number, number] = [96, 60];
export const WALL_CENTRE_Y = 3;
/** Coarser tiles on the wall keep its pulses near one texel per pixel at that distance. */
export const WALL_TILE = 48;

/**
 * The scroll flight: boards move toward the camera with the scroll, wrapped over FLIGHT_SPAN.
 * Each fades in over its first FLIGHT_FADE_IN units out of the fog and out over its last
 * FLIGHT_FADE_OUT units before FLIGHT_NEAR (or before the orb, if the orb sits deeper), so no
 * board ever crosses the orb.
 */
export const FLIGHT_FAR = -22;
export const FLIGHT_NEAR = -2;
export const FLIGHT_SPAN = FLIGHT_NEAR - FLIGHT_FAR;
export const FLIGHT_FADE_IN = 4;
export const FLIGHT_FADE_OUT = 2;
/** Board depths at zero travel; performance keeps every other one. */
export const FLIGHT_BASE_Z: readonly number[] = [-4, -9, -14, -19];
export const FLIGHT_SIZE: readonly [number, number] = [36, 24];
export const FLIGHT_CENTRE_Y = 0.5;
/** A flight board vanishes this far behind the orb's centre when the orb is deeper than FLIGHT_NEAR. */
export const FLIGHT_ORB_CLEARANCE = 1.5;

/** The boards' own fade to black (view depth); three's fog would tint whole additive quads blue. */
export const BOARD_FOG_NEAR = 6;
export const BOARD_FOG_FAR = 40;

/** Plane of the partner nodes, behind the orb's partners pose (z -3). */
export const NODE_PLANE_Z = -5;
