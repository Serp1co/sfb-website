/*
 * Layout boxes: where the browser laid an element out, ignoring every transform.
 *
 * getBoundingClientRect() includes the transforms on an element and on all its ancestors: the
 * hero's `rise` keyframes, GSAP reveal from-states, hover lifts, the magnetic `translate`. A rect
 * cached while one of those is applied would leave the WebGL glass offset from its HTML until the
 * next resize, because nothing re-measures when a transform ends. offsetLeft/offsetTop/
 * offsetWidth/offsetHeight are layout values that no transform touches, so the document position
 * is their sum up the offsetParent chain.
 *
 * Precision: offset* values are whole CSS px, so a box can be off by about a pixel after rounding
 * at each level of the chain. That is invisible under the glass's bevel and far better than a
 * transform-polluted rect. The few boxes the composite traces with a 1 px line (the hero logo's
 * outline, the partner and customer marks, the hero tagline's glyphs) take measurePreciseLayoutBox
 * instead: the same layout box to the sub-pixel, still transform-immune.
 *
 * Assumes no element in the chain is an inner scroll container (none of the measured elements
 * live in one) and that the page never scrolls horizontally.
 */

export interface LayoutBox {
  /** Document CSS px (viewport CSS px when `fixed`): left edge of the border box. */
  x: number;
  /** Document CSS px (viewport CSS px when `fixed`): top edge of the border box. */
  y: number;
  width: number;
  height: number;
  /**
   * Inside a position:fixed container (the chain ended at a fixed element, not at <body>): the
   * coordinates are viewport space already and must not be offset by the scroll.
   */
  fixed: boolean;
}

export function createLayoutBox(): LayoutBox {
  return { x: 0, y: 0, width: 0, height: 0, fixed: false };
}

export function resetLayoutBox(box: LayoutBox): LayoutBox {
  box.x = 0;
  box.y = 0;
  box.width = 0;
  box.height = 0;
  box.fixed = false;
  return box;
}

/** True when the element was laid out with a non-zero size (not display:none, not collapsed). */
export function hasSize(box: LayoutBox): boolean {
  return box.width > 0 && box.height > 0;
}

/**
 * Measures `element` into `out` (and returns it). Reads layout only; never call it per tick:
 * callers cache the result and re-measure on resize, font, image and mutation events.
 */
export function measureLayoutBox(element: HTMLElement, out: LayoutBox): LayoutBox {
  const body = document.body;
  const root = document.documentElement;
  let x = 0;
  let y = 0;
  let node: HTMLElement = element;
  for (;;) {
    x += node.offsetLeft;
    y += node.offsetTop;
    const parent = node.offsetParent;
    if (!(parent instanceof HTMLElement)) break;
    // offsetTop is measured from the offsetParent's padding edge, so its border has to be added
    // back. The <body> is the exception: offsets relative to it are already document offsets.
    if (parent !== body) {
      x += parent.clientLeft;
      y += parent.clientTop;
    }
    node = parent;
  }
  out.x = x;
  out.y = y;
  out.width = element.offsetWidth;
  out.height = element.offsetHeight;
  // A chain that stops before <body> stopped at a position:fixed element (offsetParent is null for
  // those) or at an element without a box (zero size; callers skip it). Only the first case needs
  // the style read, and it is rare (the header, the mobile menu).
  out.fixed =
    node !== body && node !== root && out.width > 0 && getComputedStyle(node).position === "fixed";
  return out;
}

/** A translation (CSS px) a transform adds to an element and everything inside it. */
export interface Shift {
  x: number;
  y: number;
}

/**
 * Each element's own translation, or null when its transform does more than translate: read once
 * per element per measure, however many precise boxes share it as an ancestor. Callers make a new
 * one for every measure (a transform may have changed since the last).
 */
export type ShiftCache = Map<Element, Shift | null>;

/** Computed matrices carry float noise: an entry this close to 0 or 1 is exactly that. */
const MATRIX_EPSILON = 1e-6;
/**
 * The offsets round at every level of the chain, by under a pixel each; past that (plus this
 * slack) the precise box disagrees with the whole-px one for a reason the walk cannot see (an
 * inner scroll, a motion path), and the whole-px box stands.
 */
const ROUNDING_SLACK_PX = 0.5;

function near(value: number, target: number): boolean {
  return Math.abs(value - target) <= MATRIX_EPSILON;
}

