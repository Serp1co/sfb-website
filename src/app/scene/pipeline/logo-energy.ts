/*
 * The electric logos' charge (v3.3, brief A; v3.4). Which logo the pointer is over, from geometry:
 * inside the logo's box and near its silhouette, read off its distance field (the DOM's own hover
 * would fire anywhere in the image's box, and over the hero's whole lockup). How charged each logo
 * is: a charge that builds under the pointer and discharges after it, a burst a click or a tap
 * fires (touch has no hover; on the hero it is the thunder, v3.4, with no flash and no charge of
 * its own: owner, 2026-11-02 evening), the bigger discharges a full charge throws now and then.
 * Since v3.4 the hero's border is on at rest (its rest level is its
 * fade-in) and the hero tagline is a record of its own (its field from the page's text,
 * tagline-field.ts): its white outline at rest, the electric border on it while the pointer
 * is over its glyphs.
 * And when the hero logo and the tagline have finished their CSS rise (their data-rise hook,
 * components/rise-flag.ts), so their outlines fade in where they come to rest.
 *
 * The composite draws the outline light from this, the overlay (logo-arcs.ts) the bolts, sparks
 * and the thunder, and the world reads motion.charge (the store's contract: hero, tagline, marks by
 * logo-mark index, burstAt), written here every composite. Updated once per composite, in the frame
 * and in the reduced-motion still alike; nothing here allocates per frame.
 */

import { ANCHORS, anchorRects, type AnchorRect } from "../../glass/contract";
import { MAX_MARKS, motion, queueImpulse } from "../../motion/store";
import { LOGO_BORDER, LOGO_CHARGE, LOGO_FIELD, LOGO_SLOTS } from "./glass-config";
import { LogoAtlas, slotDistance, type LogoSlot } from "./logo-field";
import { TaglineField } from "./tagline-field";

/** The composite's logo slots (glass-config.ts): the hero, the tagline, then the two mark records. */
export { LOGO_SLOTS };

/** A logo record that holds no logo. */
export const LOGO_NONE = -2;

/** The hero's record index. */
export const LOGO_HERO = -1;

/** The tagline's record index. */
export const LOGO_TAGLINE = -3;

/** A frame's step never exceeds this: a background tab or a long frame must not jump a charge. */
const MAX_STEP_S = 0.1;

/** The hero logo's and tagline's rise-end hook (components/rise-flag.ts, RISE_DONE): data-rise says this once the CSS rise has ended. */
const RISE_DONE = "done";

/**
 * Markup without that hook falls back to watching the rise here, once this long has passed since
 * no entrance animation was left on the element: longer than the rise itself (0.9 s, the tagline's
 * 0.1 s stagger after it), so wherever the hook exists it has always spoken first.
 */
const RISE_HOOK_GRACE_MS = 1500;

/**
 * No composite runs any more (the direct fallback, a halted or disposed pipeline): every charge the
 * world reads goes dark, so no node flare or orb feed sticks at its last value. burstAt stays (a
 * time, not a level).
 */
export function resetCharge(): void {
  const charge = motion.charge;
  charge.hero = 0;
  charge.tagline = 0;
  charge.marks.fill(0);
}

/** One logo as charged this frame. */
export interface ChargedLogo {
  /** LOGO_HERO, LOGO_TAGLINE, a mark's index (DOM order), or LOGO_NONE: nothing. */
  index: number;
  /** Its field, once in the atlas. */
  slot: LogoSlot | null;
  /** Its viewBox's box on screen this frame (CSS px), and CSS px per viewBox unit. */
  x: number;
  y: number;
  width: number;
  height: number;
  unitPx: number;
  /** The size its bolts are scaled to (CSS px): a logo's height; the tagline's line height, which scales its crackle (it has no bolts). */
  sizePx: number;
  /** The pointer is over it this frame. */
  hovered: boolean;
  /** 0..1, linear in time (LOGO_CHARGE.buildS up, decayS down; the tagline's own times). */
  charge: number;
  /** The light it gives: the charge squared (eased in). */
  light: number;
  /** A burst's share left, 1 at the click or tap, 0 after LOGO_CHARGE.burstS (the hero's thunder: thunderS); and when it fired. */
  burst: number;
  burstAt: number;
  /** The last bigger discharge (performance.now()), 0 = none; the next one is due at nextBigAt (0 = not armed). */
  bigAt: number;
  nextBigAt: number;
  /** The bloom pulse of a mark's burst or a bigger discharge, 0..1 (always 0 without motion; the hero's thunder has none). */
  flash: number;
  /** The fade-in once drawable and risen (0..1, the hero and the tagline); a mark's is 1. */
  fade: number;
  /** The border it shows at rest, 0..1: the hero's is its fade; the tagline (its outline is its backing) and a mark have none. */
  rest: number;
  /** A mark's circuit node behind it (its logo cell's centre), CSS px; NaN without one. */
  nodeX: number;
  nodeY: number;
}

