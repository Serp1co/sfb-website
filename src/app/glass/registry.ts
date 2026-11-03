/*
 * The glass registry: the bridge from the markup's data attributes to the WebGL composite.
 *
 * Two halves with a strict split:
 *  - scan / measure (DOM reads): which elements carry [data-glass], [data-anchor], [data-story] and
 *    [data-magnetic], and their LAYOUT boxes (see layout-box.ts: no transform ever pollutes them;
 *    the PRECISE_ANCHORS to the sub-pixel, the rest in whole px).
 *    Runs on boot, on route changes, on mutations, resizes, font and image loads, and once when the
 *    WebGL glass takes over. Never per tick.
 *  - update (per tick, no DOM reads): viewport rects from the cached boxes, the scroll and the
 *    magnetic offsets; hover, press and focus springs; panel energy from motion.bodies (energy.ts);
 *    culling and packing into glassFrame (in both glass modes: in css mode the composite draws
 *    only the energy outside each pane); anchorRects; the surface and anchor under the pointer.
 *    Its one DOM write is data-energized, and only when a surface's energy crosses its hysteresis.
 *    Touch screens cannot hover, so there the reading counts as focus (state w, beside keyboard
 *    focus): the energized surface nearest the viewport centre (see pickReading). Hover, the
 *    hovered slot and motion.pointer.surface stay the pointer's alone.
 *
 * Surface records live in a WeakMap keyed by element and are reused across rescans, so a surface's
 * appear/hover/press/focus/energy state (and any reveal tween holding the record) survives a rescan.
 */

import { ScrollTrigger, ensureGsapPlugins, syncScrollTriggerScroll } from "../motion/gsap-setup";
import { setDocumentHeight } from "../motion/scroll-state";
import { clamp, createSpring, criticalOmega, finite, stepCriticalSpring, type Spring } from "../motion/springs";
import { motion, type GlassMode } from "../motion/store";
import {
  ANCHORS,
  GLASS_KINDS,
  GLASS_TINTS,
  MAX_SURFACES,
  anchorRects,
  glassFrame,
  type AnchorRect,
  type GlassKind,
  type GlassTint,
} from "./contract";
import {
  ENERGY_FIT,
  createSurfaceEnergy,
  resetSurfaceEnergy,
  stepSurfaceEnergy,
  type EnergyFit,
  type SurfaceEnergy,
} from "./energy";
import {
  createLayoutBox,
  hasSize,
  measureLayoutBox,
  measurePreciseLayoutBox,
  resetLayoutBox,
  type LayoutBox,
  type ShiftCache,
} from "./layout-box";

/**
 * Everything a rescan or a mutation cares about (reveals too, so late content gets one). Only the
 * three reveal kinds: the scene's fade wrapper carries data-reveal="hidden|shown" as well.
 */
const TRACKED_SELECTOR =
  '[data-glass], [data-anchor], [data-story], [data-magnetic], [data-reveal="lines"], [data-reveal="block"], [data-reveal="items"]';
const TRACKED_ATTRIBUTES = ["data-glass", "data-glass-tint", "data-anchor", "data-story", "data-magnetic", "data-practice"];
const WINDOW_SELECTOR = "[data-glass-window]";
/**
 * Set (to "true") on a surface while a body of the orb is inside it: the CSS glow's cue in css mode
 * and a hook for styles in either mode. Never in markup and not tracked: writing it rescans nothing.
 */
const ENERGIZED_ATTRIBUTE = "data-energized";
/** data-anchor holds one name, or several separated by spaces (one element may be two anchors). */
const ANCHOR_NAME_SEPARATOR = /\s+/;
/**
 * Anchors measured to the sub-pixel (measurePreciseLayoutBox): the hero logo, the partner and
 * customer marks and the hero tagline (v3.4), whose outlines the composite traces with a 1 px line
 * from a distance field, where the offsets' whole px would set it half a pixel off the glyphs. The
 * tagline's field is rasterised from its rendered text, so a change of its rect is also a cue to
 * rebuild it, and whole px would hide one under a pixel (a resize step, a font swap onto close
 * fallback metrics). It is re-measured by the usual triggers, all within a frame or two: a window
 * resize (that same tick), its box resizing (the ResizeObserver), a font load (loadingdone; ready
 * for fonts that finished first) and a new page (a language is a page of its own: a full load).
 * Everything else keeps whole px.
 */
const PRECISE_ANCHORS: ReadonlySet<string> = new Set([ANCHORS.heroLogo, ANCHORS.logoMark, ANCHORS.heroTagline]);
/**
 * The panels and cards a body of the orb lives in by design (owner decisions 2026-11-02, v2 and
 * v3): the landing's About panels, service cards and contact cards, and the practice pages' feature
 * cards and call-to-action panel, found by their anchors on the surface, around it or inside it.
 */
const CELL_SELECTOR = [
  ANCHORS.aboutCell,
  ANCHORS.serviceCard,
  ANCHORS.contactCell,
  ANCHORS.practiceCell,
  ANCHORS.practiceCtaCell,
]
  .map((name) => `[data-anchor~="${name}"]`)
  .join(", ");
/**
 * The practice-tech pill row: each pill in it holds a droplet body of its own, which lights it
 * (v3.1), and a bigger body flowing in or out lights the share of a pill it covers (energy.ts).
 */