/** A pure translation: no scale, rotation or skew, no perspective, and no depth (a perspective would resize it). */
function isTranslation(m: DOMMatrixReadOnly): boolean {
  if (!near(m.m11, 1) || !near(m.m12, 0) || !near(m.m21, 0) || !near(m.m22, 1)) return false;
  if (m.is2D) return true;
  // A flat translation an engine serialized as matrix3d (from a translate3d): only x and y may move.
  const flat = [m.m13, m.m14, m.m23, m.m24, m.m31, m.m32, m.m34, m.m43].every((entry) => near(entry, 0));
  return flat && near(m.m33, 1) && near(m.m44, 1);
}

/**
 * The translation `element`'s own transforms add, from its computed style: `transform` (the rise
 * keyframes, a GSAP tween; resolved to a matrix, percentages included) plus the individual
 * `translate` (the magnetic pull), or null when either does more than translate, or `scale` or
 * `rotate` is set. Translations commute, so a chain of them adds up whatever their order.
 */
function readShift(element: Element): Shift | null {
  const style = getComputedStyle(element);
  let x = 0;
  let y = 0;
  const transform = style.transform;
  if (transform && transform !== "none") {
    let matrix: DOMMatrixReadOnly;
    try {
      matrix = new DOMMatrixReadOnly(transform);
    } catch {
      return null;
    }
    if (!isTranslation(matrix)) return null;
    x += matrix.m41;
    y += matrix.m42;
  }
  // Older engines without the individual properties read undefined: nothing set.
  const translate = style.translate;
  if (translate && translate !== "none") {
    const parts = translate.trim().split(/\s+/);
    for (let k = 0; k < parts.length; k++) {
      // Computed lengths are px; a percentage (of the element's own box) is not worth resolving.
      const value = parts[k].endsWith("px") ? Number.parseFloat(parts[k]) : Number.NaN;
      if (!Number.isFinite(value)) return null;
      if (k === 0) x += value;
      else if (k === 1) y += value;
      else if (value !== 0) return null;
    }
  }
  const scale = style.scale;
  if (scale && scale !== "none" && !scale.trim().split(/\s+/).every((part) => Number.parseFloat(part) === 1)) return null;
  // "0deg" is no rotation; an axis form ("x 45deg") reads NaN and counts as one.
  const rotate = style.rotate;
  if (rotate && rotate !== "none" && Number.parseFloat(rotate) !== 0) return null;
  return { x, y };
}

/**
 * measureLayoutBox to the sub-pixel, still ignoring every transform. getBoundingClientRect() is
 * exact but carries the transforms of the element and its ancestors, so the translation each of
 * them adds is read (readShift) and taken back out, and the page scroll added back in (unless the
 * chain is fixed, viewport space already). The hero's rise and the magnetic pull are translations,
 * and a reveal never transforms an anchor or its ancestors (reveals.ts). Anything that does more
 * than translate cannot be taken out this simply: then the whole-px box from the offsets stands, as
 * it does when the two disagree by more than the offsets' rounding. Same cost rules as
 * measureLayoutBox (layout reads, never per tick), plus one style read per element in the chain.
 */
export function measurePreciseLayoutBox(element: HTMLElement, out: LayoutBox, shifts: ShiftCache): LayoutBox {
  measureLayoutBox(element, out);
  if (!hasSize(out)) return out;
  let dx = 0;
  let dy = 0;
  for (let node: Element | null = element; node; node = node.parentElement) {
    let shift = shifts.get(node);
    if (shift === undefined) {
      shift = readShift(node);
      shifts.set(node, shift);
    }
    if (!shift) return out;
    dx += shift.x;
    dy += shift.y;
  }
  let levels = 0;
  for (let node: Element | null = element; node instanceof HTMLElement; node = node.offsetParent) levels++;
  const rect = element.getBoundingClientRect();
  const x = rect.left - dx + (out.fixed ? 0 : window.scrollX);
  const y = rect.top - dy + (out.fixed ? 0 : window.scrollY);
  const slack = levels + ROUNDING_SLACK_PX;
  if (
    !(Math.abs(x - out.x) <= slack) ||
    !(Math.abs(y - out.y) <= slack) ||
    !(Math.abs(rect.width - out.width) <= 1) ||
    !(Math.abs(rect.height - out.height) <= 1)
  ) {
    return out;
  }
  out.x = x;
  out.y = y;
  out.width = rect.width;
  out.height = rect.height;
  return out;
}
