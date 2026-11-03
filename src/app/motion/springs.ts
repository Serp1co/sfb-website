/*
 * Small, allocation-free integrators shared by the DOM motion runtime. Every caller passes the
 * clamped tick delta (motion.time.delta), so motion feels the same at 60, 120 or 144 Hz, and a
 * zero delta (two ticks inside one millisecond) never divides by zero or moves anything.
 */

/** (1 + x)·e^-x = 0.05 at x ≈ 4.74: a critically damped spring is within 5% after ω·t = 4.74. */
const CRITICAL_SETTLE_PRODUCT = 4.74;

/** Longest explicit sub-step for the damped spring; keeps semi-implicit Euler accurate at k ≈ 220. */
const MAX_SPRING_SUBSTEP_S = 1 / 120;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Writes 0 for NaN and ±Infinity, so the packed WebGL uniforms only ever hold real numbers. */
export function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** Blend factor of a first-order lag with time constant `tau` over `dt` (frame-rate independent). */
export function lagFactor(dt: number, tau: number): number {
  if (dt <= 0) return 0;
  return tau > 0 ? 1 - Math.exp(-dt / tau) : 1;
}

/** Mutable state of a spring-driven value. */
export interface Spring {
  value: number;
  velocity: number;
}

export function createSpring(value = 0): Spring {
  return { value, velocity: 0 };
}

/** Angular frequency of a critically damped spring that settles (to 5%) in `settleSeconds`. */
export function criticalOmega(settleSeconds: number): number {
  return CRITICAL_SETTLE_PRODUCT / settleSeconds;
}

/**
 * Advances a critically damped spring by `dt` with its exact solution, so a long frame can never
 * overshoot or blow up the way explicit Euler does once ω·dt passes 2.
 */
export function stepCriticalSpring(spring: Spring, target: number, omega: number, dt: number): void {
  if (dt <= 0) return;
  const offset = spring.value - target;
  const decay = Math.exp(-omega * dt);
  const drift = spring.velocity + omega * offset;
  spring.value = target + (offset + drift * dt) * decay;
  spring.velocity = (spring.velocity - omega * drift * dt) * decay;
}

/**
 * Advances a damped spring (unit mass, `stiffness` k, `damping` c) with semi-implicit Euler in
 * sub-steps of at most MAX_SPRING_SUBSTEP_S, which keeps it stable and smooth at any tick length.
 */
export function stepDampedSpring(
  spring: Spring,
  target: number,
  stiffness: number,
  damping: number,
  dt: number,
): void {
  if (dt <= 0) return;
  const steps = Math.ceil(dt / MAX_SPRING_SUBSTEP_S);
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    spring.velocity += (-stiffness * (spring.value - target) - damping * spring.velocity) * h;
    spring.value += spring.velocity * h;
  }
}
