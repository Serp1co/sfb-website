/*
 * The world's useFrame schedule, in one place so the order is explicit. R3F runs subscribers
 * from the lowest priority up, and the render pipeline draws at priority 1, so everything here
 * is <= 0 and runs before it. Each priority is distinct: equal priorities run in mount order,
 * which is easy to break by moving a component.
 */
export const FRAME_ORDER = {
  /** Camera rig and choreography: the pose, then what the orb should do this frame. */
  rig: -4,
  /** Orb and pointer body: splashes and kinematic targets, through this frame's camera. */
  orb: -3,
  /** Rapier steps here (<Physics updatePriority>); forces run in its before-step callbacks. */
  physics: -1,
  /** Field rebuild, motion.orb, readiness, and the board, droplet and node uniforms. */
  late: 0,
  /**
   * The partner circuit (partner-nodes.tsx), after the orb has published this frame's motion.orb:
   * its junction rides the drawn orb while the circuit hands over to the contact cards.
   */
  circuit: 0.5,
} as const;

/**
 * Rapier's fixed step (<Physics timeStep>). Forces are applied before every step and the field is
 * rebuilt only after one ran, so the orb costs at most 60 rebuilds a second at any refresh rate.
 */
export const PHYSICS_STEP = 1 / 60;
