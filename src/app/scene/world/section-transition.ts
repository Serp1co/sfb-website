/* ------------------------------------------------------------------ */
/*  Which section's layout the orb holds, and the timed move from one  */
/*  to the next (owner decision 2026-11-02, choreography v3.1: "the    */
/*  metaball transitions to the next anchoring without syncing with    */
/*  the scroll"). The current section is the one crossing the viewport */
/*  centre (the story's own position, the header scroll-spy's rule),   */
/*  with hysteresis around each boundary. When it changes, the layout  */
/*  moves on its own clock over TRANSITION_S, eased in and out, and    */
/*  finishes whatever the scroll does meanwhile: no pose follows the   */
/*  scroll position proportionally any more. Turning back mid-way      */
/*  reverses the move from where it is (no jump); a third section mid- */
/*  way carries on from the nearer of the two. Pure state, no DOM.     */
/* ------------------------------------------------------------------ */

/**
 * A section becomes current once the reading is this share of it past its start, and stops being
 * current as far back before it: a scroll resting on a boundary never flips the layout to and fro.
 */
export const SECTION_HYSTERESIS = 0.05;

/**
 * The move between two sections' layouts, seconds on the scene clock. The pose spring (0.6 s
 * settle) and the bodies' own springs round it off: camera and bodies come to rest about 1 s after
 * the trigger, inside the brief's 0.8-1.1 s.
 */
export const TRANSITION_S = 0.8;

export interface SectionTransition {
  /** Index into motion.story.names of the section the reading is in (hysteresis applied); -1 before the first frame. */
  current: number;
  /** The section the layout is leaving and the one it is going to: equal while it holds. */
  from: number;
  to: number;
  /** Scene seconds into the move; TRANSITION_S once it has arrived. */
  age: number;
  /**
   * The move runs back over a move the other way (a reversal): the bodies' sideways sweep, which
   * goes by the direction from `from` to `to`, keeps the side it was on (orb.tsx).
   */
  reversed: boolean;
}

export function createSectionTransition(): SectionTransition {
  return { current: -1, from: 0, to: 0, age: TRANSITION_S, reversed: false };
}

/** Cubic ease in and out. Symmetric (ease(1 - u) = 1 - ease(u)), so reversing a move keeps the layout where it is. */
export function easeInOut(u: number): number {
  const t = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return t < 0.5 ? 4 * t * t * t : 1 - 4 * (1 - t) * (1 - t) * (1 - t);
}

/**
 * The current section for the story position `position` (i + f, see motion.story) of `count`
 * sections, from the previous one with SECTION_HYSTERESIS around each boundary. A jump (an anchor
 * link, a fling) may cross several sections at once: the layout then moves straight to the last.
 */
export function pickSection(previous: number, position: number, count: number): number {
  if (!(count > 0)) return 0;
  const p = Number.isFinite(position) ? Math.min(Math.max(position, 0), count) : 0;
  if (!(previous >= 0 && previous < count)) return Math.min(Math.floor(p), count - 1);
  let current = previous;
  while (current + 1 < count && p >= current + 1 + SECTION_HYSTERESIS) current++;
  while (current > 0 && p < current - SECTION_HYSTERESIS) current--;
  return current;
}

/** Holds section `index` at once: the first frame, a new page, a jump with the clock stopped. */
export function settleSection(transition: SectionTransition, index: number): void {
  transition.current = index;
  transition.from = index;
  transition.to = index;
  transition.age = TRANSITION_S;
  transition.reversed = false;
}

/** Sends the layout toward section `next`: starts a move, reverses one, or redirects it. */
export function retargetSection(transition: SectionTransition, next: number): void {
  const t = transition;
  if (next === t.to) return;
  if (t.from === t.to || t.age >= TRANSITION_S) {
    t.from = t.to;
    t.to = next;
    t.age = 0;
    t.reversed = false;
    return;
  }
  if (next === t.from) {
    // Back the way it came, from where it is now.
    t.from = t.to;
    t.to = next;
    t.age = TRANSITION_S - t.age;
    t.reversed = !t.reversed;
    return;
  }
  // A third section while moving (a fast scroll past a short one): carry on from the section the
  // layout is nearer, so the bodies' targets step by at most half of the move under way.
  if (easeInOut(t.age / TRANSITION_S) >= 0.5) {
    t.from = t.to;
    t.age = 0;
  }
  t.to = next;
  t.reversed = false;
}

/** How far the move is, not eased, 0..1 (1 while holding): for what should run at an even pace over it. */
export function sectionProgress(transition: SectionTransition): number {
  if (transition.from === transition.to) return 1;
  return Math.min(Math.max(transition.age / TRANSITION_S, 0), 1);
}

/**
 * Advances the move by `dt` scene seconds (0 while paused: it waits) and returns how far it is,
 * eased, 0..1. Arrived, it holds the new section (from = to) and returns 1.
 */
export function advanceSection(transition: SectionTransition, dt: number): number {
  const t = transition;
  if (t.from === t.to) {
    t.age = TRANSITION_S;
    return 1;
  }
  if (dt > 0) t.age = Math.min(t.age + dt, TRANSITION_S);
  if (t.age >= TRANSITION_S) {
    t.from = t.to;
    t.reversed = false;
    return 1;
  }
  return easeInOut(t.age / TRANSITION_S);
}
