/*
 * Scroll reveals (GSAP ScrollTrigger + SplitText), set up ONCE per route.
 *
 * Markup asks with [data-reveal="lines|block|items"]; glass surfaces condense (their registry
 * `appear` tweens 0 -> 1, drawn by the WebGL composite) while their contents rise into them.
 *
 * Rules, each with its reason:
 *  - One gsap.context per route, reverted before the next route's is created. A second from() on
 *    an element whose first from() already rendered its start state would read that hidden state
 *    as its end state, so elements that have a reveal are remembered (WeakSet) and later rescans
 *    only add reveals for unseen ones.
 *  - Content on screen on the FIRST page stays exactly as painted (the hero has its own CSS
 *    focus-pull); nothing is ever hidden before JavaScript runs. After a client navigation, what
 *    a CSS entrance is already moving (the hero's focus-pull replays) is left to it as well.
 *  - No GSAP transform, opacity or filter on a [data-glass], [data-anchor] or [data-magnetic]
 *    element's ANCESTOR, and no transform on those elements themselves: transforms would move
 *    them off their layout boxes (glass, anchors, the magnetic translate), and opacity or filter on
 *    an ancestor makes it a backdrop root, which blanks CSS glass. Surface CONTENTS animate instead.
 *    The one exception is the `copy` anchor (bare text the scene only keeps clear of; see
 *    PINNED_SELECTOR): its text reveals like any other.
 *  - Every surface that does not start condensed gets a reveal that condenses it; a surface left at
 *    appear 0 would be invisible glass in WebGL mode.
 *  - Reduced motion: no reveals at all (the registry starts every surface condensed).
 *
 * A client navigation plays three beats: the exit on the press (playExit, by the same rules: the
 * content lifts away, the glass thins but stays), the scene's bridge, and the new page's entrance
 * (its glass condenses from ROUTE_APPEAR_FROM, never from empty, while its headline rises).
 */

import { createLayoutBox, hasSize, measureLayoutBox, type LayoutBox } from "../glass/layout-box";
import { getSurfaces, surfaceAtPoint, surfaceFor, surfaceViewportCenter, type Surface } from "../glass/registry";
import type { GlassKind } from "../glass/contract";
import { SplitText, ensureGsapPlugins, gsap, syncScrollTriggerScroll } from "./gsap-setup";
import { lastActivation } from "./pointer";
import { motion, queueImpulse } from "./store";

export type RevealMode = "first" | "route" | "traversal";

interface Timing {
  /** Condense (appear 0 -> 1) duration, s. */
  appear: number;
  /** Duration of the contents rising into a condensing surface, s. */
  content: number;
  /** Duration of a non-glass item rising, s. */
  item: number;
  /** Cap on a group's total stagger, s. */
  staggerMax: number;
}

/** Revealed on scroll: the full condense, a group never staggers longer than 0.45 s in total. */
const SCROLL_TIMING: Timing = { appear: 1.1, content: 0.9, item: 0.9, staggerMax: 0.45 };
/** After a client navigation: quicker, so the new page has formed within about a second. */
const ROUTE_TIMING: Timing = { appear: 0.8, content: 0.7, item: 0.8, staggerMax: 0.3 };

const EASE = "expo.out";
/** Stagger between siblings, before the group cap applies. */
const STAGGER_EACH_S = 0.08;
/** Contents start rising this long after their surface begins to condense. */
const CONTENT_DELAY_S = 0.1;
const CONTENT_STAGGER_EACH_S = 0.04;
const CONTENT_STAGGER_MAX_S = 0.16;
const CONTENT_RISE_PX = 24;
const ITEM_RISE_PX = 36;

const LINES_RISE_PERCENT = 120;
/**
 * Lines that play at once (a new page's entrance, late content) rise less: the headline reads
 * sooner, and nothing travels far through the frame the visitor has just arrived on.
 */
const ENTRANCE_LINES_RISE_PERCENT = 70;
const LINES_BLUR = "blur(6px)";
const LINES_DURATION_S = 1;
const LINES_STAGGER_S = 0.07;

const BLOCK_RISE_PX = 28;
const BLOCK_BLUR = "blur(8px)";
const BLOCK_DURATION_S = 0.9;

