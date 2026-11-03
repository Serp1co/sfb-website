/*
 * The CSS narrow-screen dim (components.css `.scene::after`, rgba(0, 0, 0, 0.4) below 1024 px) as
 * the composite sees it: the share of the canvas the overlay lets through right now, 1 when it is
 * not drawn.
 *
 * Choreography v3.1: under the CSS glass the composite owns that dim while the scene runs, as it
 * does under the WebGL glass. The stylesheet hides the overlay, and the composite dims the scene
 * itself, so the energy light (the outer glow, the arcs) goes on top at full strength instead of
 * being scaled to 60 % with the scene. Which states hand the dim over is the stylesheet's call: it
 * keeps the overlay before the scene shows, after a renderer failure, and in whatever state it
 * chooses. So the pipeline does not copy the selector. It reads the overlay's computed style and
 * draws the share of the dim the overlay leaves undrawn: never both, never neither.
 *
 * A read is one computed style, with no layout. It runs on the first frame, after any attribute
 * change on <html> or inside the scene wrapper (data-engine, data-motion, data-scene, data-reveal,
 * data-still), and when the dim's media query flips. It then keeps reading for FOLLOW_FRAMES, in
 * case the change runs as a transition, and polls once every POLL_FRAMES for anything else a
 * selector might depend on. Between reads the share is cached, so a frame allocates nothing.
 */

import { BACKGROUND } from "./glass-config";

/** The overlay's media query, as the CSS matches it: the canvas width can sit under BACKGROUND.narrowWidth where the media width does not (a classic scrollbar). */
export const NARROW_DIM_MEDIA = `(max-width: ${BACKGROUND.narrowWidth - 1}px)`;

/** The wrapper that carries the overlay as its ::after (motion/experience-root). */
const SCENE_SELECTOR = ".scene";

/** After a change, read every frame for this long (about 0.75 s), so an overlay fading in or out is followed rather than sampled once. */
const FOLLOW_FRAMES = 45;

/** Without any change seen, read again after this many frames (about 1 s): a selector may depend on a media feature nothing here watches. */
const POLL_FRAMES = 60;

/** The light's pre-compensation is capped at 1 / this: an overlay darker than that hides the canvas anyway, and the gain stays finite. */
const MIN_PASS = 0.1;

/** The computed properties the share depends on. */
type OverlayStyle = Pick<CSSStyleDeclaration, "content" | "display" | "visibility" | "opacity" | "backgroundColor">;

/** Alpha of a computed CSS colour ("rgb(0, 0, 0)", "rgba(0, 0, 0, 0.4)", "rgb(0 0 0 / 40%)", "transparent"), or NaN when it is in another form. */
export function colorAlpha(value: string): number {
  const text = value.trim();
  if (text === "transparent") return 0;
  const match = /^rgba?\(([^)]*)\)$/.exec(text);
  if (!match) return Number.NaN;
  const parts = match[1].split(/[\s,/]+/).filter((part) => part.length > 0);
  if (parts.length === 3) return 1;
  if (parts.length !== 4) return Number.NaN;
  const raw = parts[3];
  const alpha = raw.endsWith("%") ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw);
  return Number.isFinite(alpha) ? Math.min(Math.max(alpha, 0), 1) : Number.NaN;
}

/**
 * Share of the canvas a black overlay with this computed style lets through: 1 when it is not drawn
 * (no generated content, display none, hidden), else 1 - its alpha x opacity. `fallback` when the
 * colour cannot be read: the overlay is drawn, but how dark it is is unknown.
 */
export function overlayPass(style: OverlayStyle, fallback: number): number {
  const content = style.content;
  if (content === "none" || content === "normal" || style.display === "none" || style.visibility !== "visible") return 1;
  const alpha = colorAlpha(style.backgroundColor);
  if (!Number.isFinite(alpha)) return fallback;
  const opacity = Number.parseFloat(style.opacity);
  return 1 - alpha * (Number.isFinite(opacity) ? Math.min(Math.max(opacity, 0), 1) : 1);
}

export class CssDimProbe {
  private readonly canvas: HTMLCanvasElement;
  private readonly media: MediaQueryList | null;
  private scene: Element | null = null;
  /** The overlay's computed style: a live object, so a read sees the current cascade. */
  private style: OverlayStyle | null = null;
  private observer: MutationObserver | null = null;
  private follow = FOLLOW_FRAMES;
  private sinceRead = 0;
  private share = 1;
  private readonly onChange = (): void => {
    this.follow = FOLLOW_FRAMES;
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.media = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(NARROW_DIM_MEDIA) : null;
    this.media?.addEventListener("change", this.onChange);
  }

  /** The overlay's media query matches: the narrow screens the dim is for (the browser keeps this current). */
  get narrow(): boolean {
    return this.media?.matches ?? false;
  }

  /** Share of the canvas the CSS overlay lets through this frame, MIN_PASS..1. */
  pass(): number {
    if (this.follow > 0) this.follow--;
    else if (++this.sinceRead < POLL_FRAMES) return this.share;
    this.sinceRead = 0;
    this.share = Math.max(this.read(), MIN_PASS);
    return this.share;
  }

  private read(): number {
    // Unreadable: assume the overlay draws exactly where its media query says (the v3 behaviour).
    const fallback = this.narrow ? BACKGROUND.cssDimPass : 1;
    const style = this.attach();
    return style ? overlayPass(style, fallback) : fallback;
  }

  /** Finds the wrapper (again, if React replaced it) and watches what its overlay's selector can hang on. */
  private attach(): OverlayStyle | null {
    if (this.scene?.isConnected) return this.style;
    this.observer?.disconnect();
    this.observer = null;
    this.scene = this.canvas.closest(SCENE_SELECTOR);
    this.style = null;
    if (!this.scene) return null;
    this.style = getComputedStyle(this.scene, "::after");
    if (typeof MutationObserver === "function") {
      this.observer = new MutationObserver(this.onChange);
      this.observer.observe(document.documentElement, { attributes: true });
      this.observer.observe(this.scene, { attributes: true, subtree: true });
    }
    return this.style;
  }

  dispose(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.media?.removeEventListener("change", this.onChange);
    this.scene = null;
    this.style = null;
  }
}