function blankLogo(index: number): ChargedLogo {
  return {
    index,
    slot: null,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    unitPx: 1,
    sizePx: 0,
    hovered: false,
    charge: 0,
    light: 0,
    burst: 0,
    burstAt: 0,
    bigAt: 0,
    nextBigAt: 0,
    flash: 0,
    fade: 0,
    rest: 0,
    nodeX: Number.NaN,
    nodeY: Number.NaN,
  };
}

function resetLogo(logo: ChargedLogo, index: number): ChargedLogo {
  Object.assign(logo, blankLogo(index));
  return logo;
}

function finiteRect(rect: AnchorRect): boolean {
  return Number.isFinite(rect.x) && Number.isFinite(rect.y) && rect.width > 0 && rect.height > 0;
}

function between(range: readonly [number, number]): number {
  return range[0] + Math.random() * (range[1] - range[0]);
}

/** Places a logo's viewBox in rect as the browser draws it (object-fit: contain, centred): its box and px per unit. */
function placeIn(logo: ChargedLogo, slot: LogoSlot, rect: AnchorRect): void {
  const unitPx = Math.min(rect.width / slot.viewWidth, rect.height / slot.viewHeight);
  logo.unitPx = unitPx;
  logo.width = slot.viewWidth * unitPx;
  logo.height = slot.viewHeight * unitPx;
  logo.x = rect.x + (rect.width - logo.width) / 2;
  logo.y = rect.y + (rect.height - logo.height) / 2;
  logo.sizePx = slot.sizeUnits * unitPx;
}

/** The signed distance (CSS px) from a client point to a placed logo's silhouette. */
export function logoDistancePx(logo: ChargedLogo, x: number, y: number): number {
  if (!logo.slot) return Number.POSITIVE_INFINITY;
  return slotDistance(logo.slot, (x - logo.x) / logo.unitPx, (y - logo.y) / logo.unitPx) * logo.unitPx;
}

/** A client point within reach px of a placed logo's silhouette (box test first: it is cheaper). */
function near(logo: ChargedLogo, x: number, y: number, reach: number): boolean {
  if (x < logo.x - reach || x > logo.x + logo.width + reach || y < logo.y - reach || y > logo.y + logo.height + reach) return false;
  return logoDistancePx(logo, x, y) <= reach;
}

/** The image an anchor names: the element itself, or the first image inside it. */
function imageSource(element: Element): string {
  const image = element instanceof HTMLImageElement ? element : element.querySelector("img");
  return image?.getAttribute("src") ?? "";
}

/**
 * CSS entrance animations (finite, unfinished) moving an element or any of its ancestors: the
 * hero's `rise`, replayed on a fresh hero after a client navigation. Transitions are not entrances.
 */
function entrances(element: Element): Animation[] {
  if (typeof document.getAnimations !== "function" || typeof CSSAnimation === "undefined") return [];
  const moving: Animation[] = [];
  for (const animation of document.getAnimations()) {
    if (!(animation instanceof CSSAnimation)) continue;
    if (animation.playState === "finished" || animation.playState === "idle") continue;
    const effect = animation.effect;
    if (!(effect instanceof KeyframeEffect) || !effect.target) continue;
    if (!Number.isFinite(effect.getTiming().iterations ?? 1)) continue;
    if (effect.target === element || effect.target.contains(element)) moving.push(animation);
  }
  return moving;
}