/*
 * Trigger lines. clamp() keeps a start that would lie past the scroll limit (content in the last
 * few percent of the page) reachable, so nothing near the bottom can stay hidden.
 */
const CONTENT_START = "clamp(top 88%)";
const LONE_SURFACE_START = "clamp(top 92%)";

/** Items whose layout tops are this close form one row: one trigger, one stagger, one drop. */
const ROW_TOLERANCE_PX = 12;

/** Large panes announce their condense with one soft drop per group (never a burst). */
const DROP_KINDS: ReadonlySet<GlassKind> = new Set<GlassKind>(["panel", "card", "band"]);
const CONDENSE_DROP_STRENGTH = 0.35;
/** After a navigation the liquid re-forms from the link that was pressed... */
const ROUTE_DROP_STRENGTH = 0.8;
/** ...if that press (or key activation) caused it, i.e. happened just before. */
const ROUTE_DROP_MAX_AGE_MS = 2000;
/**
 * A new page's on-screen glass condenses from this appear, not from 0: the composite already draws
 * it at ~0.93 alpha and 0.925 scale, so the swap never shows an empty frame (a blink).
 */
const ROUTE_APPEAR_FROM = 0.25;

/*
 * The exit on a press that will navigate. The new page arrives about 145 ms after the press
 * (release, then Next's commit), so the exit fits inside that wait and adds no latency: faster than
 * the entrance, accelerating away (in), the way a leaving element should.
 */
const EXIT_DURATION_S = 0.12;
const EXIT_EASE = "power2.in";
/** Content lifts away as it fades; the next page rises into place. */
const EXIT_LIFT_PX = -8;
/** The glass thins but stays, so the frame is never empty while the next page loads. */
const EXIT_APPEAR = 0.6;

/**
 * The three reveal kinds only: the scene's fade wrapper also carries data-reveal (hidden|shown),
 * and it is not content.
 */
const REVEAL_SELECTOR = '[data-reveal="lines"], [data-reveal="block"], [data-reveal="items"]';
const GLASS_SELECTOR = "[data-glass]";
/**
 * Elements that may fade but never move: anchors the scene projects into 3D (a transform would
 * take them off the layout box it reads) and magnetic elements (their pull owns `translate`). Not
 * the `copy` anchors: those are bare text the scene keeps clear of, read as soft, feathered
 * keep-out rects, which a reveal's short rise inside them cannot fool; their text reveals as text.
 */
const PINNED_SELECTOR = '[data-anchor]:not([data-anchor="copy"]), [data-magnetic]';
const PROTECTED_SELECTOR = `[data-glass], ${PINNED_SELECTOR}`;

interface Plan {
  /** Reveal content already on screen: leave it as painted, or play it now. */
  onScreen: "keep" | "play";
  /** Condense the on-screen surfaces now: with their contents, glass only, or not at all. */
  condense: "with-content" | "glass-only" | "none";
  /** Appear the on-screen surfaces condense from; null: from wherever they are. */
  condenseFrom: number | null;
  /** The page's h1 and lead play `lines` now (they lead the new page in). */
  headline: boolean;
  /** One drop where the visitor pressed the link that brought them here. */
  drop: boolean;
}

const PLANS: Readonly<Record<RevealMode | "added", Plan>> = {
  first: { onScreen: "keep", condense: "none", condenseFrom: null, headline: false, drop: false },
  route: { onScreen: "play", condense: "with-content", condenseFrom: ROUTE_APPEAR_FROM, headline: true, drop: true },
  // Back/forward restores a page the visitor has seen: its text is restored as painted, only the
  // glass (which was not drawn for the new page yet) condenses, never from empty under that text.
  traversal: { onScreen: "keep", condense: "glass-only", condenseFrom: ROUTE_APPEAR_FROM, headline: false, drop: false },
  // Content that arrives later (a mutation): it has just appeared, so it animates in.
  added: { onScreen: "play", condense: "with-content", condenseFrom: null, headline: false, drop: false },
};

let context: gsap.Context | null = null;
/** The exit playing (or played) on the current page, until a route change or a cancel undoes it. */
let exitContext: gsap.Context | null = null;
let exitTimeline: gsap.core.Timeline | null = null;
/** Reveal elements already handled this route (revealed, or deliberately left as painted). */
let handled = new WeakSet<Element>();
/** Surfaces whose appear is owned by a reveal (or that were left condensed) this route. */
let claimed = new WeakSet<Surface>();

