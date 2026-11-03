/* ------------------------------------------------------------------ */
/*  The DOM -> WebGL glass bridge: the contract between the markup     */
/*  (data attributes), the registry that measures it (glass/registry)  */
/*  and the composite shader that draws it (scene/pipeline).           */
/*                                                                     */
/*  Markup vocabulary (server components only add attributes):         */
/*    data-glass="panel|card|band|pill|button"   a liquid-glass surface */
/*    data-glass-tint="blue|amber|silver"        optional tint          */
/*    data-glass-window                          inside a surface: a    */
/*                       clear window onto the scene (no text in it)    */
/*    data-anchor="<name> [<name>...]"           an element the scene   */
/*                       projects into 3D; several names (space-        */
/*                       separated) make one element several anchors    */
/*    data-energized="true"   set by the registry, never in markup:     */
/*                       a body of the orb is inside this cell (a panel */
/*                       or card carrying cell-about, service-card,     */
/*                       cell-contact, cell-practice or                 */
/*                       cell-practice-cta), or in this pill of the     */
/*                       practice-tech row (its own droplet, v3.1)      */
/*    data-story="<pose>"                        a section with a pose  */
/*    data-practice="<slug>"                     on <main>, practice pages */
/*    data-reveal="lines|block|items"            scroll reveal          */
/*    data-magnetic                              pulls toward the cursor */
/* ------------------------------------------------------------------ */

export const GLASS_KINDS = ["panel", "card", "band", "pill", "button"] as const;
export type GlassKind = (typeof GLASS_KINDS)[number];

export const GLASS_TINTS = ["none", "blue", "amber", "silver"] as const;
export type GlassTint = (typeof GLASS_TINTS)[number];

/** Most surfaces the composite draws in one frame (culled to the viewport first). */
export const MAX_SURFACES = 24;

/** Anchor names the scene reads. */
export const ANCHORS = {
  /** The image frame (the glass window) of each landing practice card: `practice-infrastructure` etc. */
  practice: (slug: string) => `practice-${slug}`,
  /** Every partner and customer logo cell. */
  logo: "logo",
  /**
   * The hero's row of three practice doors. Choreography v2 removed the doors from the hero (it holds
   * only the logo and the tagline now); kept while the scene still reads it as an optional fallback.
   */
  heroDoors: "hero-doors",
  /** A page's row of actions under its h1: the 404's two buttons (the landing hero has none since v2). */
  heroActions: "hero-actions",
  /** The practice page's title block, so the orb sits clear of it (also bare text: see `copy`). */
  practiceCopy: "practice-copy",
  /**
   * Bare text over the open scene: every section head below the hero, the contact section's GitHub
   * link, the 404's h1. Holds keep the
   * orb's projected disc clear of these rects, and the composite keeps the scene under them dark
   * enough for the text (guard rects), in every pose, transit and mode. Not the landing hero's
   * logo and tagline: they sit over the orb on purpose (see heroBrand).
   */
  copy: "copy",
  /** The About "Our approach" panel: the about hold parks the orb behind it. */
  aboutApproach: "about-approach",
  /** The first logo band (technology partners): the partners hold parks the small orb behind its centre. */
  partnersBand: "partners-band",
  /** The contact info-card row: the contact hold parks the orb behind its centre (Email) card. */
  contactRow: "contact-row",
  /**
   * The practice page's technology pill row (v3.1): each [data-glass="pill"] inside it holds a small
   * droplet body of its own (one of motion.bodies), which energizes that pill; the bodies flowing in
   * to become the droplets, or out of them again, light the share of each pill they cover.
   */
  practiceTech: "practice-tech",
  /**
   * Owner decision 2026-11-02: the orb's two slots around Partners. An invisible layout slot spanning
   * the empty gap above the "Partners and customers" heading (A), and one spanning the gap between the
   * customers band and the "Get in touch" heading (B). The orb locks into A while A is visible, glides
   * to B once A has left the view and B is visible, and holds B through Contact while B stays visible.
   */
  orbSlotPartners: "orb-slot-partners",
  orbSlotContact: "orb-slot-contact",
  /**
   * Owner decisions 2026-11-02 ("choreography v2"): the orb lives inside the panels.
   * orbSlotHero: the hero section's box; the big merged orb is centred in it.
   * heroBrand: the hero's logo + tagline, drawn OVER the orb (owner's choice): black letters with a
   *   white outline since v3.4, so it is NOT a guard rect (no dark plate) but the orb still
   *   knows where the brand sits.
   * aboutCell: both About panels (2 rects): the orb splits into two bodies, one inside each.
   * serviceCard: the three service cards (3 rects): their bodies sit in the windows and circuitry
   *   links the cards.
   * contactCell: the three contact cards (3 rects): the orb splits into three bodies, one inside each.
   */
  orbSlotHero: "orb-slot-hero",
  heroBrand: "hero-brand",
  aboutCell: "cell-about",
  serviceCard: "service-card",
  contactCell: "cell-contact",
  /**
   * Owner decision 2026-11-02 (v3): the practice pages behave like the home page. practiceCell: every
   * "What we deliver" feature card (7-9 rects): the orb splits into them, one body per card, and
   * circuitry links neighbouring cards. practiceCtaCell: the closing call-to-action panel (1 body).
   */
  practiceCell: "cell-practice",
  practiceCtaCell: "cell-practice-cta",
  /** The hero's logo image (v3.2): the composite traces its outline with the panels' electric border. */
  heroLogo: "hero-logo",
  /**
   * v3.3: every partner and customer logo image, in DOM order (the same order and count as `logo`, the
   * cells around them). The pointer over one charges it: outline crackle, arcs and sparks, its node flaring.
   * Over the image motion.pointer.anchor reports this name (the smaller rect wins over its cell's),
   * with the cell's index; a tap on touch arrives as a "press" impulse (onScene) at the tap.
   */
  logoMark: "logo-mark",
  /**
   * v3.4: the hero tagline ("Infrastructure. Development. Security."): black letters with the logo's
   * white outline at rest, the electric border on it on hover (the composite traces the
   * rendered text's outline; html[data-tagline-energy="on"] while it does, and data-rise="done" on
   * the h1 once its CSS rise has ended, as on heroLogo). On the h1 itself:
   * its rect is the h1's border box, to the sub-pixel like heroLogo, re-measured on every resize, font
   * load and new page (a language is a page of its own), so the text field rebuilds from it.
   */
  heroTagline: "hero-tagline",
} as const;