/**
 * One anchored element's CSS rise: done when its data-rise hook says so (read every frame: an
 * attribute read, no style flush), else once its own entrance animations (on it or an ancestor,
 * checked once per page: getAnimations flushes style, then followed by their finished promises)
 * have ended graceMs ago (so that wherever the hook exists it always speaks first).
 */
class RiseWatch {
  /** The page's element (re-found per page, or when it left the document). */
  element: Element | null = null;
  private storyAt = Number.NaN;
  /** performance.now() when no entrance animation was left on it; 0 = still rising. */
  private doneAt = 0;
  private token = 0;
  private readonly anchor: string;
  private readonly graceMs: number;

  constructor(anchor: string, graceMs: number) {
    this.anchor = anchor;
    this.graceMs = graceMs;
  }

  /** present false forgets the page's element. */
  risen(present: boolean, nowMs: number): boolean {
    if (!present) {
      this.element = null;
      return false;
    }
    const changedAt = motion.story.changedAt;
    if (!this.element?.isConnected || this.storyAt !== changedAt) {
      this.storyAt = changedAt;
      this.element = typeof document === "undefined" ? null : document.querySelector(`[data-anchor~="${this.anchor}"]`);
      const moving = this.element ? entrances(this.element) : [];
      const token = ++this.token;
      this.doneAt = moving.length === 0 ? nowMs : 0;
      if (moving.length > 0) {
        void Promise.allSettled(moving.map((animation) => animation.finished)).then(() => {
          if (token === this.token) this.doneAt = performance.now();
        });
      }
    }
    if (this.element?.getAttribute("data-rise") === RISE_DONE) return true;
    return this.doneAt > 0 && nowMs - this.doneAt >= this.graceMs;
  }
}

/** Which charge rules a record follows. */
type ChargeKind = "hero" | "tagline" | "mark";

/**
 * The logos' charge, per composite. Owns the atlas (the fields) and the tagline's field, reads the
 * anchors the registry refreshed this tick, and the pointer and press impulses of this tick.
 */
export class LogoEnergy {
  readonly atlas = new LogoAtlas();
  readonly hero: ChargedLogo = blankLogo(LOGO_HERO);
  readonly tagline: ChargedLogo = blankLogo(LOGO_TAGLINE);
  /** The mark charging now (marks[0]) and the one the pointer left for it, still discharging (marks[1]). */
  readonly marks: [ChargedLogo, ChargedLogo] = [blankLogo(LOGO_NONE), blankLogo(LOGO_NONE)];
  private readonly taglineField = new TaglineField();
  /** Each mark's image, by index (DOM order), read once a page shows its marks. */
  private markSources: string[] = [];
  /** The page (story.changedAt) and mark count the sources were read for, and whether the hero was asked for. */
  private sourcesAt = Number.NaN;
  private sourcesCount = -1;
  private requested = "";
  private lastMs = 0;
  /** performance.now() since the hero (the tagline) has been drawable (built, on the page, risen); 0 = not. */
  private heroSince = 0;
  private taglineSince = 0;
  private readonly heroRise = new RiseWatch(ANCHORS.heroLogo, RISE_HOOK_GRACE_MS);
  private readonly taglineRise = new RiseWatch(ANCHORS.heroTagline, RISE_HOOK_GRACE_MS);
  /** Scratch record for the hover test (no allocation per frame). */
  private readonly probe: ChargedLogo = blankLogo(LOGO_NONE);

  /**
   * The composite draws the hero's outline and border: its field is built, the page has it and it
   * has finished rising. The canvas hands the logo's legibility over on this (html[data-logo-energy]).
   */
  get heroActive(): boolean {
    return this.heroSince > 0;
  }

  /**
   * The composite draws the tagline's outline: its field fits its layout, it is on the page and has
   * risen. The canvas hands the tagline's CSS outline over on this (html[data-tagline-energy]).
   */
  get taglineActive(): boolean {
    return this.taglineSince > 0;
  }