function enabled(): boolean {
  return !motion.capabilities.reducedMotion;
}

/** Bottom of the viewport in document px, read once per setup (not per tick). */
function readFoldLine(): number {
  return window.scrollY + document.documentElement.clientHeight;
}

function measure(element: HTMLElement): LayoutBox {
  return measureLayoutBox(element, createLayoutBox());
}

function isOnScreen(box: LayoutBox, foldLine: number): boolean {
  return box.fixed || box.y < foldLine;
}

function isProtected(element: Element): boolean {
  return element.matches(PROTECTED_SELECTOR) || element.querySelector(PROTECTED_SELECTOR) !== null;
}

function staggerAmount(count: number, max: number): number {
  return Math.min(max, STAGGER_EACH_S * Math.max(count - 1, 0));
}

function staggerAt(index: number, count: number, amount: number): number {
  return count > 1 ? (index * amount) / (count - 1) : 0;
}

function hasOwnText(element: Element): boolean {
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "") return true;
  }
  return false;
}

/** Splits a surface's contents into elements that may rise (move) and ones that may only fade. */
function collectContent(container: Element, move: Element[], fade: Element[]): void {
  for (const child of container.children) {
    if (child.matches(GLASS_SELECTOR)) continue;
    if (child.querySelector(GLASS_SELECTOR)) {
      collectContent(child, move, fade);
      continue;
    }
    if (child.matches(PINNED_SELECTOR) || child.querySelector(PINNED_SELECTOR)) fade.push(child);
    else move.push(child);
  }
}

/** The contents of a condensing surface rise into it, starting `at` seconds into `timeline`. */
function addContent(timeline: gsap.core.Timeline, surface: Surface, at: number, timing: Timing): void {
  const element = surface.element;
  // A button or pill is mostly a bare text label, which cannot be moved on its own: the whole
  // surface fades instead (opacity on the glass element itself does not affect its backdrop).
  if (hasOwnText(element)) {
    timeline.from(element, { opacity: 0, duration: timing.content, ease: EASE, clearProps: "opacity" }, at);
    return;
  }
  const move: Element[] = [];
  const fade: Element[] = [];
  collectContent(element, move, fade);
  if (move.length > 0) {
    timeline.from(
      move,
      {
        y: CONTENT_RISE_PX,
        opacity: 0,
        duration: timing.content,
        ease: EASE,
        stagger: { amount: Math.min(CONTENT_STAGGER_MAX_S, CONTENT_STAGGER_EACH_S * (move.length - 1)) },
        clearProps: "transform,opacity",
      },
      at,
    );
  }
  if (fade.length > 0) {
    timeline.from(fade, { opacity: 0, duration: timing.content, ease: EASE, clearProps: "opacity" }, at);
  }
}

function queueCondenseDrop(surface: Surface): void {
  const centre = surfaceViewportCenter(surface);
  queueImpulse({
    kind: "drop",
    x: centre.x,
    y: centre.y,
    strength: CONDENSE_DROP_STRENGTH,
    onGlass: true,
    onScene: false,
    time: performance.now(),
  });
}

/** Registered surfaces at or inside an item, in DOM order. */
function surfacesIn(item: HTMLElement): Surface[] {
  const found: Surface[] = [];
  const own = surfaceFor(item);
  if (own) found.push(own);
  for (const element of item.querySelectorAll(GLASS_SELECTOR)) {
    const surface = surfaceFor(element);
    if (surface) found.push(surface);
  }
  return found;
}

interface Row {
  readonly top: number;
  readonly fixed: boolean;
  readonly items: HTMLElement[];
}

function groupRows(items: readonly HTMLElement[]): Row[] {
  const rows: Row[] = [];
  for (const item of items) {
    const box = measure(item);
    if (!hasSize(box)) continue;
    let row = rows.find((candidate) => candidate.fixed === box.fixed && Math.abs(candidate.top - box.y) <= ROW_TOLERANCE_PX);
    if (!row) {
      row = { top: box.y, fixed: box.fixed, items: [] };
      rows.push(row);
    }
    row.items.push(item);
  }
  return rows;
}

