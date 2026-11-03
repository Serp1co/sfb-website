/* ------------------------------------------------------------------ */
/*  The orb's stations through Partners and Contact (owner decisions   */
/*  2026-11-02). The page leaves two empty gaps for the merged orb: A  */
/*  above the "Partners and customers" heading                         */
/*  (ANCHORS.orbSlotPartners), B between the customers band and "Get   */
/*  in touch" (orbSlotContact); C is the contact cards, where it       */
/*  splits into three (ANCHORS.contactCell). While A is in view the    */
/*  orb holds A; once A has left the view and B is in view it glides   */
/*  to B, the hand-over slot; once the contact cards are in view it    */
/*  splits into them. Without contact cells, only when B has left the  */
/*  view upward (a short viewport near the end of the page) does it    */
/*  fall back to the contact close-up behind the centre card. "In      */
/*  view" means the orb (or the cards' bodies), at the size it takes   */
/*  there, fits between the fixed header and the fixed footer bar;     */
/*  leaving and coming back are 48 px apart, so the choice never       */
/*  flickers at a boundary.                                             */
/*                                                                     */
/*  This module only decides which station; choreography.ts places the */
/*  orb there and the rig carries it with the page and glides it.      */
/* ------------------------------------------------------------------ */

import type { ScreenBox } from "../../aquaism/core/projection";

/**
 * "a" / "b": held in that slot. "c": split into the contact cards. "fallback": the contact
 * close-up. "none": the page has no slots.
 */
export type SlotChoice = "a" | "b" | "c" | "fallback" | "none";

/** One station this frame (client CSS px), as the rig measured it from its anchors. */
export interface SlotView {
  /** Laid out (the page has the slot, or all three contact cards side by side, and it has a size). */
  valid: boolean;
  /** Where the orb's centre goes (C: the cards' row centre). */
  x: number;
  y: number;
  /** The gap's height (C: a card's). */
  height: number;
  /** The orb's silhouette radius there (choreography's slotRadius; C: a card body's). */
  radius: number;
}

export function createSlotView(): SlotView {
  return { valid: false, x: 0, y: 0, height: 0, radius: 0 };
}

/**
 * The fixed bars the orb has to clear to count as in view (components.css, measured): the header
 * bar's bottom edge (12 px from the top, a 68 px bar), and from 960 px wide the footer bar's top
 * edge (12 px from the bottom plus its 56 px bar). Below 480 px of height (max-height: 30rem) both
 * scroll with the page, and below 960 px the footer is a block at the end of the page.
 */
const HEADER_BOTTOM_PX = 80;
const FOOTER_BAR_PX = 68;
const FOOTER_FIXED_MIN_WIDTH = 960;
const BARS_FIXED_MIN_HEIGHT = 480;

/** Back into a station only once its centre is this much further inside the view than where it left. */
const SLOT_HYSTERESIS_PX = 48;

export interface SlotTracker {
  choice: SlotChoice;
  /** The choice changed this frame without a fresh start: the rig glides (and dives) to it. */
  changed: boolean;
}

export function createSlotTracker(): SlotTracker {
  return { choice: "none", changed: false };
}

/** The top of the band of the viewport the orb must fit in to count as in view (client px, top-left origin). */
export function viewTop(box: ScreenBox): number {
  return box.top + (box.height > BARS_FIXED_MIN_HEIGHT ? HEADER_BOTTOM_PX : 0);
}

/** ...and its bottom. */
export function viewBottom(box: ScreenBox): number {
  const fixed = box.height > BARS_FIXED_MIN_HEIGHT && box.width >= FOOTER_FIXED_MIN_WIDTH;
  return box.top + box.height - (fixed ? FOOTER_BAR_PX : 0);
}

/** The orb at its size in this station fits between the bars, `margin` px further in on both sides. */
function inView(slot: SlotView, top: number, bottom: number, margin: number): boolean {
  return slot.valid && slot.y >= top + slot.radius + margin && slot.y <= bottom - slot.radius - margin;
}

/** B's orb would reach above the header: the visitor has read past B (only near the end of short viewports). */
function leftUpward(slot: SlotView, top: number): boolean {
  return slot.valid && slot.y < top + slot.radius;
}

/** Where to go once B is behind the visitor: the contact cards when the page has them, else the close-up. */
function pastB(c: SlotView): SlotChoice {
  return c.valid ? "c" : "fallback";
}

/** The choice for a fresh start (first frame, a new page): no history, so no hysteresis either. */
function freshChoice(a: SlotView, b: SlotView, c: SlotView, top: number, bottom: number, box: ScreenBox): SlotChoice {
  if (!a.valid && !b.valid) return c.valid ? "c" : "none";
  if (inView(a, top, bottom, 0)) return "a";
  if (inView(c, top, bottom, 0)) return "c";
  if (inView(b, top, bottom, 0)) return "b";
  if (leftUpward(b, top)) return pastB(c);
  // Between two stations (a short viewport, scrolled into the bands): the slot nearer the middle.
  if (!b.valid) return "a";
  if (!a.valid) return "b";
  const middle = box.top + box.height / 2;
  return Math.abs(a.y - middle) <= Math.abs(b.y - middle) ? "a" : "b";
}

/**
 * Updates the station the orb holds from this frame's stations. `fresh` (the rig's first frame, a
 * new page) chooses from scratch and never counts as a change, so nothing glides.
 */
export function updateSlotTracker(
  tracker: SlotTracker,
  a: SlotView,
  b: SlotView,
  c: SlotView,
  box: ScreenBox,
  fresh: boolean,
): void {
  const top = viewTop(box);
  const bottom = viewBottom(box);
  const previous = tracker.choice;
  let next = previous;
  if (fresh || previous === "none" || (!a.valid && !b.valid && !c.valid)) {
    next = freshChoice(a, b, c, top, bottom, box);
  } else if (previous === "a") {
    // Leave A only for a station that is in view: until then the orb stays in A as A scrolls away.
    if (!a.valid) next = freshChoice(a, b, c, top, bottom, box);
    else if (!inView(a, top, bottom, 0)) {
      if (inView(b, top, bottom, 0)) next = "b";
      else if (inView(c, top, bottom, 0)) next = "c";
    }
  } else if (previous === "b") {
    if (inView(a, top, bottom, SLOT_HYSTERESIS_PX)) next = "a";
    else if (inView(c, top, bottom, 0)) next = "c";
    else if (!b.valid) next = freshChoice(a, b, c, top, bottom, box);
    else if (leftUpward(b, top)) next = pastB(c);
  } else if (previous === "c") {
    // Back to B once the cards' bodies have dropped HYSTERESIS below the footer bar and B is in view.
    if (inView(a, top, bottom, SLOT_HYSTERESIS_PX)) next = "a";
    else if (!c.valid) next = freshChoice(a, b, c, top, bottom, box);
    else if (c.y > bottom - c.radius + SLOT_HYSTERESIS_PX && inView(b, top, bottom, 0)) next = "b";
  } else {
    // The fallback: back to whichever station comes back into view (a jump may skip B).
    if (inView(a, top, bottom, SLOT_HYSTERESIS_PX)) next = "a";
    else if (inView(c, top, bottom, 0)) next = "c";
    else if (b.valid && b.y >= top + b.radius + SLOT_HYSTERESIS_PX) next = "b";
    else if (!b.valid) next = freshChoice(a, b, c, top, bottom, box);
  }
  tracker.changed = !fresh && previous !== "none" && next !== previous;
  tracker.choice = next;
}