  /**
   * One composite's update. arcs: motion is allowed (not paused, no reduced motion): bursts and
   * bigger discharges happen. snap: reduced motion, every charge jumps (a static glow on hover).
   */
  update(nowMs: number, arcs: boolean, snap: boolean): void {
    const dt = this.lastMs > 0 ? Math.min(Math.max((nowMs - this.lastMs) / 1000, 0), MAX_STEP_S) : 0;
    this.lastMs = nowMs;
    const heroRect = this.firstRect(ANCHORS.heroLogo);
    const markRects = anchorRects.get(ANCHORS.logoMark);
    // Asked for once per page (the atlas keeps every logo it has built for the visit).
    if (this.readSources(markRects) || (heroRect !== null) !== (this.requested === "hero")) {
      this.requested = heroRect ? "hero" : "";
      const sources: string[] = heroRect ? [LOGO_FIELD.src] : [];
      for (const src of this.markSources) if (src) sources.push(src);
      if (sources.length > 0) this.atlas.request(sources);
    }

    // The hero: drawable once built, on the page and risen; its outline and border fade in then.
    const hero = this.hero;
    hero.slot = heroRect ? this.atlas.slot(LOGO_FIELD.src) : null;
    const heroDrawable = heroRect !== null && hero.slot !== null && this.heroRise.risen(true, nowMs);
    if (!heroRect) this.heroRise.risen(false, nowMs);
    this.heroSince = heroDrawable ? this.heroSince || nowMs : 0;
    this.placeBrand(hero, heroDrawable ? heroRect : null, this.heroSince, nowMs);

    // The tagline: drawable once its field fits its layout and it has risen.
    const taglineRect = this.firstRect(ANCHORS.heroTagline);
    const taglineHere = taglineRect !== null && this.taglineRise.risen(true, nowMs);
    if (!taglineRect) this.taglineRise.risen(false, nowMs);
    const taglineElement = this.taglineRise.element instanceof HTMLElement ? this.taglineRise.element : null;
    const tagline = this.tagline;
    tagline.slot = taglineRect ? this.taglineField.update(taglineElement, taglineRect, nowMs, this.atlas) : null;
    const taglineDrawable = taglineHere && tagline.slot !== null;
    this.taglineSince = taglineDrawable ? this.taglineSince || nowMs : 0;
    this.placeBrand(tagline, taglineDrawable ? taglineRect : null, this.taglineSince, nowMs);

    // The marks in play: each placed in its rect, its node at its cell's centre.
    const cells = anchorRects.get(ANCHORS.logo);
    for (const mark of this.marks) this.placeMark(mark, markRects, cells);

    // The pointer (a mouse, pen or trackpad: a finger never hovers) and this tick's presses.
    const pointer = motion.pointer;
    const hoverable = pointer.inside && pointer.type !== "touch" && Number.isFinite(pointer.x) && pointer.x > -9000;
    hero.hovered = hoverable && hero.fade > 0 && near(hero, pointer.x, pointer.y, LOGO_CHARGE.heroHoverPx);
    tagline.hovered = hoverable && !hero.hovered && tagline.fade > 0 && near(tagline, pointer.x, pointer.y, LOGO_CHARGE.taglineHoverPx);
    const hoveredMark = hoverable && !hero.hovered && !tagline.hovered ? this.markAt(markRects, pointer.x, pointer.y, true) : -1;
    let pressedMark = -1;
    if (arcs) {
      for (const impulse of motion.impulses) {
        if (impulse.kind !== "press" || !impulse.onScene) continue;
        if (hero.fade > 0 && near(hero, impulse.x, impulse.y, LOGO_CHARGE.heroHoverPx)) {
          // The thunder (logo-arcs.ts draws it from burstAt), and a ripple ring in the orb behind it
          // (in css mode the open water rings; the orb splashes on the press itself).
          this.burst(hero, nowMs, false);
          const orb = motion.orb;
          queueImpulse({
            kind: "drop",
            x: orb.visible ? orb.x : hero.x + hero.width / 2,
            y: orb.visible ? orb.y : hero.y + hero.height / 2,
            strength: LOGO_CHARGE.burstDrop,
            onGlass: false,
            onScene: false,
            time: nowMs,
          });
        } else {
          const index = this.markAt(markRects, impulse.x, impulse.y, false);
          if (index >= 0) pressedMark = index;
        }
      }
    }

    // One mark charges at a time: the one under the pointer (or pressed) takes the first record,
    // and the one it took over from keeps discharging in the second.
    const wanted = pressedMark >= 0 ? pressedMark : hoveredMark;
    if (wanted >= 0 && this.marks[0].index !== wanted) {
      const current = this.marks[0];
      const previous = this.marks[1];
      if (previous.index === wanted) {
        this.marks[0] = previous;
        this.marks[1] = current;
      } else {
        this.marks[1] = current;
        this.marks[0] = resetLogo(previous, wanted);
      }
      this.placeMark(this.marks[0], markRects, cells);
    }
    if (pressedMark >= 0) this.burst(this.marks[0], nowMs, true);

    this.step(hero, hero.hovered, dt, nowMs, arcs, snap, "hero");
    this.step(tagline, tagline.hovered, dt, nowMs, arcs, snap, "tagline");
    for (const mark of this.marks) {
      mark.hovered = mark.index >= 0 && mark.index === hoveredMark;
      this.step(mark, mark.hovered, dt, nowMs, arcs, snap, "mark");
      // Gone dark (or its mark left the page): the record is free again.
      if (mark.index >= 0 && ((mark.light === 0 && mark.flash === 0 && !mark.hovered) || !mark.slot)) resetLogo(mark, LOGO_NONE);
    }
    this.publish();
  }