/**
 * One row of an items group. `trigger` null plays it now. `withGlass` false leaves the glass items
 * alone (the route condense already owns them) and only animates the plain items.
 */
function animateRow(row: Row, trigger: HTMLElement | null, timing: Timing, withGlass: boolean): void {
  const count = row.items.length;
  const amount = staggerAmount(count, timing.staggerMax);
  const timeline = gsap.timeline(trigger ? { scrollTrigger: { trigger, start: CONTENT_START, once: true } } : {});
  let dropQueued = false;
  row.items.forEach((item, index) => {
    const at = staggerAt(index, count, amount);
    const inner = surfacesIn(item);
    if (inner.length > 0) {
      if (!withGlass) return;
      for (const surface of inner) {
        claimed.add(surface);
        timeline.to(surface, { appear: 1, duration: timing.appear, ease: EASE }, at);
        addContent(timeline, surface, at + CONTENT_DELAY_S, timing);
        if (!dropQueued && DROP_KINDS.has(surface.kind)) {
          dropQueued = true;
          timeline.call(queueCondenseDrop, [surface], at);
        }
      }
    } else if (isProtected(item)) {
      // Holds an anchor or a magnetic element: it may fade but must not move.
      timeline.from(item, { opacity: 0, duration: timing.item, ease: EASE, clearProps: "opacity" }, at);
    } else {
      timeline.from(item, { y: ITEM_RISE_PX, opacity: 0, duration: timing.item, ease: EASE, clearProps: "transform,opacity" }, at);
    }
  });
}

function revealItems(
  group: HTMLElement,
  items: readonly HTMLElement[],
  plan: Plan,
  foldLine: number,
  entrances: readonly Element[],
): void {
  const rows = groupRows(items);
  const singleRow = rows.length === 1;
  const entering = insideAny(group, entrances);
  for (const row of rows) {
    const onScreen = row.fixed || row.top < foldLine;
    if (!onScreen) {
      // A single-row group triggers on the group itself, which is never transformed.
      animateRow(row, singleRow ? group : row.items[0], SCROLL_TIMING, true);
      continue;
    }
    if (plan.onScreen === "keep" || entering) {
      // As painted. Condensed glass in it is done; anything still un-condensed (an item that sits
      // partly below the fold) is left unclaimed and gets its own trigger later.
      for (const item of row.items) {
        for (const surface of surfacesIn(item)) if (surface.appear >= 1) claimed.add(surface);
      }
      continue;
    }
    // On screen and playing now: the condense step already owns the visible glass.
    animateRow(row, null, ROUTE_TIMING, false);
  }
}

/** SplitText lines rising out of their masks; the split is undone once the reveal has played. */
function revealLines(element: HTMLElement, onScroll: boolean): void {
  // The line masks pad 0.1em above and below each line and pull it back with negative margins
  // (.split-line-mask, so accents and descenders are not clipped). In normal flow those margins
  // collapse, with each other and through the element, which makes a split heading taller and
  // shifts everything below it when the split is undone. A flex column never collapses margins,
  // so while split the element is one (measured: identical height and line positions).
  const stackAsColumn = getComputedStyle(element).display === "block";
  const inlineDisplay = element.style.display;
  const inlineDirection = element.style.flexDirection;
  SplitText.create(element, {
    type: "lines",
    mask: "lines",
    linesClass: "split-line",
    // Lines-only splits keep whole words inside the line wrappers, so the text reads normally;
    // "auto" would put aria-label on <p> (not allowed there) and hide every line.
    aria: "none",
    // Spans keep the content of <p> and <h2> valid; they are made blocks below, which the line
    // masks and the transforms need (SplitText only styles its default <div> wrappers).
    tag: "span",
    // Re-split when fonts or widths change before the reveal plays; the tween's progress carries over.
    autoSplit: true,
    onSplit: (split: SplitText) => {
      if (stackAsColumn) {
        element.style.display = "flex";
        element.style.flexDirection = "column";
      }
      for (const node of [...split.lines, ...split.masks]) {
        if (!(node instanceof HTMLElement)) continue;
        node.style.display = "block";
        node.style.position = "relative";
      }
      return gsap.from(split.lines, {
        yPercent: onScroll ? LINES_RISE_PERCENT : ENTRANCE_LINES_RISE_PERCENT,
        filter: LINES_BLUR,
        duration: LINES_DURATION_S,
        ease: EASE,
        stagger: LINES_STAGGER_S,
        ...(onScroll ? { scrollTrigger: { trigger: element, start: CONTENT_START, once: true } } : {}),
        // Undo the split once played: it restores the markup, the whole text halo (masks clip it
        // into bands) and stops the autoSplit observers. Next frame, so the last tween frame paints.
        onComplete: () => {
          requestAnimationFrame(() => split.revert());
        },
      });
    },
    // Also runs before every autoSplit re-split, so lines are always measured in normal flow.
    onRevert: () => {
      if (!stackAsColumn) return;
      element.style.display = inlineDisplay;
      element.style.flexDirection = inlineDirection;
    },
  });
}

