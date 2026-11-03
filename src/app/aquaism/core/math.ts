/* ------------------------------------------------------------------ */
/*  Small numeric helpers shared by the orb and the world. Everything  */
/*  here runs inside frame callbacks, so nothing allocates.            */
/* ------------------------------------------------------------------ */

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Hermite ramp from edge0 to edge1. Works with edge0 > edge1 too (a falling ramp). */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Exponential approach factor for a time constant (seconds), safe for dt = 0. */
export function approach(dt: number, tau: number): number {
  return dt > 0 && tau > 0 ? 1 - Math.exp(-dt / tau) : 0;
}

/**
 * Deterministic PRNG (mulberry32). Seeds are fixed constants, so the orb, the circuit texture
 * and the droplets look the same on every visit and in every render.
 */
export function createRandom(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -- Critically damped springs --------------------------------------- */

/** One springed value. velocity is in units per second. */
export interface Spring {
  value: number;
  velocity: number;
}

export function createSpring(value = 0): Spring {
  return { value, velocity: 0 };
}

/**
 * Angular frequency that brings a critically damped spring within 5% of its target in
 * `seconds`: x(t) = (1 + wt) e^(-wt) reaches 0.05 at wt = 4.74.
 */
export function omegaForSettle(seconds: number): number {
  return 4.74 / seconds;
}

/**
 * Exact step of x'' = -w^2 (x - target) - 2w x' over dt. Exact rather than integrated, so it
 * stays stable for the clamped 1/20 s frames and never overshoots. dt <= 0 leaves it unchanged
 * (two ticks can share a timestamp).
 */
export function stepSpring(spring: Spring, target: number, omega: number, dt: number): number {
  if (!(dt > 0)) return spring.value;
  const offset = spring.value - target;
  const temp = (spring.velocity + omega * offset) * dt;
  const decay = Math.exp(-omega * dt);
  spring.value = target + (offset + temp) * decay;
  spring.velocity = (spring.velocity - omega * temp) * decay;
  return spring.value;
}

/** stepSpring with the rise (positive velocity) capped at maxRise units per second. */
export function stepSpringLimitedRise(spring: Spring, target: number, omega: number, dt: number, maxRise: number): number {
  if (!(dt > 0)) return spring.value;
  const before = spring.value;
  stepSpring(spring, target, omega, dt);
  if (spring.value - before > maxRise * dt) {
    spring.value = before + maxRise * dt;
    spring.velocity = maxRise;
  }
  return spring.value;
}

/** Three springs for a vector, stepped together. */
export interface SpringVec3 {
  x: Spring;
  y: Spring;
  z: Spring;
}

export function createSpringVec3(x = 0, y = 0, z = 0): SpringVec3 {
  return { x: createSpring(x), y: createSpring(y), z: createSpring(z) };
}

export function stepSpringVec3(
  spring: SpringVec3,
  target: { x: number; y: number; z: number },
  omega: number,
  dt: number,
  out: { x: number; y: number; z: number },
): void {
  out.x = stepSpring(spring.x, target.x, omega, dt);
  out.y = stepSpring(spring.y, target.y, omega, dt);
  out.z = stepSpring(spring.z, target.z, omega, dt);
}

/** Jumps a spring to a value at rest (reduced motion: no movement, only the pose). */
export function snapSpringVec3(spring: SpringVec3, value: { x: number; y: number; z: number }): void {
  spring.x.value = value.x;
  spring.y.value = value.y;
  spring.z.value = value.z;
  spring.x.velocity = spring.y.velocity = spring.z.velocity = 0;
}