  /**
   * motion.charge for the world (the store's contract): the partner nodes flare with marks[i], the
   * orb behind the hero brightens with hero and is kicked on burstAt (it replaces v3.3's logoCharge).
   */
  private publish(): void {
    const hero = this.hero;
    const charge = motion.charge;
    // The pointer's charge only: the thunder lights nothing in the world (owner, 2026-11-02 evening:
    // no flash); it reaches the orb through burstAt, as a kick and a ripple, never as light.
    charge.hero = hero.light;
    charge.tagline = this.tagline.light;
    charge.marks.fill(0);
    for (const mark of this.marks) {
      if (mark.index >= 0 && mark.index < MAX_MARKS) charge.marks[mark.index] = Math.max(charge.marks[mark.index], mark.light);
    }
    if (hero.burstAt > 0) charge.burstAt = hero.burstAt;
  }

  /** The hero or the tagline on its rect this frame (null: not drawable), fading in since `since`. */
  private placeBrand(logo: ChargedLogo, rect: AnchorRect | null, since: number, nowMs: number): void {
    if (!rect || !logo.slot || since === 0) {
      logo.fade = 0;
      logo.rest = 0;
      return;
    }
    placeIn(logo, logo.slot, rect);
    const t = Math.min(Math.max((nowMs - since) / (LOGO_BORDER.fadeInS * 1000), 0), 1);
    logo.fade = 1 - (1 - t) ** 3;
    // The hero's border is on at rest; the tagline's rest is its outline alone (the composite's backing).
    logo.rest = logo === this.hero ? logo.fade : 0;
  }

  /**
   * A click or a tap. charges: a mark's burst charges it full, its glow blooming as the burst goes.
   * The hero's (the thunder: the overlay's bolts and sparks, the orb's ripple and kick) leaves its
   * charge as the pointer made it, so a tap on touch neither swells its glow nor lights the orb
   * behind it (owner, 2026-11-02 evening: no flash, nothing that lights a broad area).
   */
  private burst(logo: ChargedLogo, nowMs: number, charges: boolean): void {
    if (charges) logo.charge = 1;
    logo.burst = 1;
    logo.burstAt = nowMs;
  }