function revealBlock(element: HTMLElement, onScroll: boolean): void {
  gsap.from(element, {
    y: BLOCK_RISE_PX,
    opacity: 0,
    filter: BLOCK_BLUR,
    duration: BLOCK_DURATION_S,
    ease: EASE,
    clearProps: "transform,opacity,filter",
    ...(onScroll ? { scrollTrigger: { trigger: element, start: CONTENT_START, once: true } } : {}),
  });
}

function revealElement(element: HTMLElement, plan: Plan, foldLine: number, entrances: readonly Element[]): void {
  const kind = element.getAttribute("data-reveal");
  if (kind === "items") {
    const items = Array.from(element.children).filter((child) => child instanceof HTMLElement);
    revealItems(element, items, plan, foldLine, entrances);
    return;
  }
  if (kind !== "lines" && kind !== "block") return;
  // Splitting, moving or blurring an element that holds glass, an anchor or a magnetic element
  // would break them (see the rules above): it is revealed like a group of items instead.
  if (isProtected(element)) {
    const items = element.matches(PROTECTED_SELECTOR)
      ? [element]
      : Array.from(element.children).filter((child) => child instanceof HTMLElement);
    revealItems(element, items, plan, foldLine, entrances);
    return;
  }
  const box = measure(element);
  if (!hasSize(box)) return;
  const onScreen = isOnScreen(box, foldLine);
  // On screen it stays as painted on the first page, and wherever a CSS entrance already moves it.
  if (onScreen && (plan.onScreen === "keep" || insideAny(element, entrances))) return;
  if (kind === "lines") revealLines(element, !onScreen);
  else revealBlock(element, !onScreen);
}

/**
 * Elements a CSS entrance animation is moving right now: the hero's `rise` keyframes replay on a
 * fresh hero after a client navigation. A GSAP motion inside one would fight it (double motion),
 * so their contents are left to it. Transitions (hover, the glass hand-over) and looping
 * animations are not entrances. Read once per setup: getAnimations() flushes pending style.
 */
function cssEntranceRoots(): Element[] {
  const roots: Element[] = [];
  for (const animation of document.getAnimations()) {
    if (!(animation instanceof CSSAnimation)) continue;
    if (animation.playState === "finished" || animation.playState === "idle") continue;
    const effect = animation.effect;
    if (!(effect instanceof KeyframeEffect) || !effect.target) continue;
    if (!Number.isFinite(effect.getTiming().iterations ?? 1)) continue;
    roots.push(effect.target);
  }
  return roots;
}

function insideAny(element: Element, roots: readonly Element[]): boolean {
  for (const root of roots) if (root.contains(element)) return true;
  return false;
}

/**
 * The new page's h1 and the paragraph right after it, if any, lead it in (route changes only). The
 * landing hero has no lead since choreography v2, and its h1 replays the CSS `rise` instead.
 */
function revealHeadline(foldLine: number, entrances: readonly Element[]): void {
  const scope = document.querySelector("main") ?? document.body;
  const heading = scope.querySelector<HTMLElement>("h1");
  if (!heading) return;
  const candidates: HTMLElement[] = [heading];
  let next = heading.nextElementSibling;
  while (next && !(next instanceof HTMLParagraphElement)) next = next.nextElementSibling;
  if (next instanceof HTMLParagraphElement) candidates.push(next);
  for (const element of candidates) {
    if (handled.has(element) || isProtected(element) || insideAny(element, entrances)) continue;
    handled.add(element);
    const box = measure(element);
    if (hasSize(box) && isOnScreen(box, foldLine)) revealLines(element, false);
  }
}

