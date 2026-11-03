import { SLOSH } from "./glass-config";

const OMEGA = (2 * Math.PI) / SLOSH.periodS;

/**
 * The liquid's rock after a scroll flick (spec 5.2): an underdamped oscillator driven by scroll
 * acceleration, theta'' = -w^2 theta - 2 z w theta' - kA * acceleration. Liquid sloshes after the
 * container changes speed, so it is fed acceleration, not velocity (velocity would read as drag).
 * The state rings freely; only the output is clamped, so a big flick saturates instead of sticking.
 */
export class Slosh {
  private theta = 0;
  private velocity = 0;

  /** Advances by dt seconds and returns the swing in -1..1 (the composite scales it by sloshPx). */
  update(dt: number, acceleration: number): number {
    const drive = Number.isFinite(acceleration) ? -SLOSH.accelGain * acceleration : 0;
    const h = Math.max(dt, 0) / SLOSH.substeps;
    for (let i = 0; i < SLOSH.substeps; i++) {
      // Semi-implicit Euler: stable for w*h well above what a 1/20 s frame gives.
      this.velocity += (-OMEGA * OMEGA * this.theta - 2 * SLOSH.dampingRatio * OMEGA * this.velocity + drive) * h;
      this.theta += this.velocity * h;
    }
    if (!Number.isFinite(this.theta) || !Number.isFinite(this.velocity)) this.reset();
    return Math.min(Math.max(this.theta, -1), 1);
  }

  reset(): void {
    this.theta = 0;
    this.velocity = 0;
  }
}