const PILL_ROW_SELECTOR = `[data-anchor~="${ANCHORS.practiceTech}"]`;

/** How far a surface's shadow and lift read above the scene, by kind. */
const ELEVATION: Readonly<Record<GlassKind, number>> = {
  button: 0.9,
  panel: 0.8,
  card: 0.7,
  band: 0.5,
  pill: 0.4,
};
/** Surfaces further than this outside the viewport are not packed (their shadow cannot reach in). */
const CULL_MARGIN_PX = 160;
/** Bands are full-bleed: their side bevels are pushed this far past each viewport edge. */
const BAND_OVERHANG_PX = 40;
/** Hover and keyboard-focus light ease in and out over about this long (critically damped). */
const HOVER_SETTLE_S = 0.18;
const FOCUS_SETTLE_S = 0.18;
/** A press lights the pane at full strength and fades with this time constant. */
const PRESS_DECAY_TAU_S = 0.35;
/**
 * On touch screens the panel being read takes the focus channel. Another energized panel must be
 * this much nearer the viewport centre to take over, so a scroll resting between two neighbours
 * never flickers the electricity from one to the other.
 */
const READING_SWITCH_PX = 32;
/** Breaks a tie between surfaces equally near the viewport centre (both around it): the one centred nearer. */
const READING_TIE_SHARE = 1e-3;

const HOVER_OMEGA = criticalOmega(HOVER_SETTLE_S);
const FOCUS_OMEGA = criticalOmega(FOCUS_SETTLE_S);

export type RescanReason = "mount" | "route" | "mutation";

export interface Surface {
  readonly element: HTMLElement;
  kind: GlassKind;
  kindIndex: number;
  tint: GlassTint;
  tintIndex: number;
  elevation: number;
  /** Layout box (see layout-box.ts), refreshed by every measure. */
  readonly box: LayoutBox;
  /** Corner radius in CSS px: computed border-top-left-radius, at most half the short side. */
  radius: number;
  /** The [data-glass-window] inside it (a clear window onto the scene), if any. */
  windowElement: HTMLElement | null;
  readonly windowBox: LayoutBox;
  /** 0 = not condensed yet, 1 = settled. Reveals tween this (it is a plain number on purpose). */
  appear: number;
  /** The pointer over it (a mouse, pen or trackpad; never touch), eased toward hoverTarget. */
  readonly hover: Spring;
  /** 1 while the pointer is over it this tick, else 0. */
  hoverTarget: number;
  /**
   * Keyboard focus inside it or, on touch screens, the reading (see pickReading), eased toward 1
   * while either holds: the touch focus shares the keyboard's channel (state w), not hover's.
   */
  readonly focus: Spring;
  /** 1 while keyboard focus (:focus-visible) is inside the surface (the reading is added per tick). */
  focusTarget: number;
  /** Jumps to 1 on a press inside the surface, then decays. */
  press: number;
  /** Eased energy from the orb's bodies inside it, and the body it tracks (see energy.ts). */
  readonly energy: SurfaceEnergy;
  /**
   * How a body lights it, refreshed by every rescan: "contain" for the cells (CELL_SELECTOR),
   * "overlap" for the practice-tech pills (PILL_ROW_SELECTOR), null for every other surface
   * (never energized).
   */
  fit: EnergyFit | null;
  /** Magnetic pull (CSS px), written by magnetic.ts in the same tick as the DOM translate. */
  offsetX: number;
  offsetY: number;
  /** This tick's viewport geometry, CSS px (bands already widened past the viewport). */
  centerX: number;
  centerY: number;
  halfWidth: number;
  halfHeight: number;
  /** Packed index into glassFrame this tick, or -1 (culled, hidden or past MAX_SURFACES). */
  slot: number;
}

interface AnchorEntry {
  readonly element: HTMLElement;
  readonly name: string;
  /**
   * Its place among the entries of its name, in DOM order: its position in anchorRects.get(name)
   * and the index motion.pointer.anchor reports. Numbered as published (publishAnchors).
   */
  index: number;
  /** Shared by every name the element carries; measured once, by the entry that `measures`. */
  readonly box: LayoutBox;
  readonly measures: boolean;
  /** One of the element's names is in PRECISE_ANCHORS: its box is measured to the sub-pixel. */
  readonly precise: boolean;
  readonly rect: AnchorRect;
}

export interface TrackedElement {
  readonly element: HTMLElement;
  readonly box: LayoutBox;
}

export interface StorySection extends TrackedElement {
  readonly name: string;
}

const records = new WeakMap<HTMLElement, Surface>();
let surfaces: Surface[] = [];
let anchors: AnchorEntry[] = [];
let storySections: StorySection[] = [];
let magneticTargets: TrackedElement[] = [];

let running = false;
/** A client navigation has happened: every newly seen surface starts un-condensed. */
let navigated = false;
let rescanRequested = false;
let measureRequested = false;
let refreshRequested = false;
let lastBodyHeight = -1;
let lastDocumentHeight = -1;
let lastEngineMode: GlassMode = "css";
/** Slots written last tick; everything from `count` up to this is zeroed. */
let writtenSlots = 0;
/** Touch screens: the energized surface being read (it holds the focus channel), or null. */
let reading: Surface | null = null;

let resizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;
const observed = new Set<Element>();

/** The pointer is over a position:fixed element (header, menus, footer bar): no glass hover. */
let pointerOverFixed = false;
let fixedCache = new WeakMap<Element, boolean>();
/** Pending focus re-check after a key press (see onKeyActivity); 0 when none. */
let focusRefreshTimer: ReturnType<typeof setTimeout> | 0 = 0;

const rescanListeners = new Set<(reason: RescanReason) => void>();
const layoutListeners = new Set<() => void>();

function isGlassKind(value: string | null): value is GlassKind {
  return value !== null && (GLASS_KINDS as readonly string[]).includes(value);
}

function isGlassTint(value: string | null): value is GlassTint {
  return value !== null && (GLASS_TINTS as readonly string[]).includes(value);
}

function createSurface(element: HTMLElement, kind: GlassKind): Surface {
  return {
    element,
    kind,
    kindIndex: GLASS_KINDS.indexOf(kind),
    tint: "none",
    tintIndex: 0,
    elevation: ELEVATION[kind],
    box: createLayoutBox(),
    radius: 0,
    windowElement: null,
    windowBox: createLayoutBox(),
    appear: 1,
    hover: createSpring(),
    hoverTarget: 0,
    focus: createSpring(),
    focusTarget: 0,
    press: 0,
    energy: createSurfaceEnergy(),
    fit: null,
    offsetX: 0,
    offsetY: 0,
    centerX: 0,
    centerY: 0,
    halfWidth: 0,
    halfHeight: 0,
    slot: -1,
  };
}

function configureSurface(surface: Surface, kind: GlassKind): void {
  const tintAttribute = surface.element.getAttribute("data-glass-tint");
  const tint: GlassTint = isGlassTint(tintAttribute) ? tintAttribute : "none";
  surface.kind = kind;
  surface.kindIndex = GLASS_KINDS.indexOf(kind);
  surface.tint = tint;
  surface.tintIndex = GLASS_TINTS.indexOf(tint);
  surface.elevation = ELEVATION[kind];
  surface.windowElement = surface.element.querySelector<HTMLElement>(WINDOW_SELECTOR);
  surface.fit = energyFit(surface.element, kind);
}

/** See Surface.fit: the kind's fit (energy.ts), where the markup makes the surface a cell. */
function energyFit(element: HTMLElement, kind: GlassKind): EnergyFit | null {
  const fit = ENERGY_FIT[kind];
  if (fit === "contain") {
    return element.closest(CELL_SELECTOR) !== null || element.querySelector(CELL_SELECTOR) !== null ? fit : null;
  }
  if (fit === "overlap") return element.closest(PILL_ROW_SELECTOR) !== null ? fit : null;
  return null;
}

function readRadius(element: HTMLElement, box: LayoutBox): number {
  const raw = getComputedStyle(element).borderTopLeftRadius;
  // "24px", "999px", "50%", or "24px 12px" for an elliptical corner (the horizontal radius is
  // enough for the composite's circular corners).
  const first = raw.split(" ")[0] ?? "";
  const value = Number.parseFloat(first);
  const shortSide = Math.min(box.width, box.height);
  if (!Number.isFinite(value) || shortSide <= 0) return 0;
  const px = first.endsWith("%") ? (value / 100) * shortSide : value;
  return clamp(px, 0, shortSide / 2);
}

/**
 * Starting appear for a surface seen for the first time, decided from what this visitor will get
 * (capabilities), not from what is drawing right now (the engine is "css" until boot).
 */
function defaultAppear(box: LayoutBox, foldLine: number): number {
  const { reducedMotion, glassMode } = motion.capabilities;
  if (reducedMotion || glassMode === "css") return 1;
  // After a client navigation everything condenses in (reveals.ts plays it).
  if (navigated) return 0;
  // First page: what is on screen at boot is revealed by the boot wave; the rest condenses when
  // scrolled to.
  return box.fixed || box.y < foldLine ? 1 : 0;
}

function measureAll(): void {
  measureRequested = false;
  for (const surface of surfaces) {
    measureLayoutBox(surface.element, surface.box);
    surface.radius = readRadius(surface.element, surface.box);
    if (surface.windowElement) measureLayoutBox(surface.windowElement, surface.windowBox);
    else resetLayoutBox(surface.windowBox);
  }
  // The precise anchors share most of their ancestors (every mark sits in the same bands): each
  // element's transform is read once per measure.
  const shifts: ShiftCache = new Map();
  for (const anchor of anchors) {
    if (!anchor.measures) continue;
    if (anchor.precise) measurePreciseLayoutBox(anchor.element, anchor.box, shifts);
    else measureLayoutBox(anchor.element, anchor.box);
  }
  for (const section of storySections) measureLayoutBox(section.element, section.box);
  for (const target of magneticTargets) measureLayoutBox(target.element, target.box);
  const documentHeight = document.documentElement.scrollHeight;
  setDocumentHeight(documentHeight);
  if (documentHeight !== lastDocumentHeight) {
    lastDocumentHeight = documentHeight;
    for (const listener of layoutListeners) listener();
  }
}