function condenseOnScreen(plan: Plan, foldLine: number, entrances: readonly Element[]): void {
  if (plan.condense === "none") return;
  const visible = getSurfaces().filter(
    (surface) => !claimed.has(surface) && hasSize(surface.box) && isOnScreen(surface.box, foldLine),
  );
  const count = visible.length;
  if (count === 0) return;
  const amount = staggerAmount(count, ROUTE_TIMING.staggerMax);
  const timeline = gsap.timeline();
  const from = plan.condenseFrom;
  visible.forEach((surface, index) => {
    claimed.add(surface);
    const at = staggerAt(index, count, amount);
    const condensed = { appear: 1, duration: ROUTE_TIMING.appear, ease: EASE };
    // fromTo renders its start at once, so a staggered surface does not wait at 0 for its turn.
    if (from === null) timeline.to(surface, condensed, at);
    else timeline.fromTo(surface, { appear: from }, condensed, at);
    // The glass always condenses (it starts at 0 after a navigation); contents a CSS entrance is
    // already lifting are left to it (no glass sits in the `rise` hero today; this keeps it safe).
    if (plan.condense === "with-content" && !insideAny(surface.element, entrances)) {
      addContent(timeline, surface, at + CONTENT_DELAY_S, ROUTE_TIMING);
    }
  });
}

/** Surfaces no group claimed condense on their own as they scroll into view. */
function revealLoneSurfaces(): void {
  for (const surface of getSurfaces()) {
    if (claimed.has(surface)) continue;
    claimed.add(surface);
    if (surface.appear >= 1) continue;
    if (!hasSize(surface.box)) {
      // Not laid out at this width (hidden by a media query): show it condensed, so it is never
      // invisible glass should the layout bring it back.
      surface.appear = 1;
      continue;
    }
    gsap.to(surface, {
      appear: 1,
      duration: SCROLL_TIMING.appear,
      ease: EASE,
      scrollTrigger: { trigger: surface.element, start: LONE_SURFACE_START, once: true },
    });
  }
}

function queueRouteDrop(): void {
  const press = lastActivation();
  const now = performance.now();
  if (press.time === 0 || now - press.time > ROUTE_DROP_MAX_AGE_MS) return;
  const { width, height } = motion.viewport;
  if (press.x < 0 || press.x >= width || press.y < 0 || press.y >= height) return;
  queueImpulse({
    kind: "drop",
    x: press.x,
    y: press.y,
    strength: ROUTE_DROP_STRENGTH,
    onGlass: surfaceAtPoint(press.x, press.y, window.scrollY) !== null,
    onScene: false,
    time: now,
  });
}

function build(plan: Plan): void {
  const foldLine = readFoldLine();
  // Only plans that play on-screen content now can collide with a CSS entrance.
  const entrances = plan.onScreen === "play" ? cssEntranceRoots() : [];
  condenseOnScreen(plan, foldLine, entrances);
  for (const element of document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR)) {
    if (handled.has(element)) continue;
    handled.add(element);
    // A reveal nested inside another reveal plays as part of its parent.
    for (const nested of element.querySelectorAll(REVEAL_SELECTOR)) handled.add(nested);
    revealElement(element, plan, foldLine, entrances);
  }
  if (plan.headline) revealHeadline(foldLine, entrances);
  revealLoneSurfaces();
  if (plan.drop) queueRouteDrop();
}

/**
 * The exit's targets inside `container`, by the same rules as the reveals: nothing that holds
 * glass is faded (it would become a backdrop root and blank that glass), anchors and magnetic
 * elements only fade, everything else lifts and fades. Only on-screen subtrees are walked.
 */
function collectExitContent(container: Element, move: Element[], fade: Element[], viewportHeight: number): void {
  for (const child of container.children) {
    // One layout read for the whole walk: nothing is written until it has finished.
    const rect = child.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= viewportHeight) continue;
    if (child.matches(GLASS_SELECTOR)) {
      // A bare text label cannot fade on its own: the button or pill fades whole (opacity on the
      // glass element itself keeps its backdrop). Otherwise its contents leave, the glass stays.
      if (hasOwnText(child)) fade.push(child);
      else collectExitContent(child, move, fade, viewportHeight);
      continue;
    }
    if (child.querySelector(GLASS_SELECTOR)) collectExitContent(child, move, fade, viewportHeight);
    else if (child.matches(PINNED_SELECTOR) || child.querySelector(PINNED_SELECTOR)) fade.push(child);
    else move.push(child);
  }
}

