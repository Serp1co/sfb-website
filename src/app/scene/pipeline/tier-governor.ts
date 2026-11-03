import type { SceneTier } from "../../motion/store";
import { TIER_ORDER } from "./glass-config";

type Move = "down" | "up";

/**
 * Hysteresis over drei's PerformanceMonitor (spec 5.1). The monitor keeps firing onIncline every
 * few seconds on any fast machine and counts every incline and decline as a "flip", so its own
 * flipflops/onFallback would demote a healthy desktop. Instead:
 * - step down on a decline, unless the frame is CPU-bound: the pipeline's settings (DPR, MSAA,
 *   taps, sim texel) only cost GPU time, so stepping them down for a main thread busy rebuilding the
 *   orb wins no frames and leaves the visitor with the blurrier, aliased look for the session (the
 *   world steps its own field resolution for that case);
 * - step up only back to a tier the monitor removed, never above the visitor's starting tier;
 * - after down, up, down, stay where it is for the rest of the session.
 * Decisions are ignored until `ready()` (shader compiles and uploads make the first seconds slow).
 */
export class TierGovernor {
  private index: number;
  private readonly ceiling: number;
  private readonly removed = new Set<number>();
  private readonly moves: Move[] = [];
  private frozen = false;
  private readonly onChange: (tier: SceneTier) => void;
  private readonly ready: () => boolean;
  private readonly cpuBound: () => boolean;

  constructor(start: SceneTier, onChange: (tier: SceneTier) => void, ready: () => boolean, cpuBound: () => boolean) {
    this.index = Math.max(TIER_ORDER.indexOf(start), 0);
    this.ceiling = this.index;
    this.onChange = onChange;
    this.ready = ready;
    this.cpuBound = cpuBound;
  }

  get tier(): SceneTier {
    return TIER_ORDER[this.index];
  }

  decline(): void {
    if (this.frozen || !this.ready() || this.index >= TIER_ORDER.length - 1) return;
    if (this.cpuBound()) return;
    this.removed.add(this.index);
    this.index += 1;
    this.record("down");
  }

  incline(): void {
    if (this.frozen || !this.ready() || this.index <= this.ceiling) return;
    const target = this.index - 1;
    if (!this.removed.has(target)) return;
    this.removed.delete(target);
    this.index = target;
    this.record("up");
  }

  private record(move: Move): void {
    this.moves.push(move);
    const n = this.moves.length;
    if (n >= 3 && this.moves[n - 3] === "down" && this.moves[n - 2] === "up" && this.moves[n - 1] === "down") {
      this.frozen = true;
    }
    this.onChange(this.tier);
  }
}