  /** Charge, burst, bigger discharges and flash for one frame. */
  private step(logo: ChargedLogo, target: boolean, dt: number, nowMs: number, arcs: boolean, snap: boolean, kind: ChargeKind): void {
    if (logo.index === LOGO_NONE) return;
    const buildS = kind === "tagline" ? LOGO_CHARGE.taglineBuildS : LOGO_CHARGE.buildS;
    const decayS = kind === "tagline" ? LOGO_CHARGE.taglineDecayS : LOGO_CHARGE.decayS;
    if (snap) logo.charge = target ? 1 : 0;
    else logo.charge = Math.min(Math.max(logo.charge + (target ? dt / buildS : -dt / decayS), 0), 1);
    logo.burst = arcs ? Math.max(logo.burst - dt / (kind === "hero" ? LOGO_CHARGE.thunderS : LOGO_CHARGE.burstS), 0) : 0;
    logo.light = logo.charge * logo.charge;
    // A full charge throws a bigger discharge now and then (a thick bolt, a flash): armed once the light is up.
    if (arcs && kind !== "tagline" && logo.light >= LOGO_CHARGE.bigFrom) {
      if (logo.nextBigAt === 0) logo.nextBigAt = nowMs + between(LOGO_CHARGE.bigEveryS) * 1000;
      else if (nowMs >= logo.nextBigAt) {
        logo.bigAt = nowMs;
        logo.nextBigAt = nowMs + between(LOGO_CHARGE.bigEveryS) * 1000;
      }
    } else {
      logo.nextBigAt = 0;
    }
    const big = arcs && logo.bigAt > 0 ? Math.max(1 - (nowMs - logo.bigAt) / (LOGO_CHARGE.bigFlashS * 1000), 0) : 0;
    // A mark's burst blooms its glow as it goes. The hero's thunder has no flash (owner, 2026-11-02
    // evening): only its bigger discharges bloom it, where their bolts land.
    const pulse = kind === "mark" ? logo.burst : 0;
    logo.flash = arcs ? Math.max(pulse * pulse, big * big) : 0;
  }

  /** The first laid-out rect of an anchor name, or null. */
  private firstRect(name: string): AnchorRect | null {
    const list = anchorRects.get(name);
    if (list) for (const rect of list) if (finiteRect(rect)) return rect;
    return null;
  }

  /**
   * The marks' images, read from the DOM once a page shows them (the registry lists them in the
   * same order). True when they were read again (a new page, or a new count).
   */
  private readSources(markRects: AnchorRect[] | undefined): boolean {
    const count = markRects?.length ?? 0;
    const changedAt = motion.story.changedAt;
    if ((changedAt === this.sourcesAt && count === this.sourcesCount) || typeof document === "undefined") return false;
    this.sourcesAt = changedAt;
    this.sourcesCount = count;
    this.markSources = [];
    if (count > 0) {
      for (const element of document.querySelectorAll(`[data-anchor~="${ANCHORS.logoMark}"]`)) this.markSources.push(imageSource(element));
    }
    return true;
  }

  /** Places a mark record on its rect this frame (its slot, box and node); a mark gone from the page loses its slot. */
  private placeMark(mark: ChargedLogo, markRects: AnchorRect[] | undefined, cells: AnchorRect[] | undefined): void {
    if (mark.index < 0) return;
    const rect = markRects?.[mark.index];
    const src = this.markSources[mark.index];
    mark.slot = rect && src && finiteRect(rect) ? this.atlas.slot(src) : null;
    if (!rect || !mark.slot) return;
    placeIn(mark, mark.slot, rect);
    mark.fade = 1;
    const cell = cells?.[mark.index];
    mark.nodeX = cell && finiteRect(cell) ? cell.x + cell.width / 2 : Number.NaN;
    mark.nodeY = cell && finiteRect(cell) ? cell.y + cell.height / 2 : Number.NaN;
  }

  /**
   * The mark at a client point: inside its rect and, for hover, within markHoverPx of its
   * silhouette (a press only needs the rect: a tap is never that precise). -1 if none.
   */
  private markAt(markRects: AnchorRect[] | undefined, x: number, y: number, hover: boolean): number {
    if (!markRects) return -1;
    for (let i = 0; i < markRects.length; i++) {
      const rect = markRects[i];
      if (!rect.visible || !finiteRect(rect)) continue;
      if (x < rect.x || x >= rect.x + rect.width || y < rect.y || y >= rect.y + rect.height) continue;
      if (!hover) return this.markSources[i] && this.atlas.slot(this.markSources[i]) ? i : -1;
      const slot = this.markSources[i] ? this.atlas.slot(this.markSources[i]) : null;
      if (!slot) continue;
      const probe = this.probe;
      probe.index = i;
      probe.slot = slot;
      placeIn(probe, slot, rect);
      if (logoDistancePx(probe, x, y) <= LOGO_CHARGE.markHoverPx) return i;
    }
    return -1;
  }

  dispose(): void {
    this.taglineField.dispose();
    this.atlas.dispose();
    resetCharge();
  }
}