/**
 * Dark at once, attribute removed (a no-op when it is absent): for surfaces leaving the registry,
 * every surface on a new page, and fresh records (an element may keep a stale attribute from a
 * registry instance that a hot reload replaced).
 */
function clearEnergy(surface: Surface): void {
  resetSurfaceEnergy(surface.energy);
  surface.element.removeAttribute(ENERGIZED_ATTRIBUTE);
}

/**
 * Publishes the anchors (kept in DOM order) by name, and numbers each as it lands in its list: an
 * index is always the entry's list position, also after a prune drops earlier entries, so the
 * index motion.pointer.anchor reports always finds its rect, and a logo mark keeps its cell's.
 */
function publishAnchors(): void {
  anchorRects.clear();
  for (const anchor of anchors) {
    let list = anchorRects.get(anchor.name);
    if (!list) {
      list = [];
      anchorRects.set(anchor.name, list);
    }
    anchor.index = list.length;
    list.push(anchor.rect);
  }
}

function observeTracked(): void {
  const observer = resizeObserver;
  if (!observer) return;
  const wanted = new Set<Element>([document.body]);
  for (const surface of surfaces) {
    wanted.add(surface.element);
    if (surface.windowElement) wanted.add(surface.windowElement);
  }
  for (const anchor of anchors) wanted.add(anchor.element);
  for (const section of storySections) wanted.add(section.element);
  for (const target of magneticTargets) wanted.add(target.element);
  for (const element of observed) {
    if (!wanted.has(element)) {
      observer.unobserve(element);
      observed.delete(element);
    }
  }
  for (const element of wanted) {
    if (!observed.has(element)) {
      observer.observe(element);
      observed.add(element);
    }
  }
}

/**
 * Re-reads which elements are tracked and measures them (forces one layout). Synchronous: the
 * route-change handler relies on it having finished before reveals are set up.
 */
export function rescanRegistry(reason: RescanReason): void {
  if (!running) return;
  rescanRequested = false;
  fixedCache = new WeakMap();

  const fresh: Surface[] = [];
  const nextSurfaces: Surface[] = [];
  for (const element of document.querySelectorAll<HTMLElement>("[data-glass]")) {
    const kind = element.getAttribute("data-glass");
    if (!isGlassKind(kind)) continue;
    let surface = records.get(element);
    if (!surface) {
      surface = createSurface(element, kind);
      records.set(element, surface);
      fresh.push(surface);
      clearEnergy(surface);
    }
    configureSurface(surface, kind);
    nextSurfaces.push(surface);
  }
  // A surface that left (removed, or no longer glass) must not keep glowing; on a new page nothing
  // starts lit (the orb is mid-bridge, and its bodies light their new panels as they settle).
  const kept = new Set(nextSurfaces);
  for (const surface of surfaces) if (!kept.has(surface)) clearEnergy(surface);
  if (reason === "route") for (const surface of nextSurfaces) clearEnergy(surface);
  surfaces = nextSurfaces;
  // A new page starts unread (nothing is energized yet), and a surface that left is never read.
  if (reason === "route" || (reading && !kept.has(reading))) reading = null;

  anchors = [];
  for (const element of document.querySelectorAll<HTMLElement>("[data-anchor]")) {
    const names = (element.getAttribute("data-anchor") ?? "").split(ANCHOR_NAME_SEPARATOR);
    const precise = names.some((name) => PRECISE_ANCHORS.has(name));
    let box: LayoutBox | null = null;
    for (let k = 0; k < names.length; k++) {
      const name = names[k];
      if (!name || names.indexOf(name) !== k) continue;
      const measures = box === null;
      box ??= createLayoutBox();
      const rect: AnchorRect = { x: 0, y: 0, width: 0, height: 0, visible: false };
      // Numbered by publishAnchors, in this (DOM) order.
      anchors.push({ element, name, index: -1, box, measures, precise, rect });
    }
  }
  publishAnchors();

  storySections = [];
  for (const element of document.querySelectorAll<HTMLElement>("[data-story]")) {
    const name = element.getAttribute("data-story") ?? "";
    if (name) storySections.push({ element, name, box: createLayoutBox() });
  }

  magneticTargets = [];
  for (const element of document.querySelectorAll<HTMLElement>("[data-magnetic]")) {
    magneticTargets.push({ element, box: createLayoutBox() });
  }

  measureAll();
  const foldLine = window.scrollY + document.documentElement.clientHeight;
  for (const surface of fresh) surface.appear = defaultAppear(surface.box, foldLine);
  observeTracked();
  refreshFocus();
  for (const listener of rescanListeners) listener(reason);
}

/** Drops records whose elements left the document, so a removed page's glass is never drawn. */
export function pruneDisconnected(): void {
  surfaces = surfaces.filter((surface) => {
    if (surface.element.isConnected) return true;
    clearEnergy(surface);
    if (surface === reading) reading = null;
    return false;
  });
  const keptAnchors = anchors.filter((anchor) => anchor.element.isConnected);
  if (keptAnchors.length !== anchors.length) {
    // Renumbered as published, as the rescan this change asked for will number them: the next
    // tick's motion.pointer.anchor (the registry runs before the scene) carries the new index.
    anchors = keptAnchors;
    publishAnchors();
  }
  storySections = storySections.filter((section) => section.element.isConnected);
  magneticTargets = magneticTargets.filter((target) => target.element.isConnected);
}