/** Registered surfaces inside `main` that are on screen now (from their cached boxes). */
function onScreenSurfacesIn(main: Element, viewportHeight: number): Surface[] {
  const scrollY = window.scrollY;
  const found: Surface[] = [];
  for (const surface of getSurfaces()) {
    const box = surface.box;
    if (!hasSize(box) || !main.contains(surface.element)) continue;
    const top = box.fixed ? box.y : box.y - scrollY;
    if (top < viewportHeight && top + box.height > 0) found.push(surface);
  }
  return found;
}

/**
 * A press that will navigate to another page (route-exit.ts): the current page's content lifts
 * away and its glass thins while Next fetches and commits the next one, so the swap lands on a
 * quiet frame instead of a hard cut. Undone by the route change (teardownReveals) or by cancelExit.
 */
export function playExit(): void {
  revertExit();
  if (!enabled()) return;
  const main = document.querySelector("main");
  if (!main) return;
  const viewportHeight = document.documentElement.clientHeight;
  const move: Element[] = [];
  const fade: Element[] = [];
  collectExitContent(main, move, fade, viewportHeight);
  const thinning = onScreenSurfacesIn(main, viewportHeight).filter((surface) => surface.appear > EXIT_APPEAR);
  if (move.length === 0 && fade.length === 0 && thinning.length === 0) return;
  exitContext = gsap.context(() => {
    const timeline = gsap.timeline({ defaults: { duration: EXIT_DURATION_S, ease: EXIT_EASE } });
    if (move.length > 0) timeline.to(move, { opacity: 0, y: EXIT_LIFT_PX }, 0);
    if (fade.length > 0) timeline.to(fade, { opacity: 0 }, 0);
    if (thinning.length > 0) timeline.to(thinning, { appear: EXIT_APPEAR }, 0);
    exitTimeline = timeline;
  });
}

/**
 * The press did not become a navigation after all (dragged off the link, cancelled, or the new
 * page never came): the page plays back in, then the exit's inline styles are removed.
 */
export function cancelExit(): void {
  const timeline = exitTimeline;
  if (!timeline) return;
  // Not rendered yet: there is nothing to play back (and a reverse from 0 never completes).
  if (timeline.time() === 0) {
    revertExit();
    return;
  }
  exitTimeline = null;
  timeline.eventCallback("onReverseComplete", revertExit);
  timeline.reverse();
}

/** Undoes an exit at once: every inline style and appear value it wrote is restored. */
function revertExit(): void {
  exitTimeline = null;
  exitContext?.revert();
  exitContext = null;
}

/**
 * Reverts the current route's reveals (their elements are restored to their natural state), and
 * an exit still on the page (its elements may be reused by the next one).
 */
export function teardownReveals(): void {
  revertExit();
  context?.revert();
  context = null;
  handled = new WeakSet();
  claimed = new WeakSet();
}

/**
 * After the first registry scan of a route (mount or pathname change). Reverts the previous
 * route's context first, so a route is only ever set up once.
 */
export function setupRouteReveals(mode: RevealMode): void {
  teardownReveals();
  if (!enabled()) return;
  ensureGsapPlugins();
  // The scroll was just set (the route's jump, the browser's restoration) while no trigger was
  // alive to see it: the new triggers, and the refresh they queue, must start from the real one.
  syncScrollTriggerScroll();
  const plan = PLANS[mode];
  context = gsap.context(() => build(plan));
}

/** After a mutation-driven rescan: reveals for elements this route has not seen yet. */
export function addRevealsForNewElements(): void {
  if (!context || !enabled()) return;
  context.add(() => build(PLANS.added));
}

/**
 * Reduced motion switched on mid-visit, or the page is about to print: every pending reveal is
 * reverted (its content shows in its natural state at once; a reveal parked below the fold would
 * print as a blank) and every surface is shown condensed.
 */
export function completeAllReveals(): void {
  teardownReveals();
  for (const surface of getSurfaces()) surface.appear = 1;
}
