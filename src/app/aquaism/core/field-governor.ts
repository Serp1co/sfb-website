/* ------------------------------------------------------------------ */
/*  The orb's field resolution from its measured cost (review C8).     */
/*  The marching-cubes rebuild is the site's main CPU cost and runs on */
/*  the main thread with everything else: when it takes too much of a  */
/*  frame, the field box's floor steps up first (a smaller box costs   */
/*  more: the big hero orb's), then the live grid steps down (72 ->    */
/*  56 -> 48 cells per axis).                                          */
/*  The budget is a share of the measured frame interval, not a fixed  */
/*  number of ms: a fast desktop keeps 72 at 60 Hz, a 120 Hz display   */
/*  gets half the time, a throttled laptop steps down.                 */
/* ------------------------------------------------------------------ */

/** Resolutions the field may step down through, finest first. */
export const FIELD_RESOLUTION_STEPS: readonly number[] = [72, 56, 48];

/** A rebuild may take at most this share of the frame interval (perf.frameMs). */
const REBUILD_BUDGET_SHARE = 0.6;
/** Rebuilds per decision: the median of a window shrugs off a GC pause or a one-off long frame. */
const WINDOW = 30;
/** Rebuilds ignored after the start or a re-init: JIT warm-up and the freshly allocated grid. */
const WARMUP_REBUILDS = 8;
/** Measuring starts this long after the world is ready, when the boot's compiles and uploads are over. */
export const FIELD_MEASURE_DELAY_MS = 1000;
/** Smoothing of the published rebuild cost (motion.perf.rebuildMs), per rebuild. */
const PUBLISHED_EMA = 0.1;

export interface FieldGovernor {
  /** Smoothed cost of one rebuild, ms (what motion.perf.rebuildMs shows). */
  rebuildMs: number;
  samples: Float64Array;
  count: number;
  skip: number;
}

export function createFieldGovernor(): FieldGovernor {
  return { rebuildMs: 0, samples: new Float64Array(WINDOW), count: 0, skip: WARMUP_REBUILDS };
}

/** The next coarser step below `resolution`, or 0 when it is already the coarsest. */
export function coarserResolution(resolution: number): number {
  for (const step of FIELD_RESOLUTION_STEPS) if (step < resolution) return step;
  return 0;
}

function median(values: Float64Array, count: number): number {
  const sorted = Array.from(values.subarray(0, count)).sort((a, b) => a - b);
  const mid = count >> 1;
  return count % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** recordRebuild's answer when the box's floor should step up instead of the grid down. */
export const RAISE_FIELD_FLOOR = -1;

/**
 * Records one rebuild's cost. `measuring` gates the decision (after the world is ready and its
 * delay); the published average is kept regardless. `floorBinds`: the box sits at its floor and
 * the floor can still rise, which is the cheaper remedy. Returns RAISE_FIELD_FLOOR, the resolution
 * to re-initialise the field at, or 0 to keep things as they are. After a step it measures again
 * from scratch.
 */
export function recordRebuild(
  governor: FieldGovernor,
  rebuildMs: number,
  frameMs: number,
  resolution: number,
  measuring: boolean,
  floorBinds = false,
): number {
  if (!Number.isFinite(rebuildMs) || rebuildMs < 0) return 0;
  governor.rebuildMs =
    governor.rebuildMs > 0 ? governor.rebuildMs + (rebuildMs - governor.rebuildMs) * PUBLISHED_EMA : rebuildMs;
  if (!measuring) return 0;
  if (governor.skip > 0) {
    governor.skip--;
    return 0;
  }
  governor.samples[governor.count++] = rebuildMs;
  if (governor.count < WINDOW) return 0;

  const cost = median(governor.samples, governor.count);
  governor.count = 0;
  const budget = REBUILD_BUDGET_SHARE * (Number.isFinite(frameMs) && frameMs > 0 ? frameMs : 1000 / 60);
  if (cost <= budget) return 0;
  if (floorBinds) {
    governor.skip = WARMUP_REBUILDS;
    governor.rebuildMs = 0;
    return RAISE_FIELD_FLOOR;
  }
  const next = coarserResolution(resolution);
  if (next > 0) {
    governor.skip = WARMUP_REBUILDS;
    // The coarser grid costs less: restart the published average from its first rebuilds.
    governor.rebuildMs = 0;
  }
  return next;
}