/** From now on, newly seen surfaces start un-condensed (see defaultAppear). */
export function markNavigated(): void {
  navigated = true;
}

export function requestMeasure(): void {
  measureRequested = true;
}

function isTrackedNode(node: Node): boolean {
  return node instanceof Element && (node.matches(TRACKED_SELECTOR) || node.querySelector(TRACKED_SELECTOR) !== null);
}

function onMutations(mutations: MutationRecord[]): void {
  let relevant = false;
  for (const mutation of mutations) {
    if (mutation.type === "attributes") relevant = true;
    else {
      for (const node of mutation.addedNodes) if (isTrackedNode(node)) relevant = true;
      for (const node of mutation.removedNodes) if (isTrackedNode(node)) relevant = true;
    }
    if (relevant) break;
  }
  if (!relevant) return;
  // Stop drawing removed elements right away; the full rescan (a layout read) waits for the tick.
  pruneDisconnected();
  rescanRequested = true;
}

function onResize(entries: ResizeObserverEntry[]): void {
  measureRequested = true;
  for (const entry of entries) {
    if (entry.target !== document.body) continue;
    const height = entry.contentRect.height;
    if (lastBodyHeight >= 0 && Math.abs(height - lastBodyHeight) > 0.5) refreshRequested = true;
    lastBodyHeight = height;
  }
}

function onWindowResize(): void {
  measureRequested = true;
  // Media queries can change which elements are position:fixed (the footer bar).
  fixedCache = new WeakMap();
}

function onImageLoad(event: Event): void {
  if (event.target instanceof HTMLImageElement) measureRequested = true;
}

function onFontsChanged(): void {
  if (running) measureRequested = true;
}

/**
 * True when `target` sits inside a position:fixed element: the header bar, the footer bar, menus.
 * That chrome is CSS glass above the page, so a press or hover there never belongs to the WebGL
 * glass scrolling underneath. Cached per element until the next rescan or window resize.
 */
export function isInsideFixedChrome(target: EventTarget | null): boolean {
  const body = document.body;
  const root = document.documentElement;
  const visited: Element[] = [];
  let node = target instanceof Element ? target : null;
  let result = false;
  while (node && node !== body && node !== root) {
    const cached = fixedCache.get(node);
    if (cached !== undefined) {
      result = cached;
      break;
    }
    visited.push(node);
    if (getComputedStyle(node).position === "fixed") {
      result = true;
      break;
    }
    node = node.parentElement;
  }
  for (const element of visited) fixedCache.set(element, result);
  return result;
}

/**
 * Fixed overlays (header, footer bar, menus) sit above the page, so glass scrolling under them
 * must not light up. Pointer boundary events are enough: a fixed element stays under a resting
 * cursor while the page scrolls beneath it, and so does page content.
 */
function onPointerOver(event: PointerEvent): void {
  pointerOverFixed = isInsideFixedChrome(event.target);
}

function focusVisible(element: Element): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    return element.matches(":focus");
  }
}

function refreshFocus(): void {
  const active = document.activeElement;
  const visible = active instanceof Element && active !== document.body && focusVisible(active);
  for (const surface of surfaces) {
    surface.focusTarget = visible && active && surface.element.contains(active) ? 1 : 0;
  }
}

/** Focus moves synchronously, but :focus-visible and activeElement settle after the event. */
function onFocusChange(): void {
  queueMicrotask(refreshFocus);
}

/**
 * Keyboard use turns :focus-visible on for an element that the mouse focused, and no focus event
 * says so. The browser updates it around the key's dispatch, so look once that has finished.
 */
function onKeyActivity(): void {
  if (focusRefreshTimer) return;
  focusRefreshTimer = setTimeout(() => {
    focusRefreshTimer = 0;
    refreshFocus();
  }, 0);
}

export function startRegistry(): void {
  if (running) return;
  running = true;
  ensureGsapPlugins();
  lastEngineMode = motion.engine.glassMode;
  resizeObserver = new ResizeObserver(onResize);
  mutationObserver = new MutationObserver(onMutations);
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: TRACKED_ATTRIBUTES,
  });
  window.addEventListener("resize", onWindowResize);
  document.addEventListener("load", onImageLoad, true);
  document.addEventListener("pointerover", onPointerOver, { passive: true });
  document.addEventListener("focusin", onFocusChange);
  document.addEventListener("focusout", onFocusChange);
  document.addEventListener("keydown", onKeyActivity, { capture: true, passive: true });
  document.fonts.addEventListener("loadingdone", onFontsChanged);
  void document.fonts.ready.then(onFontsChanged);
}

