/*
 * The hero tagline's signed distance field (v3.4): "Infrastructure. Development. Security." gets the
 * electric border, so the composite needs its outline as it is RENDERED, the page's own text in the
 * page's own font, wherever the layout broke its lines (one line on a desktop, a phrase per line on
 * a phone). Nothing is assumed about either: the h1's text is rasterised into a canvas with each text
 * node's computed font (family, weight, size, letter-spacing, kerning), word by word at the place
 * the DOM laid each word out (its characters' Range rects, so line breaks, centring and any drift of
 * the canvas's advances against the page's are taken from the page), then the logos' exact EDT
 * (logo-field.ts slotFromRaster) makes the field, which goes into the logo atlas as one more slot.
 *
 * Rebuilt when what it was built from changes: the h1's laid-out size (a resize, the clamp()ed font
 * size), its text (a new element on a new page or language, or a change inside it: a
 * MutationObserver), or a font finishing loading (next/font swaps its fallback for IBM Plex Sans). A change is rebuilt once it has held for TAGLINE_FIELD.settleMs, in idle time. A
 * slot whose box has kept its proportions is drawn scaled meanwhile; otherwise (new line breaks, a
 * new language) none is drawn until the rebuild lands, rather than an outline in the wrong place.
 */

import type { AnchorRect } from "../../glass/contract";
import { TAGLINE_FIELD } from "./glass-config";
import { slotFromRaster, type LogoAtlas, type LogoSlot } from "./logo-field";

/** The tagline's slot in the atlas: no file, the page's own text. */
export const TAGLINE_SRC = "#hero-tagline";

/** A build waits for idle time this long at most: the tagline is in view on arrival. */
const IDLE_TIMEOUT_MS = 500;

/** Two characters are on one line when their boxes' tops differ by less than this share of their height. */
const SAME_LINE_SHARE = 0.5;

/** A laid-out box whose aspect ratio is off the built one's by more than this share has new line breaks (or text): not drawn until rebuilt. */
const ASPECT_TOLERANCE = 0.03;

/** The box's size in the layout key is rounded to this (CSS px): sub-pixel jitter is no reason to rebuild. */
const KEY_STEP_PX = 0.25;

/** One word as laid out: its text, its box's left edge and its line box (client px), and its font. */
interface Word {
  text: string;
  left: number;
  right: number;
  top: number;
  height: number;
  font: string;
  sizePx: number;
  letterSpacingPx: number;
  kerning: CanvasFontKerning;
}

/** What a build reads off the page. */
interface TextLayout {
  box: DOMRect;
  words: Word[];
  lineHeightPx: number;
}

/** A computed font as the canvas's font shorthand takes it, at sizePx. */
function fontOf(style: CSSStyleDeclaration, sizePx: number): string {
  return `${style.fontStyle} ${style.fontWeight} ${sizePx}px ${style.fontFamily}`;
}

function transformed(text: string, transform: string): string {
  if (transform === "uppercase") return text.toUpperCase();
  if (transform === "lowercase") return text.toLowerCase();
  return text;
}

/**
 * The element's words where the page laid them out: each visible character's Range rect, joined into
 * words while they stay on one line. Whitespace is never drawn; a character with no box (collapsed,
 * hidden) ends its word. Reads layout (one flush, then cached rects); for a few dozen characters.
 */