/**
 * Packed per-frame data for the composite shader, rebuilt every tick by the registry after
 * the scroll update and before the canvas renders. Only surfaces near the viewport are packed.
 * All lengths are CSS px in client (viewport) space, origin top-left; the pipeline converts with
 * its own canvas size and drawing buffer. Every value written is finite (NaN guarded to 0), and
 * unused slots are zero.
 */
export interface GlassFrame {
  /**
   * Surfaces packed this frame, 0..MAX_SURFACES, in BOTH glass modes (since 2026-11-02, so phones get
   * the panel energy too). In "webgl" mode the composite draws the full liquid glass; in "css" mode the
   * CSS frosted glass draws the panes and the composite only adds what lives outside them: the
   * energy glow and the border electricity just beyond each edge.
   */
  count: number;
  /** vec4 per surface: centre x, centre y, half width, half height. Bands extend past both viewport sides. */
  rects: Float32Array;
  /** vec4 per surface: corner radius, kind index (GLASS_KINDS), tint index (GLASS_TINTS), elevation 0..1. */
  shape: Float32Array;
  /**
   * vec4 per surface: appear 0..1 (0 = not yet condensed, 1 = settled), hover 0..1 (eased),
   * press 0..1 (jumps to 1 on press, decays), focus 0..1 (eased).
   * Hover is the pointer over the surface (a mouse, pen or trackpad), nothing else: a finger never
   * hovers, so under touch it stays 0 (as hovered stays -1).
   * Focus is keyboard :focus-visible inside the surface, and on touch screens (a coarse pointer or
   * no hover) also the touch focus: the reading, the energized surface on screen nearest the viewport
   * centre, kept until another is clearly nearer (v3.1: one channel for both, not hover). So
   * energy x max(hover, focus) is the cue for the border electricity on every device.
   */
  state: Float32Array;
  /**
   * vec4 per surface: its [data-glass-window] rect (centre x, centre y, half width, half height,
   * plus the window's own corner radius is the surface radius minus its inset; use 16 px), or all
   * zero when the surface has no window. Window pixels carry no text: clearer frost, no text ceiling.
   */
  windows: Float32Array;
  /**
   * vec4 per surface: energy 0..1 (eased; 1 while one of motion.bodies sits in the surface, the cue
   * for the electric-blue border glow and, with hover or focus, the border "electricity"), then the
   * centre x, centre y and radius (CSS px) of the body lighting it, or zeros. Owner decisions
   * 2026-11-02. Only two families are ever energized, everything else stays zeros (glass/energy.ts):
   * the cells (the aboutCell, serviceCard, contactCell, practiceCell and practiceCtaCell panels and
   * cards), lit by the share of a body's disc inside them; and the pills of the practiceTech row,
   * each lit by the droplet body inside it (v3.1), or by the share of the PILL a bigger body covers.
   */
  energy: Float32Array;
  /**
   * Packed index of the surface under the pointer, or -1 (same as motion.pointer.surface). The touch
   * focus (see state) is not a pointer: on touch screens this stays -1.
   */
  hovered: number;
}

export const glassFrame: GlassFrame = {
  count: 0,
  rects: new Float32Array(4 * MAX_SURFACES),
  shape: new Float32Array(4 * MAX_SURFACES),
  state: new Float32Array(4 * MAX_SURFACES),
  windows: new Float32Array(4 * MAX_SURFACES),
  energy: new Float32Array(4 * MAX_SURFACES),
  hovered: -1,
};

/**
 * Viewport rect of an anchored element this tick (CSS px, origin top-left): its layout box, which
 * no transform moves (the rise, reveals, the magnetic pull). Whole px from the layout offsets,
 * except heroLogo, logoMark and heroTagline, measured to the sub-pixel for their traced outlines.
 */
export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Laid out (not display:none) and at least partly within the viewport. */
  visible: boolean;
}

/**
 * Anchor rects by name, in DOM order, refreshed every tick by the registry (cheap: layout rects
 * are cached and only offset by the scroll). A rect's list position is its index (the one
 * motion.pointer.anchor reports), and every anchored element has one, laid out or not, so the
 * indices of one name never shift while the page keeps its elements. The scene reads, never writes.
 */
export const anchorRects: Map<string, AnchorRect[]> = new Map();