export function stopRegistry(): void {
  if (!running) return;
  running = false;
  resizeObserver?.disconnect();
  mutationObserver?.disconnect();
  resizeObserver = null;
  mutationObserver = null;
  observed.clear();
  window.removeEventListener("resize", onWindowResize);
  document.removeEventListener("load", onImageLoad, true);
  document.removeEventListener("pointerover", onPointerOver);
  document.removeEventListener("focusin", onFocusChange);
  document.removeEventListener("focusout", onFocusChange);
  document.removeEventListener("keydown", onKeyActivity, { capture: true });
  if (focusRefreshTimer) clearTimeout(focusRefreshTimer);
  focusRefreshTimer = 0;
  document.fonts.removeEventListener("loadingdone", onFontsChanged);
  // StrictMode's remount (and a real unmount) must not leave panels lit with nothing updating them.
  for (const surface of surfaces) clearEnergy(surface);
  surfaces = [];
  reading = null;
  anchors = [];
  storySections = [];
  magneticTargets = [];
  anchorRects.clear();
  clearSlots(0, MAX_SURFACES);
  writtenSlots = 0;
  glassFrame.count = 0;
  glassFrame.hovered = -1;
  motion.pointer.surface = -1;
  motion.pointer.anchor = null;
  rescanRequested = false;
  measureRequested = false;
  refreshRequested = false;
  lastBodyHeight = -1;
  lastDocumentHeight = -1;
}

export function onRescan(listener: (reason: RescanReason) => void): () => void {
  rescanListeners.add(listener);
  return () => rescanListeners.delete(listener);
}

/** Called after a measure that changed the document height (smooth scroll re-reads its limit). */
export function onLayoutChange(listener: () => void): () => void {
  layoutListeners.add(listener);
  return () => layoutListeners.delete(listener);
}

export function getSurfaces(): readonly Surface[] {
  return surfaces;
}

/**
 * The element behind anchorRects.get(name)[index], or null: for the scene's one-off reads of what
 * an anchor shows (a logo mark's image source, to build its distance field), on a rescan
 * (onRescan), never per tick.
 */
export function anchorElement(name: string, index: number): HTMLElement | null {
  for (const anchor of anchors) if (anchor.name === name && anchor.index === index) return anchor.element;
  return null;
}

export function surfaceFor(element: Element): Surface | undefined {
  return element instanceof HTMLElement ? records.get(element) : undefined;
}

/** Magnetic offset for a surface (no-op for other elements). */
export function setOffset(element: Element, x: number, y: number): void {
  const surface = surfaceFor(element);
  if (!surface) return;
  surface.offsetX = finite(x);
  surface.offsetY = finite(y);
}

export function getStorySections(): readonly StorySection[] {
  return storySections;
}

export function getMagneticTargets(): readonly TrackedElement[] {
  return magneticTargets;
}

/** Viewport centre of a surface right now, from the cached box and the current scroll. */
export function surfaceViewportCenter(surface: Surface, scrollY = motion.scroll.y): { x: number; y: number } {
  const box = surface.box;
  const x = surface.kind === "band" ? motion.viewport.width / 2 : box.x + box.width / 2 + surface.offsetX;
  const y = (box.fixed ? box.y : box.y - scrollY) + box.height / 2 + surface.offsetY;
  return { x, y };
}

function insideRoundedRect(px: number, py: number, cx: number, cy: number, hw: number, hh: number, r: number): boolean {
  const dx = Math.abs(px - cx);
  const dy = Math.abs(py - cy);
  if (dx > hw || dy > hh) return false;
  const qx = dx - (hw - r);
  const qy = dy - (hh - r);
  return qx <= 0 || qy <= 0 || qx * qx + qy * qy <= r * r;
}

/** Hit area of a surface: its own element (a band's hit area is the band, not the widened lens). */
function surfaceContains(surface: Surface, px: number, py: number, scrollY: number): boolean {
  const box = surface.box;
  if (!hasSize(box)) return false;
  const cx = box.x + box.width / 2 + surface.offsetX;
  const cy = (box.fixed ? box.y : box.y - scrollY) + box.height / 2 + surface.offsetY;
  return insideRoundedRect(px, py, cx, cy, box.width / 2, box.height / 2, surface.radius);
}

/** The smallest registered surface containing a client point, or null. No DOM reads. */
export function surfaceAtPoint(x: number, y: number, scrollY = motion.scroll.y): Surface | null {
  let best: Surface | null = null;
  let bestArea = Infinity;
  for (const surface of surfaces) {
    if (!surfaceContains(surface, x, y, scrollY)) continue;
    const area = surface.box.width * surface.box.height;
    if (area < bestArea) {
      best = surface;
      bestArea = area;
    }
  }
  return best;
}

function clearSlots(from: number, to: number): void {
  for (let i = from * 4; i < to * 4; i++) {
    glassFrame.rects[i] = 0;
    glassFrame.shape[i] = 0;
    glassFrame.state[i] = 0;
    glassFrame.windows[i] = 0;
    glassFrame.energy[i] = 0;
  }
}

/** The CSS glow's cue: written only when the energy's hysteresis flips (see energy.ts). */
function writeEnergized(surface: Surface): void {
  if (surface.energy.energized) surface.element.setAttribute(ENERGIZED_ATTRIBUTE, "true");
  else surface.element.removeAttribute(ENERGIZED_ATTRIBUTE);
}