function readLayout(element: HTMLElement): TextLayout | null {
  const box = element.getBoundingClientRect();
  if (!(box.width > 0 && box.height > 0)) return null;
  const own = getComputedStyle(element);
  const ownSize = Number.parseFloat(own.fontSize);
  const lineHeightPx = Number.parseFloat(own.lineHeight) || 1.2 * ownSize;
  const words: Word[] = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement ?? element;
    const style = getComputedStyle(parent);
    if (style.visibility !== "visible") continue;
    const sizePx = Number.parseFloat(style.fontSize);
    if (!(sizePx > 0)) continue;
    const text = node.nodeValue ?? "";
    const font = fontOf(style, sizePx);
    // "normal" is 0 (parseFloat gives NaN).
    const letterSpacingPx = Number.parseFloat(style.letterSpacing) || 0;
    const kerning: CanvasFontKerning = style.fontKerning === "none" ? "none" : style.fontKerning === "normal" ? "normal" : "auto";
    let word: Word | null = null;
    for (let i = 0; i < text.length; ) {
      const code = text.codePointAt(i) ?? 0;
      const step = code > 0xffff ? 2 : 1;
      // Measured on the node's own text, drawn as the page draws it (a text-transform applies per character).
      const char = text.slice(i, i + step);
      if (/\s/.test(char)) {
        word = null;
        i += step;
        continue;
      }
      range.setStart(node, i);
      range.setEnd(node, i + step);
      i += step;
      const rect = range.getBoundingClientRect();
      if (!(rect.width > 0 && rect.height > 0)) {
        word = null;
        continue;
      }
      const drawn = transformed(char, style.textTransform);
      if (word && Math.abs(rect.top - word.top) < SAME_LINE_SHARE * rect.height && rect.left >= word.right - 0.5 * sizePx) {
        word.text += drawn;
        word.right = rect.right;
      } else {
        word = { text: drawn, left: rect.left, right: rect.right, top: rect.top, height: rect.height, font, sizePx, letterSpacingPx, kerning };
        words.push(word);
      }
    }
  }
  return words.length > 0 ? { box, words, lineHeightPx } : null;
}

/**
 * The words' silhouette over the h1's box plus pad, at scale raster px per CSS px. Each word is drawn
 * at its own place, its baseline where its line box puts the font's ascent (a Range rect spans the
 * font's ascent and descent, which measureText reports for the same font), so the canvas's own
 * advances only ever run within a word.
 */
function rasterizeText(layout: TextLayout, scale: number, pad: number): ImageData | null {
  const { box } = layout;
  const width = 2 * Math.max(Math.round(((box.width + 2 * pad) * scale) / 2), 2);
  const height = 2 * Math.max(Math.round(((box.height + 2 * pad) * scale) / 2), 2);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  const sx = width / (box.width + 2 * pad);
  const sy = height / (box.height + 2 * pad);
  context.fillStyle = "#fff";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  for (const word of layout.words) {
    context.font = word.font.replace(`${word.sizePx}px`, `${word.sizePx * sy}px`);
    context.fontKerning = word.kerning;
    context.letterSpacing = `${word.letterSpacingPx * sx}px`;
    const metrics = context.measureText(word.text);
    const ascent = metrics.fontBoundingBoxAscent;
    const descent = metrics.fontBoundingBoxDescent;
    const top = (word.top - box.top + pad) * sy;
    const lineBox = word.height * sy;
    const baseline = ascent + descent > 0 ? top + (lineBox * ascent) / (ascent + descent) : top + 0.8 * lineBox;
    context.fillText(word.text, (word.left - box.left + pad) * sx, baseline);
  }
  return context.getImageData(0, 0, width, height);
}

/** The tagline's slot from its element, as laid out now (null when it has no text to draw); exported for the verification harness. */
export function buildTagline(element: HTMLElement): { slot: LogoSlot; aspect: number } | null {
  const layout = readLayout(element);
  if (!layout) return null;
  const scale = 2 * TAGLINE_FIELD.texelsPerPx;
  const pad = TAGLINE_FIELD.padPx;
  const raster = rasterizeText(layout, scale, pad);
  if (!raster) return null;
  const { box } = layout;
  const unitsPerPx = 1 / Math.sqrt((raster.width / (box.width + 2 * pad)) * (raster.height / (box.height + 2 * pad)));
  const slot = slotFromRaster(raster, {
    src: TAGLINE_SRC,
    viewWidth: box.width,
    viewHeight: box.height,
    pad,
    designPxPerUnit: 1,
    sizeUnits: layout.lineHeightPx,
    solidAlpha: 1,
    unitsPerPx,
    // The composite traces the field alone: no bolt or spark rides the tagline (owner, 2026-11-02 evening).
    outline: null,
  });
  return { slot, aspect: box.width / box.height };
}

function whenIdle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(() => resolve(), { timeout: IDLE_TIMEOUT_MS });
    else setTimeout(resolve, 0);
  });
}

/** What a build is for: the box's size (KEY_STEP_PX steps), the fonts loaded and the text, as counters. */
interface LayoutKey {
  width: number;
  height: number;
  fonts: number;
  text: number;
}

function sameKey(a: LayoutKey, b: LayoutKey): boolean {
  return a.width === b.width && a.height === b.height && a.fonts === b.fonts && a.text === b.text;
}