function updateSurfaces(): Surface | null {
  const pointer = motion.pointer;
  const scrollY = motion.scroll.y;
  const viewportWidth = motion.viewport.width;
  const dt = motion.time.delta;
  const pressDecay = dt > 0 ? Math.exp(-dt / PRESS_DECAY_TAU_S) : 1;
  const hoverable = pointer.inside && pointer.type !== "touch" && !pointerOverFixed;
  const bodies = motion.bodies;
  let hovered: Surface | null = null;
  let hoveredArea = Infinity;

  for (const surface of surfaces) {
    const box = surface.box;
    const sized = hasSize(box);
    if (surface.kind === "band") {
      surface.centerX = viewportWidth / 2;
      surface.halfWidth = viewportWidth / 2 + BAND_OVERHANG_PX;
    } else {
      surface.centerX = box.x + box.width / 2 + surface.offsetX;
      surface.halfWidth = box.width / 2;
    }
    surface.centerY = (box.fixed ? box.y : box.y - scrollY) + box.height / 2 + surface.offsetY;
    surface.halfHeight = box.height / 2;

    const inside = sized && hoverable && surfaceContains(surface, pointer.x, pointer.y, scrollY);
    surface.hoverTarget = inside ? 1 : 0;
    if (inside) {
      const area = box.width * box.height;
      if (area < hoveredArea) {
        hovered = surface;
        hoveredArea = area;
      }
    }

    surface.press *= pressDecay;
    for (const impulse of motion.impulses) {
      // onGlass is false for a press on fixed chrome, even where a surface scrolls beneath it.
      if (
        impulse.kind === "press" &&
        impulse.onGlass &&
        sized &&
        surfaceContains(surface, impulse.x, impulse.y, scrollY)
      ) {
        surface.press = 1;
      }
    }

    // In both glass modes: the CSS glow reads data-energized when the panels are CSS glass. Fixed
    // chrome floats above the page, so no body is ever inside it.
    const fit = sized && !box.fixed ? surface.fit : null;
    const changed = stepSurfaceEnergy(
      surface.energy,
      fit,
      surface.centerX - surface.halfWidth,
      surface.centerY - surface.halfHeight,
      surface.centerX + surface.halfWidth,
      surface.centerY + surface.halfHeight,
      bodies,
      dt,
    );
    if (changed) writeEnergized(surface);
  }

  // Touch screens cannot hover: the panel being read counts as focused (state w, the channel
  // keyboard focus drives), so the composite's electricity (energy x max(hover, focus)) shows where
  // the visitor is looking, while hover, glassFrame.hovered and motion.pointer.surface stay the
  // pointer's alone. A mouse or trackpad inside the page (a touch device can have one) hovers as on
  // the desktop instead, for as long as it is there.
  reading = !hoverable && readsByCentre() ? pickReading() : null;
  for (const surface of surfaces) {
    stepCriticalSpring(surface.hover, surface.hoverTarget, HOVER_OMEGA, dt);
    stepCriticalSpring(surface.focus, surface === reading ? 1 : surface.focusTarget, FOCUS_OMEGA, dt);
  }
  return hovered;
}

/**
 * The device's main pointer cannot hover (a phone, a tablet): the focus channel follows the
 * reading. Decided from the capabilities read at boot, so it never flips during the visit.
 */
function readsByCentre(): boolean {
  const { coarsePointer, hover } = motion.capabilities;
  return coarsePointer || !hover;
}

/**
 * The energized surface on screen nearest the viewport centre (by the distance from the centre to
 * its rect: 0 while the centre is over it), which is the panel being read: it counts as focused.
 * The current one keeps it until another is READING_SWITCH_PX nearer. Null when nothing on screen
 * is energized.
 */
function pickReading(): Surface | null {
  const cx = motion.viewport.width / 2;
  const cy = motion.viewport.height / 2;
  let best: Surface | null = null;
  let bestScore = Infinity;
  let currentScore = Infinity;
  for (const surface of surfaces) {
    if (!surface.energy.energized || visibility(surface) !== 1) continue;
    const dx = Math.max(surface.centerX - surface.halfWidth - cx, 0, cx - surface.centerX - surface.halfWidth);
    const dy = Math.max(surface.centerY - surface.halfHeight - cy, 0, cy - surface.centerY - surface.halfHeight);
    const score =
      Math.hypot(dx, dy) + READING_TIE_SHARE * Math.hypot(surface.centerX - cx, surface.centerY - cy);
    if (!Number.isFinite(score)) continue;
    if (surface === reading) currentScore = score;
    if (score < bestScore) {
      best = surface;
      bestScore = score;
    }
  }
  if (reading !== null && Number.isFinite(currentScore) && currentScore <= bestScore + READING_SWITCH_PX) return reading;
  return best;
}

/** 1: intersects the viewport, 2: within the cull margin only, 0: hidden or too far away. */
function visibility(surface: Surface): number {
  if (!hasSize(surface.box)) return 0;
  const width = motion.viewport.width;
  const height = motion.viewport.height;
  const left = surface.centerX - surface.halfWidth;
  const right = surface.centerX + surface.halfWidth;
  const top = surface.centerY - surface.halfHeight;
  const bottom = surface.centerY + surface.halfHeight;
  if (right > 0 && left < width && bottom > 0 && top < height) return 1;
  const margin = CULL_MARGIN_PX;
  return right > -margin && left < width + margin && bottom > -margin && top < height + margin ? 2 : 0;
}