/**
 * The tagline's field over the visit: which layout it was built for, when to build again, and
 * whether the slot it has fits the layout on screen. LogoEnergy asks once per composite; a frame
 * compares a few numbers (the text is watched by a MutationObserver, not read per frame).
 */
export class TaglineField {
  private built: { slot: LogoSlot; key: LayoutKey; aspect: number } | null = null;
  /** The layout seen last frame and since when it has held (performance.now()). */
  private readonly key: LayoutKey = { width: Number.NaN, height: Number.NaN, fonts: -1, text: -1 };
  private keySince = 0;
  /** A layout whose build failed (no text, no 2D canvas): not tried again until it changes. */
  private failed: LayoutKey | null = null;
  private building = false;
  /** Bumped when a font finishes loading: the same text may have new glyphs. */
  private fonts = 0;
  private watchingFonts = false;
  /** Bumped when the text changes (a new element: a new page or language; a mutation inside it). */
  private text = 0;
  private element: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  private disposed = false;

  /**
   * One composite's look: the slot to draw over rect (the tagline's laid-out box this tick) or null
   * (no tagline, not built yet, or a layout the slot no longer fits).
   */
  update(element: HTMLElement | null, rect: AnchorRect | null, nowMs: number, atlas: LogoAtlas): LogoSlot | null {
    if (!element || !rect || this.disposed) return null;
    this.watchFonts();
    if (element !== this.element) this.watchText(element);
    const key = this.key;
    const width = Math.round(rect.width / KEY_STEP_PX) * KEY_STEP_PX;
    const height = Math.round(rect.height / KEY_STEP_PX) * KEY_STEP_PX;
    if (width !== key.width || height !== key.height || this.fonts !== key.fonts || this.text !== key.text) {
      key.width = width;
      key.height = height;
      key.fonts = this.fonts;
      key.text = this.text;
      this.keySince = nowMs;
    }
    const built = this.built;
    const due = !built || !sameKey(built.key, key);
    if (due && !this.building && !(this.failed && sameKey(this.failed, key)) && nowMs - this.keySince >= TAGLINE_FIELD.settleMs) {
      void this.build(element, { ...key }, atlas);
    }
    // The slot it has, while it still fits: the same text, and a box of the same proportions (drawn scaled).
    if (!built || built.key.text !== key.text) return null;
    const aspect = rect.width / Math.max(rect.height, 1e-3);
    if (Math.abs(aspect / built.aspect - 1) > ASPECT_TOLERANCE) return null;
    return atlas.slot(TAGLINE_SRC) === built.slot ? built.slot : null;
  }

  private watchFonts(): void {
    if (this.watchingFonts || typeof document === "undefined" || !document.fonts) return;
    this.watchingFonts = true;
    document.fonts.addEventListener("loadingdone", () => {
      this.fonts++;
    });
  }

  /** A new element (a new page, a new language): its text is new, and any change inside it from now on bumps it again. */
  private watchText(element: HTMLElement): void {
    this.observer?.disconnect();
    this.element = element;
    this.text++;
    if (typeof MutationObserver === "undefined") return;
    this.observer = new MutationObserver(() => {
      this.text++;
    });
    this.observer.observe(element, { characterData: true, childList: true, subtree: true });
  }

  private async build(element: HTMLElement, key: LayoutKey, atlas: LogoAtlas): Promise<void> {
    this.building = true;
    try {
      // The webfont first, if the face is still loading (it usually is not by now): a build with
      // the fallback would be rebuilt the moment it lands anyway.
      const style = getComputedStyle(element);
      const font = fontOf(style, Number.parseFloat(style.fontSize) || 16);
      if (document.fonts && !document.fonts.check(font)) await document.fonts.load(font).catch(() => []);
      await whenIdle();
      if (this.disposed || !element.isConnected) return;
      const made = buildTagline(element);
      if (!made) {
        this.failed = key;
        return;
      }
      atlas.put(TAGLINE_SRC, made.slot);
      this.built = { slot: made.slot, key, aspect: made.aspect };
    } catch (error: unknown) {
      this.failed = key;
      console.warn("[scene] The hero tagline's outline and electric border are off (its CSS outline stays):", error);
    } finally {
      this.building = false;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.observer?.disconnect();
    this.observer = null;
    this.built = null;
  }
}