function writeSlot(surface: Surface, slot: number): void {
  const i = slot * 4;
  const rects = glassFrame.rects;
  const shape = glassFrame.shape;
  const state = glassFrame.state;
  const windows = glassFrame.windows;
  const energy = glassFrame.energy;
  rects[i] = finite(surface.centerX);
  rects[i + 1] = finite(surface.centerY);
  rects[i + 2] = finite(surface.halfWidth);
  rects[i + 3] = finite(surface.halfHeight);
  shape[i] = finite(surface.radius);
  shape[i + 1] = surface.kindIndex;
  shape[i + 2] = surface.tintIndex;
  shape[i + 3] = surface.elevation;
  state[i] = clamp(finite(surface.appear), 0, 1);
  state[i + 1] = clamp(finite(surface.hover.value), 0, 1);
  state[i + 2] = clamp(finite(surface.press), 0, 1);
  state[i + 3] = clamp(finite(surface.focus.value), 0, 1);
  const win = surface.windowBox;
  if (surface.windowElement && hasSize(win)) {
    const scrollY = motion.scroll.y;
    windows[i] = finite(win.x + win.width / 2 + surface.offsetX);
    windows[i + 1] = finite((win.fixed ? win.y : win.y - scrollY) + win.height / 2 + surface.offsetY);
    windows[i + 2] = finite(win.width / 2);
    windows[i + 3] = finite(win.height / 2);
  } else {
    windows[i] = 0;
    windows[i + 1] = 0;
    windows[i + 2] = 0;
    windows[i + 3] = 0;
  }
  const charge = surface.energy;
  energy[i] = clamp(finite(charge.spring.value), 0, 1);
  energy[i + 1] = finite(charge.x);
  energy[i + 2] = finite(charge.y);
  energy[i + 3] = Math.max(finite(charge.radius), 0);
}

/**
 * Packs the surfaces near the viewport in BOTH glass modes (contract: GlassFrame.count). Whether
 * the composite draws a whole liquid pane or, under CSS glass, only the energy outside it is the
 * pipeline's call from motion.engine.glassMode; the packed values mean the same in either mode.
 */
function packSurfaces(): number {
  let count = 0;
  for (const surface of surfaces) surface.slot = -1;
  // Two passes so that, should more than MAX_SURFACES be near the viewport, the ones actually on
  // screen win over the ones only inside the cull margin.
  for (let pass = 1; pass <= 2; pass++) {
    for (const surface of surfaces) {
      if (count >= MAX_SURFACES) break;
      if (surface.slot >= 0 || visibility(surface) !== pass) continue;
      surface.slot = count;
      writeSlot(surface, count);
      count++;
    }
  }
  if (writtenSlots > count) clearSlots(count, writtenSlots);
  writtenSlots = count;
  glassFrame.count = count;
  return count;
}

function updateAnchors(hoverable: boolean): void {
  const pointer = motion.pointer;
  const scrollY = motion.scroll.y;
  const width = motion.viewport.width;
  const height = motion.viewport.height;
  let hit: AnchorEntry | null = null;
  let hitArea = Infinity;
  for (const anchor of anchors) {
    const box = anchor.box;
    const rect = anchor.rect;
    // Finite like the packed glass: the scene feeds these straight into uniforms (guard rects).
    rect.x = finite(box.x);
    rect.y = finite(box.fixed ? box.y : box.y - scrollY);
    rect.width = finite(box.width);
    rect.height = finite(box.height);
    rect.visible =
      hasSize(box) && rect.x < width && rect.x + rect.width > 0 && rect.y < height && rect.y + rect.height > 0;
    if (
      hoverable &&
      rect.visible &&
      pointer.x >= rect.x &&
      pointer.x < rect.x + rect.width &&
      pointer.y >= rect.y &&
      pointer.y < rect.y + rect.height
    ) {
      const area = rect.width * rect.height;
      if (area < hitArea) {
        hit = anchor;
        hitArea = area;
      }
    }
  }
  const current = pointer.anchor;
  if (hit) {
    if (!current || current.name !== hit.name || current.index !== hit.index) {
      pointer.anchor = { name: hit.name, index: hit.index };
    }
  } else if (current) {
    pointer.anchor = null;
  }
}

/** Per tick, after the scroll and the magnetic offsets are updated and before the canvas renders. */
export function updateRegistry(): void {
  if (!running) return;
  if (motion.engine.glassMode !== lastEngineMode) {
    lastEngineMode = motion.engine.glassMode;
    // Measure once more as the WebGL glass takes over: whatever settled since boot is now exact.
    if (lastEngineMode === "webgl") measureRequested = true;
  }
  if (rescanRequested) rescanRegistry("mutation");
  else if (measureRequested) measureAll();
  if (refreshRequested) {
    refreshRequested = false;
    // Layout shifted (fonts, images, late content, a new page): reveal trigger positions are
    // stale. Without triggers there is nothing to refresh, and refresh() records and restores the
    // scroll, so its cached scroll is made true first (see syncScrollTriggerScroll).
    if (ScrollTrigger.getAll().length > 0) {
      syncScrollTriggerScroll();
      ScrollTrigger.refresh();
    }
  }

  const hovered = updateSurfaces();
  packSurfaces();
  const hoveredSlot = hovered ? hovered.slot : -1;
  glassFrame.hovered = hoveredSlot;
  motion.pointer.surface = hoveredSlot;

  const pointer = motion.pointer;
  updateAnchors(pointer.inside && pointer.type !== "touch" && !pointerOverFixed);
}
