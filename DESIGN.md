---
name: SFB S.R.L.
description: A black canvas holding a live liquid-glass orb over a circuit board; the orb splits into the glass panels that hold the content, and a panel with a body inside lights up electric blue.
colors:
  circuit-glow-blue: "#4488ff"
  logo-cobalt: "#0e44fe"
  logo-light: "#eceef4"
  logo-charcoal: "#4d494a"
  lockup-black: "#050505"
  fog-blue: "#008cff"
  electric-blue: "#3d9bff"
  energy-rim: "#a8d8ff"
  arc-blue: "#6cc0ff"
  spark-cyan: "#cfeeff"
  pulse-cyan: "#9fe8ff"
  void-black: "#000000"
  signal-white: "#ffffff"
  mist-white: "rgba(255, 255, 255, 0.8)"
  dim-white: "rgba(255, 255, 255, 0.7)"
  glass-sheen-high: "rgba(255, 255, 255, 0.14)"
  glass-sheen-mid: "rgba(255, 255, 255, 0.08)"
  glass-sheen-low: "rgba(255, 255, 255, 0.05)"
  glass-highlight: "rgba(255, 255, 255, 0.18)"
  glass-blue-tint: "rgba(68, 136, 255, 0.1)"
  glass-blue-hover: "rgba(68, 136, 255, 0.16)"
  glass-blue-strong: "rgba(68, 136, 255, 0.28)"
  glass-blue-strong-hover: "rgba(68, 136, 255, 0.42)"
  glass-ghost-tint: "rgba(255, 255, 255, 0.05)"
  glass-amber-tint: "rgba(255, 174, 0, 0.08)"
  glass-silver-tint: "rgba(204, 204, 204, 0.07)"
  glass-bar-tint: "rgba(10, 10, 24, 0.58)"
  glass-floor: "rgba(10, 13, 28, 0.35)"
  glass-floor-band: "rgba(10, 13, 28, 0.2)"
  night-glass: "#0a0d1c"
  focus-gap: "#000814"
  copy-scrim: "rgba(0, 4, 16, 0.8)"
  surface-solid: "#10121e"
  edge-solid: "rgba(255, 255, 255, 0.55)"
  dropdown-night: "rgba(10, 10, 30, 0.7)"
  dropdown-night-thick: "rgba(10, 10, 30, 0.9)"
  image-tile: "rgba(0, 6, 92, 0.25)"
  section-band-tint: "rgba(255, 255, 255, 0.025)"
  button-edge: "rgba(120, 170, 255, 0.55)"
  button-edge-hover: "rgba(150, 190, 255, 0.85)"
  hairline: "rgba(255, 255, 255, 0.2)"
  hairline-hover: "rgba(255, 255, 255, 0.4)"
  hairline-soft: "rgba(255, 255, 255, 0.12)"
  scene-dim: "rgba(0, 0, 0, 0.4)"
typography:
  display:
    fontFamily: "IBM Plex Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(2rem, 4.2vw, 4rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "IBM Plex Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 3vw, 2.75rem)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.01em"
  card-title:
    fontFamily: "IBM Plex Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(1.375rem, 1.6vw, 1.625rem)"
    fontWeight: 700
    lineHeight: 1.2
  lead:
    fontFamily: "IBM Plex Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(1.0625rem, 0.4vw + 0.95rem, 1.25rem)"
    fontWeight: 400
    lineHeight: 1.65
  panel-copy:
    fontFamily: "IBM Plex Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.8
  title:
    fontFamily: "IBM Plex Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "IBM Plex Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.7
  small:
    fontFamily: "IBM Plex Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
  caption:
    fontFamily: "IBM Plex Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  button:
    fontFamily: "IBM Plex Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.01em"
  tag:
    fontFamily: "IBM Plex Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 700
    letterSpacing: "0.01em"
rounded:
  none: "0px"
  hair: "2px"
  sm: "10px"
  md: "16px"
  lg: "24px"
  pill: "999px"
spacing:
  s-1: "4px"
  s-2: "8px"
  s-3: "12px"
  s-4: "16px"
  s-5: "24px"
  s-6: "32px"
  s-7: "48px"
  s-8: "64px"
  s-9: "96px"
components:
  glass-card:
    backgroundColor: "{colors.glass-sheen-low}"
    textColor: "{colors.signal-white}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "32px"
  glass-card-hover:
    backgroundColor: "{colors.glass-sheen-mid}"
  glass-card-energized:
    backgroundColor: "{colors.glass-sheen-low}"
    textColor: "{colors.signal-white}"
    rounded: "{rounded.lg}"
  glass-band:
    backgroundColor: "{colors.glass-amber-tint}"
    rounded: "{rounded.none}"
    padding: "32px 0"
  glass-pill:
    backgroundColor: "{colors.glass-blue-tint}"
    textColor: "{colors.signal-white}"
    typography: "{typography.tag}"
    rounded: "{rounded.pill}"
    padding: "0.7rem 1.5rem 0.7rem 3.2rem"
  button-primary:
    backgroundColor: "{colors.glass-blue-strong}"
    textColor: "{colors.signal-white}"
    typography: "{typography.button}"
    rounded: "{rounded.lg}"
    height: "56px"
    padding: "0 32px"
  button-primary-hover:
    backgroundColor: "{colors.glass-blue-strong-hover}"
  button-ghost:
    backgroundColor: "{colors.glass-ghost-tint}"
    textColor: "{colors.signal-white}"
    typography: "{typography.button}"
    rounded: "{rounded.lg}"
    height: "56px"
    padding: "0 32px"
  button-flat:
    backgroundColor: "{colors.glass-blue-tint}"
    textColor: "{colors.signal-white}"
    typography: "{typography.button}"
    rounded: "{rounded.lg}"
    height: "48px"
    padding: "0 24px"
  button-flat-hover:
    backgroundColor: "{colors.glass-blue-hover}"
  header-bar:
    backgroundColor: "{colors.glass-bar-tint}"
    rounded: "{rounded.lg}"
    height: "64px"
  nav-link:
    textColor: "{colors.signal-white}"
    typography: "{typography.body}"
    height: "44px"
  nav-link-active:
    textColor: "{colors.circuit-glow-blue}"
  nav-menu:
    backgroundColor: "{colors.dropdown-night}"
    rounded: "{rounded.md}"
    padding: "8px"
  nav-menu-item:
    textColor: "{colors.mist-white}"
    typography: "{typography.small}"
    rounded: "{rounded.sm}"
    height: "44px"
  nav-menu-item-hover:
    backgroundColor: "{colors.glass-blue-hover}"
    textColor: "{colors.signal-white}"
  lang-switch:
    textColor: "{colors.mist-white}"
    rounded: "{rounded.pill}"
    height: "44px"
  lang-switch-current:
    backgroundColor: "{colors.glass-blue-hover}"
    textColor: "{colors.signal-white}"
  footer-bar:
    backgroundColor: "{colors.glass-bar-tint}"
    textColor: "{colors.dim-white}"
    typography: "{typography.small}"
    rounded: "{rounded.lg}"
    height: "56px"
  footer-link-hover:
    textColor: "{colors.circuit-glow-blue}"
  motion-toggle:
    textColor: "{colors.dim-white}"
    typography: "{typography.small}"
    height: "44px"
  hero-tagline:
    textColor: "{colors.lockup-black}"
    typography: "{typography.headline}"
---

# Design System: SFB S.R.L.

## Overview

**Creative North Star: "The Liquid Circuit"**

The page is a black void with a living scene behind it: a water-clear orb of fused metaballs, bending the blue traces of a circuit board as it moves. Infrastructure made fluid and touchable. The circuitry is the technical truth, and the liquid is how it responds to you. The owner's brief is that each mouse touch, stroke and movement should make the page feel alive, so the orb answers the cursor everywhere, also under the glass, and can be dragged around.

Content lives on **liquid glass**. Panels, cards, bands and pills are translucent: they frost the scene behind them, bend it at their bevels and ripple when touched. The orb travels with the story and splits into exactly as many bodies as a section has panels; each body sits inside its panel, behind the glass, and an occupied panel lights up electric blue. Sections are centred, with a bold headline over a quiet lead, then glass. The system is dark-only, scene-first, and speaks in one typeface, IBM Plex Sans.

Mood: futuristic and fluid, confident and polished, technical and precise, animated and interactive. No visual anti-reference has been confirmed. The owner prefers this frosted-glass composition; a bare, text-on-void layout was tried and rejected as "too blank and simple".

**Key Characteristics:**
- A fixed, full-screen WebGL scene is the real background; the HTML `body` is plain black.
- Content on glass: translucent fill with a soft sheen, frost, a hairline edge, 24px corners.
- One orb that divides and merges like liquid: one big body in the hero, then one body per panel, on every page and every screen; on the practice pages a small droplet in each technology pill.
- Circuitry joins the panels a body sits in, and every trace meets the body in a junction point, so the circuit stays whole behind a body pushed aside.
- One UI accent, Circuit Glow Blue; Electric Blue is reserved for what the orb charges: panels with a body inside, the hero lockup's electric border, and a logo under the pointer.
- A black hero lockup: the logo's letters and the tagline stand out from the scene by a crisp light-blue outline with a little glow, the logo under an always-on electric border that discharges under the pointer and thunders on a click.
- Bold, sober headlines in IBM Plex Sans, leaving the scene to supply the colour.
- Every pointer interaction answers back: a ripple, a wiped trail in the frost, a splash in the orb, a crackling edge.

### Decisions on record
- **2026-11-01:** the Living circuit direction; GSAP and Lenis for motion; CSS glass (not WebGL) on touch devices.
- **2026-11-02:** the orb holds slots around Partners (A above the heading, B before "Get in touch"); the Red Hat note removed; the logo bands clearer; ripples bounce once or twice, never more; the hero holds only the logo and the tagline, over a big centred orb, with a dark halo instead of a plate; the orb splits into the About, Services and Contact panels, which glow electric blue with a body inside and crackle under the pointer; each service body reflects its practice's photo; stronger pointer and click interactions.
- **2026-11-02 (v3):** the practice pages (Infrastructure, Development, Security) behave like the home page: the orb splits into their panels, the panels are joined by circuitry, and a focused lit panel's border crackles. Mobile behaves as close to desktop as possible: phones split and anchor into the same cells, stacked; touch keeps CSS glass but gets the same energy look; a tap splashes like a click.
- **2026-11-02 (v3.1):** traces meet each body in a junction pad, so interacting with a ball never leaves a hole in the circuitry; the "What we deliver" grid centres its last row, so the circuit lands centred on the last card; each technology pill holds a small droplet of its own, and the pills are joined by their own double circuit, never connected to the circuit that frames the section; a body inside a panel keeps its interaction inside that panel; the orb moves from one section's anchors to the next on its own timed transition, not synced with the scroll.
- **2026-11-02 (v3.2):** the vector logo (`sfb-logo.svg`) replaces the PNG lockup in the header and the hero; the hero logo carries a focused panel's electric border along its own outline, over a dark backing halo, whenever it is on screen; all text on glass takes a subtle black depth shadow; circuit connectors are points, not blocks; each technology pill's droplet sits in a small clear bead at the pill's start, so it reads as a ball.
- **2026-11-02 (v3.3):** the hero logo and the partner and customer logos go electric under the pointer (a charge, crackle, arcs and sparks) and burst on a click or a tap, each partner node flaring with its logo; on CSS glass the Services card windows and the pill beads are clear, as on WebGL glass; the orb rides the partner circuit's junction point as it glides between slots A and B, the traces morphing with it (it lagged behind them).
- **2026-11-02 (v3.4):** the hero logo's electric border is back, always on and stronger, and the dark rim behind it much lighter; hovering the logo discharges it; a click or a tap is thunder, electric arcs generating at the outline and shooting outward. The tagline takes the electric border too.
- **2026-11-02 (evening):** "remove the blinding flash when clicking the logo": the thunder keeps its bolts, its sparks and the orb's ripple, and lights nothing else. "The grey color on the tagline can go away, it wasn't a good choice; keep only the electric border (without the sparkles) when going over with the mouse." "Big hero logo: from white to black fill, with a light blue glow to the border to make it stand from the background; the navbar uses the light logo", then "the glow is too big, need to be more like an outline with some glow": the lockup's outline. Then "Infrastructure. Development. Security. -> make it black": the tagline takes the logo's black and its outline.

## Colors

Black, white and translucent white, lit by one cool blue. The scene supplies the rest of the colour.

### Primary
- **Circuit Glow Blue** (#4488ff): the single UI accent. The 404's emphasised claim, the active nav item and its underline, check icons, contact icons, link hovers, the focus ring, and the tint of actions. 6.2:1 on black.

### Secondary
- **Logo Cobalt** (#0e44fe): the saturated blue of the "S" and the top of the "F" in both files of the vector SFB mark (`sfb-logo.svg`, `sfb-logo-light.svg`). Lives in the logo artwork only.
- **Fog Blue** (#008cff): the colour of the scene's depth fog. Never appears in HTML.
- **Electric Blue** (#3d9bff, `--electric`): for what the orb charges only: a panel with a body of the orb inside it (owner, 2026-11-02), the glow of the hero lockup's electric border, and a logo under the pointer. Lighter and more luminous than Circuit Glow Blue, so a lit panel reads as powered, not as a button. The WebGL composite and the CSS glass draw the same hue. Never a text colour.
- **Energy family** (drawn by the composite, under either glass while the scene runs): **Energy Rim** (#a8d8ff), a pale blue for the lit bevel and the electric hairline round the hero lockup, because a saturated rim reads as paint; **Arc Blue** (#6cc0ff) for the electricity's sheath, with a near-white core (#eef9ff); **Spark Cyan** (#cfeeff) for sparks and a discharge's bloom. **Pulse Cyan** (#9fe8ff), the circuit pulses' colour, is also the hero lockup's outline in both renderers: lighter than Electric Blue, so it reads as light, not as the energy's hue.

### Neutral
- **Void Black** (#000000): the page background and the 3D scene's clear colour.
- **Signal White** (#ffffff): headlines, button labels, nav links, logos.
- **Mist White** (rgba(255, 255, 255, 0.8)): lead paragraphs, body copy, menu items.
- **Dim White** (rgba(255, 255, 255, 0.7)): captions, footer text, the pause control, the name under a logo.
- **Lockup Black** (#050505, `--brand-black`): the hero's "F" and "B" (`sfb-logo.svg`) and the tagline's letters (owner, 2026-11-02 evening). Over the dark scene it reads only inside its Pulse Cyan outline, never alone, and it is used nowhere else.
- **Logo Light** (#eceef4): the "F" and "B" of the light logo (`sfb-logo-light.svg`), the header's. The original charcoal (**Logo Charcoal**, #4d494a) measures 2.4:1 on black and is never placed on the canvas.
- **Header Night** (rgba(10, 10, 24, 0.58)) and **Dropdown Night** (rgba(10, 10, 30, 0.7); 0.9 for the Services menu, which sits inside the header's blur): the darker glass of the bars and menus, so their text stays readable over bright logos scrolling beneath.
- **Night Glass** (#0a0d1c): the dark the WebGL panes tint toward, and the **Glass Floor** under every CSS glass fill (35% of it; 20% on the logo bands while the scene moves). Over the orb the blur alone left a band label at 4.06:1.
- **Focus Gap** (#000814): fills the 3px between the focus ring and its control, so the ring meets a dark edge over any frost.
- **Copy Scrim** (rgba(0, 4, 16, 0.8)): a soft ellipse behind bare section heads; invisible over black, it darkens only what passes behind the text.
- **Solid Surface** (#10121e, hover #1a1d2c) with **Solid Edge** (55% white): the glass replacement for reduced transparency and more contrast.

### Glass
- **Panel fill:** a soft diagonal sheen (145deg) from 14% to 5% (at 60%) to 8% white over the glass floor, plus a 1px inner top highlight (18% white), so a panel reads as glass even over pure black.
- **Tints:** blue (10%) for pills and flat controls; **blue strong** (28%, 42% on hover) with a **button edge** (rgba(120, 170, 255, 0.55)) for the primary action; **amber** (8%) for the Partners band and **silver** (7%) for the Customers band.
- **Edges:** a **hairline** at 20% white, 40% on hover, and a softer 12% for dividers and the image tile's border.
- On screens narrower than 1024px the scene is dimmed by 40%, because text then crosses the orb. Once the scene shows, the composite owns the dim under either glass (it dims only its scene term, to 0.6), so the light it draws round a lit pane keeps full strength; the 40% black CSS overlay is the fallback before the scene shows.

### Scene palette (in code, not UI tokens)
The metaballs are vertex-coloured from nine hues: #0067b1, #4e99ce, #9bcbeb, #55d7e2, #ffffff, #9ca9b2, #4e6676, #f69230 and #f5d81f. Blues, cyans and greys dominate, with orange and yellow as three rare flecks. Caustics are pale cyan (#bff2ff); surface shadows are night blue (#000814), so they read as depth.

### Named Rules
**The Black Canvas Rule.** The page is black, always. The scene provides all atmosphere; no section paints an opaque background over it.

**The One Signal Rule.** Circuit Glow Blue is the only UI accent. Amber and silver are band tints, not accents.

**The Energy Rule.** Electric Blue means "the orb charges this": a body of the orb inside a panel, the big hero orb behind the lockup, or a logo the pointer charges, and nothing else. It lives on the border (or round the glyphs) and just outside it, never as a text colour, never on a control.

**The One Tone Rule.** Partner and customer logos are shown in one tone (white at 90%), because their brand colours measured 1.05–2.4:1 on black. A logo with overlapping shapes gets a pre-toned asset with layered opacities so its shapes stay distinct.

## Typography

**Display Font:** IBM Plex Sans (with Segoe UI, system-ui, sans-serif)
**Body Font:** IBM Plex Sans (same family)

**Character:** Engineered and sober. Squared apertures and a tall x-height give it a technical precision that suits infrastructure and security, and it sits easily beside the circuit-board imagery. One family, self-hosted by `next/font` with a size-adjusted fallback, carries the entire hierarchy: weight (400 and 700, the only two loaded) and size do the work. It is the owner's choice. Arial, the original leftover default, was rejected as "not good enough", and Sora as "too cheeky": geometric, rounded faces are out of character for this brand.

### Hierarchy
- **Display** (700, clamp(2rem, 4.2vw, 4rem), 1.08, -0.01em): the 404's claim and each practice page's title.
- **Headline** (700, clamp(1.75rem, 3vw, 2.75rem), 1.12, -0.01em): section titles and the hero tagline (in Lockup Black, inside its outline). In the hero the logo is the display element.
- **Card title** (700, clamp(1.375rem, 1.6vw, 1.625rem)): the practice name on each service card.
- **Lead** (400, clamp(1.0625rem, 0.4vw + 0.95rem, 1.25rem), 1.65, 54ch): the sentence under a section title.
- **Panel copy** (400, 1.125rem, 1.8): the Mission text.
- **Title** (700, 1.25rem, 1.25): panel and card headings, point titles.
- **Body** (400, 1rem, 1.7): running copy.
- **Small** (400, 0.9375rem): menu items, footer text, the pause control.
- **Caption** (400, 0.875rem): the name under a logo, fact labels, the language switch.
- **Button** (700, 1rem, 0.01em) and **Tag** (700, 0.9375rem, 0.01em; the technology pills).

### Named Rules
**The One Family Rule.** One typeface; weight and size carry the hierarchy.

**The Balance Rule.** Headings wrap with `text-wrap: balance`, paragraphs with `pretty`, so no line ends on a lone word. Measure is set in `ch` tuned to Plex (lead 54ch, copy 58ch, about 65 characters a line).

## Layout

Sections are centred in a 1240px container with a fluid gutter (`clamp(1.25rem, 4vw, 3rem)`). Each opens with a centred headline and a quiet lead, then its content. Sections take `clamp(4rem, 10vh, 6.5rem)` of vertical padding (`--section-pad`); one section's bottom and the next one's top make the gap the orb's slots span. In-page anchors clear the fixed header with one `scroll-padding-top` (6rem); from 960px a bottom inset keeps focus above the fixed footer bar. Spacing uses a 4px-based scale (4, 8, 12, 16, 24, 32, 48, 64, 96).

### The story: where the orb goes (home page)
The orb is part of the layout. Each section names its pose; the bodies spring and transit in depth between poses, so they visibly divide and merge.
- **Hero:** fills the viewport. Only the vector logo and the tagline "Infrastructure. Development. Security." (IT "Infrastruttura. Sviluppo. Sicurezza."; one line from 600px, a phrase per line below), set OVER one big merged orb centred on the section: its radius is 0.3 of the viewport height, at most 0.42 of the section's shorter side. No glass, no plate, no scrim: both are black, and their light-blue outline keeps them legible (Components, The hero lockup's electricity). The header keeps "Contact us"; the hero has no actions.
- **About:** a faint full-width band (2.5% white, no blur), a centred headline, and two panels side by side: Mission, and Approach (three points with check icons). The orb splits in two, one body inside each panel.
- **Services:** a centred row of three glass cards (image window, practice name, a one-sentence summary, "Learn more"). The three summaries share one shape ("We [verb] [what], from [A] to [B].") and about the same length, so the cards match; the technologies live on the practice pages (owner, 2026-11-02). The orb splits in three, one body in each card's window, each reflecting its practice's photo (Infrastructure, Development, Security). Three parallel circuit traces (12px pitch) link the cards through the gaps and carry pulses between them.
- **Partners and customers:** two full-bleed glass bands (amber- and silver-tinted), each with a label and a centred row of one-tone logos with their names beneath. One body holds slot A, the empty gap above the heading, then glides to slot B, the gap between the customers band and "Get in touch" (48px hysteresis, radius 0.42 of the slot's height), on a timed move like a section change (0.8s, eased in and out with the depth dive, landed about 1s after the trigger). The liquid is carried with the glide, so the ball rides its junction point all the way. The traces from the junction to each logo's node morph corner by corner from the A routing to the B routing as it goes, bending and sliding, never folding, never fading. On first arrival the orb settles first; then the traces grow from it outward and start to pulse.
- **Contact:** three glass cards (Address, Email with a copy button, Business info), each holding a body of the orb, then the Email and LinkedIn actions side by side, and a GitHub link.
- **Practice pages:** a centred hero with the practice's body and two satellites beside the title; then the same cell model as the home page. **What we deliver:** glass cards in as many 280px columns as fit (28px gap, three at most), wrapping in a centred row, so a short last row sits centred and every card keeps the column's width (where container queries are unknown it stays a left-filled grid). One body per card. Two parallel traces link neighbouring cards along each row and down to the card or cards of the row above (straight down a column, or stepping across in the gap to a centred last row), and two rails leave the last row, run just outside the container down past the technologies, and enter the call-to-action panel. **Technologies we use:** a centred wrapping row of glass pills; one body behind the row hands its liquid over to a small droplet in each pill as the section becomes current, and takes it back on leaving. The pills are joined by their own double trace (6px pitch), neighbours along each row and the rows end to end, ending in a junction point under each droplet, in its bead; this network never touches the rails that frame the section, and a clear gap stays between them. **Talk to the team:** a closing glass card with the contact action and one body.

### Cells, anchors and transitions (every page, every screen)
- **One body per cell.** A section's panels are its cells; the metaballs are shared out among them and each body sits wholly inside its cell (radius at most 0.35 of the cell's shorter side; a pill's droplet 0.3 of the pill's height, centred in its bead).
- **Anchored and carried.** Every body rides with its own cell as the page scrolls, off screen too: when a panel comes into view its body is already inside it.
- **The field follows the view.** While the orb is split, its field box covers the camera's visible region at the bodies' depth (plus about a body radius), so a body's on-screen size and smoothness no longer depend on how far apart the cells are; bodies beyond it are simply off screen. The compact hero orb keeps its own smaller box.
- **No portrait special cases.** Phones and tablets split into the same cells, stacked. Portrait and narrow viewports (aspect at most 1, or up to 760px wide) keep only the camera pulled further back and centred compositions where there are no cells.
- **Timed, not scrubbed.** The current section is the one crossing the viewport centre (5% hysteresis at each boundary). When it changes, the bodies and the camera move to the new anchors on their own clock: 0.8s, eased in and out, with the depth dive, coming to rest about 1s after the trigger. The move finishes whatever the scroll does meanwhile; turning back reverses it from where it is. No pose follows the scroll position proportionally. Reduced motion snaps.

The header is a floating glass bar inset from the viewport edges. The footer is a glass bar fixed to the bottom on screens 960px and wider (with the pause control at its right), and an ordinary block at the end of the page on phones. A viewport under 30rem tall un-fixes both bars. Breakpoints: 480px (compact buttons), 600px (the hero tagline on one line), 720px (lighter blur, tighter panels), 760px / portrait (camera pulled back, centred compositions), 960px (nav expands, fixed footer), 1024px (the scene's dim lifts).

## Elevation & Depth

Depth is layered translucency over a moving scene. Two renderers draw one glass material.

**CSS glass is the baseline and the fallback.** Every visitor first sees it, and touch devices, reduced motion, reduced transparency, more contrast, forced colours and browsers without WebGL2 keep it. Under CSS glass with the scene running, the composite still draws what lies outside each pane (the energy glow and the electricity in a thin band beyond the edge), so a phone sees the same energy as a desktop. A clear window (a service card's image frame, a pill's bead) is cut out of its surface's CSS frost, because a backdrop blur covers its element's whole box and a child cannot un-blur it; the window keeps only a faint tint (17% of rgb(59 62 74)) and its hairline, so the body behind it reads as clearly as on WebGL glass. **WebGL liquid glass** replaces it for a mouse visitor with WebGL2: the composite redraws each `[data-glass]` surface from its layout box. The header, footer bar and menus are never `[data-glass]`, because HTML scrolls under them; they stay CSS glass.

### The liquid glass (WebGL composite)
- **Lensing:** each pane bends the scene at its bevel (10–12% of the short side on panels and cards, up to 50% on pills; 14–36px wide), with the slope capped so the rim never tears. The cursor tilts the lens (6px, zero under the cursor, fading by ~400px).
- **Dispersion:** a narrow spectrum at the bevel (0.25–0.35; 6 taps at the quality tier, 1.5px apart at most), so colour fringes read as glass, never as ghosts.
- **Frost and wipe:** a 20px Gaussian frost, matched to the CSS blur. A moving cursor wipes a trail to an 8px middle stage (30% of the frost) that re-fogs in about 0.8s; a resting cursor wipes nothing. The thick rim is clearer (65%). Service image frames are clear windows (25% frost) onto their body. Logo bands thin to 55%, clearer still (30%) in a disc round each logo, so its lit node shows.
- **Ripples:** a height-field sim at 120 steps a second, fading in about 1.2s. The cursor leaves a wake, a press drops a ring, a condensing pane drops its own. Every wall absorbs: a 24px sponge band (0.45 nepers) returns one clear reflection, a faint second and nothing after. Ripples light the glass with caustics (pale cyan, 16%) and thin glints, and darken troughs by up to 15%.
- **Press ring:** a light ring (16%, 6px) rides the wave front out from a press, with a trailing crest at half its light.
- **Slosh:** a scroll flick rocks the liquid (0.85s period, settled in 1.6s): the sheen slides and the leading rim brightens like a meniscus.
- **Adaptive tint:** each pane tints toward Night Glass as the scene behind it brightens (from 0.06 of display luminance, at most 0.6).
- **Soft-knee text ceiling:** inside the text inset (14–22px) the interior's luminance approaches 0.105 and never reaches it, on a shoulder from half of it, so 80%-white copy keeps 4.6:1 or better over anything and highlights keep their shape. Darkening (troughs, shadows) comes after the ceiling and never costs contrast.
- **Guard rects:** bare copy over the open scene (section heads, practice copy) keeps the scene under it below 0.09 luminance with a 24px feather, in both modes, whatever passes behind.
- **Boot handover:** the scene fades in inside the composite over 1.2s; at 60% a wave runs out from the orb at 1000px/s, condensing each pane (from 90% size, a settling wobble), while the CSS frost on that pane fades in step (fallback timing 0.5s after 0.25s, ease-in). A drop lands at the origin 0.3s later, and two demo drops skim the first visible card at 2.6s.

### Shadow and glow vocabulary
- **Panel lift** (`box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2)` with a 1px inner top highlight): CSS glass cards, panels and bands. The composite draws a matching night-blue shadow 10px below each surface.
- **Button rest** (`box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1)`): glass buttons.
- **Text halo** (`text-shadow: 0 2px 16px rgba(0, 0, 0, 0.95)`): set once on `body`, so text over the open scene stays legible when the orb passes behind it. Text on glass takes the glass text shadow instead.
- **Glass text shadow** (`--glass-text-shadow: 0 1px 1px rgb(0 0 0 / 0.55), 0 2px 8px rgb(0 0 0 / 0.35)`, owner, 2026-11-02): a tight contact shadow and a soft lift under every text on a glass surface (headings, copy, button labels, pills, logo names, links, the header and footer bars), in both glass modes. Far lighter than the halo: the frost already parts the text from the scene, so it adds depth, not separation. Never on a selection; focus rings are outlines and stay crisp.
- **Lockup outline** (`--logo-outline`, `--tagline-outline`; owner, 2026-11-02 evening): the hero's black letters stand out by a Pulse Cyan line hugging the glyphs and a little glow just outside it, never a dark halo. The logo chains four tight drop-shadows (0.93% of its height) into a line and a softer one (3.1%, at 60%) for its glow; the tagline stacks eight tight text-shadows (0.081em) over a softer one (0.185em, at 80%). They paint from the first frame (the rise starts from them) until the scene draws the same outline, then ease out over 0.6s on the composite's own fade-in curve (`html[data-logo-energy]`, `html[data-tagline-energy]`), so the two cross without a dip; without the scene they stay, and they come back at once if it drops out. In forced colours the logo goes one light tone and the tagline takes the system's text colour, both without the outline.
- **Band text halo:** on the clearer CSS frost of the logo bands (scene moving) the label and the names take the body halo in place of the glass text shadow and the names lift to mist, because that frost lets the orb through.
- **Energized glow:** see Components, Energized cells.
- **Blur steps** (`backdrop-filter`, with 140% saturation): 12px (pills; every panel below 720px), 20px (panels, cards, buttons), 10px (logo bands while the scene moves; 6px on phones), 25px (header, footer bar, menus).
- **Hairline border** (`1px solid` 20% white, 40% on hover): the edge of every glass surface. The composite draws its own 1px hairline (18%, doubled on hover).

### Named Rules
**The Scene-First Rule.** Glass reveals the scene; it never replaces it. Panels are translucent and the orb must read through them.

**The Halo Rule.** Text over the open scene carries the black halo, because the scene moves behind it. Text on glass carries only the light glass text shadow, a depth cue rather than separation (the frost already parts it from the scene); it takes the full halo only on the logo bands' thin frost. The hero lockup carries neither: its black letters stand out by their light-blue outline.

**The Ceiling Rule.** Light on glass (ripples, glints, glow) stays under the text ceiling inside the text inset. Effects live in the bevel and outside the edge; text contrast is never traded for them.

**The Flat-Inside Rule.** Controls inside a glass card are flat tints (no blur of their own). Glass never nests inside glass.

## Shapes

Soft and rounded, like droplets. Panels, cards and buttons take 24px corners; glass pills and the language switch are pills; the Services menu panel is 16px with 10px item hovers; service image windows take 16px inside their card. The glass bands are the exception: full-bleed with square corners and no side edges, so they read as strips of frosted glass across the page. Circuit traces run orthogonal with 10px chamfers at the corners, like a board's routing, and end in junction points: a round solder dot (5px across) with a white-hot centre and a soft electric-blue falloff, like the board's vias; never a block. The hero lockup's outline and electric border follow the glyphs' own silhouettes, free shapes, not rounded rects.

## Components

### Glass cards and panels
- **Shape:** 24px corners, hairline edge, soft sheen fill over the glass floor, lift shadow, 20px frost.
- **Behaviour:** the edge brightens on hover. In CSS glass, service and feature cards also lift 4px on hover (pointer devices only), except while lit: a lit card stays on its layout box and its hotter edge is the hover cue; in WebGL glass the shader shows hover and press instead (rim +60% on hover, +80% on focus), and the DOM keeps the focus ring.
- **Content:** left-aligned inside Mission, Approach and feature cards (the feature cards themselves sit in a centred row); centred inside service, contact and call-to-action cards.

### Energized cells (signature)
A panel with a body of the orb inside it: an About panel, a service card, a contact card, and on the practice pages a feature card, the call-to-action panel and each technology pill.
- **Energy:** the glass registry measures how much of each body's disc lies inside the surface (dark below 25%, full at 85%; a pill by the share of the smaller shape inside the other, so its own droplet lights it fully and a passing bigger body by how much of the pill it covers), eases it up in 0.3s and down in 0.6s, and sets `data-energized="true"` at 0.6, clearing it at 0.4 (DOM writes only on change).
- **WebGL glow:** the rim turns Energy Rim and brightens up to 2.2x, the hairline turns Electric Blue at 80%, a soft glow spills just outside the edge (50% at the edge, 37% at 8px, gone before the 24px gap to the next card), and a faint glow (22%) runs 10px inside, leaning toward the body.
- **Electricity:** with the pointer on a lit cell, keyboard focus inside it, or on touch screens the lit panel nearest the viewport centre (it keeps the focus until another is 32px nearer, so a resting scroll never flickers it between neighbours), thin arcs crawl round the border, two strands in opposite directions (140px/s), reshaping 14 times a second and flickering, with a few sparks flying off the edge; strongest near the pointer (30% far from it). They live in a band 12px either side of the edge, outside the text inset.
- **CSS glow:** the border turns Electric Blue with a 1px ring at 35% and an inner 26px glow at 16% (pills: an inner 14px). The outer glow (22px at 45%, 64px at 14%; pills 14px and 36px) is the fallback for no scene: once the scene shows, the composite owns the light outside the pane and the CSS outer glow eases to zero, so the two never stack. Under the pointer or keyboard focus a lit card's edge runs hotter (60% electric to white, glows to 58%); pills are labels and have no hotter edge.
- **Paused or reduced motion:** no arcs; the glow is static, and hover adds a stronger static glow as the focus cue.

### The hero lockup's electricity (signature)
The big orb behind the hero charges its lockup. The logo (`sfb-logo.svg`: the cobalt S, Lockup Black "F" and "B"; the header keeps the light file) and the tagline are black, and the composite draws their outline and electricity just outside the glyphs, behind the DOM text, in both glass modes (anchors `hero-logo` and `hero-tagline`, measured to the sub-pixel). Their charges are published for the world (`motion.charge.hero`, `.tagline`, `.burstAt`).
- **Outline fields:** a signed distance field of each silhouette: the logo's from its SVG, once per page view; the tagline's from its rendered text (the h1's computed font, line by line where the DOM laid it out), rebuilt once a resize, a font swap or a language change has held for 150ms. Nothing is drawn over a glyph.
- **Outline (always: the lockup's legibility):** a crisp Pulse Cyan line at full light hugging the glyphs, then a little glow just outside it (55% at the line, down to a tenth about 6px off) that never spills into the orb ("more like an outline with some glow", owner). Its width is a share of the height: 1.4% of the logo's (2.25px at 1440 x 900), 3.6% of the tagline's line height (1.75px), never under a device pixel. No dark rim and no backing halo: the outline parts the letters, and the blue S, from the orb. The CSS draws the same outline until the scene does (Elevation & Depth, Lockup outline).
- **Logo at rest (always on while visible):** a focused pane's electric border over the outline: a 1.25px Energy Rim hairline, a soft electric-blue glow (0.7 of a charged one), the crawling crackle (0.8 of a charged one, in runs along the outline's tangent that cross-fade every 0.8s, wandering 1–5.5px out) and small arcs popping in and out (a gap bolt, two short streamers) with a few sparks. It fades in over 0.6s once the logo's rise has ended.
- **Logo hover** (the pointer within 24px of the silhouette; fine pointers): a charge builds over 0.35s, its light the charge squared. The glow swells to 1.1x, the outline lifts by 25%, and lightning goes on top: jagged, branching bolts re-made every 50–90ms, a white-hot core in an Arc Blue sheath, across the letter gaps and counters (4), down into the orb (3) and off the outline (4), with sparks, and every 0.8–1.9s at full charge a bigger bolt with a small bloom. The orb's body behind brightens by up to 20%. It decays over 0.4s.
- **Logo click or tap: thunder.** 14 long, branching bolts generate at the outline over 0.12s and shoot outward into the scene, each growing over 60–120ms to 1.5–3x the logo's half-size, then flickering, sometimes striking again, and fading (0.45–0.72s); 48 sparks are flung outward, and the orb ripples (a full drop and a splash at the logo). 0.85s in all; a repeated click retriggers. No flash and no swell (owner, 2026-11-02 evening): the bolts carry their own light. On a smaller logo the sheaths and the shower scale down (to 0.6 at least).
- **Tagline hover** (the pointer within 12px of its glyphs; fine pointers; builds over 0.22s, goes over 0.3s): only the electric border on top of the outline, a pale Energy Rim hairline (0.75px at 80%), the glow's swell (3px falloff) and the crawling crackle. No sparks, no arcs, and the letters stay black (owner). Touch never hovers it: the outline only.
- **Paused or reduced motion:** the outline and the static rest border (hairline and glow), no crackle, arcs or sparks; hover adds a static charged glow.

### Buttons
- **Primary:** blue strong glass (28%) with a blue edge, for the single most important action ("Contact us", "Email us").
- **Ghost:** 5% white glass, for secondary actions.
- **Flat (inside cards):** blue-tinted, hairline-edged, no blur: "Learn more", "Copy address", the call-to-action. Primary flat uses the strong tint.
- **States:** real `<a>` or `<button>` elements. Hover brightens the edge and lifts a CSS glass button 2px; pressing scales it to 0.98; keyboard focus draws a 2px Circuit Glow Blue ring at a 3px offset over a Focus Gap fill.

### Navigation
- **Header:** a floating glass bar: the light vector logo (`sfb-logo-light.svg`, 36px tall), five links, the language switch and "Contact us". The current section is blue with a 2px underline that draws in. On practice pages the Services item stays lit.
- **Services menu:** opens on hover and on keyboard focus (so Tab reaches it), dismisses with Escape, and lists the three practices in Dropdown Night glass.
- **Language switch:** EN | IT as two real links in a pill outline; the current language is tinted blue and carries `aria-current`.
- **Mobile (below 960px):** a 44px menu button opens a glass panel with every link, the practices under Services, the contact action and the pause control; Escape closes it and returns focus to the button.
- **Footer bar:** tagline left; LinkedIn, GitHub and the pause control right.

### Pause control
A flat text button with an icon, never glass of its own: "Pause animation" / "Resume animation" in Dim White, brightening to white on hover (it is not a link, so not blue). Both labels share one cell, so the button never changes width. It renders in place but invisible until capabilities are known, and is removed when there is no scene to pause. The choice persists for the visit and later visits. Paused, the scene holds a still frame and the effects that need motion turn static.

### Partner and customer bands
- Two full-bleed glass bands, amber- and silver-tinted. Each: an uppercase label, then logos in one tone at 3.5rem tall with their names beneath. While the scene moves they are clearer than every other pane (half the blur, a 20% floor), because the orb only glides past them; a still scene gives them the full frost back.
- **Electricity:** each mark charges like the hero logo, scaled to its size: with the pointer inside its box and within 10px of its silhouette (a field from its SVG's alpha), the charged glow and crackle along its outline (no outline or rest border of its own), bolts across its gaps, to its circuit node and off its edge, and sparks, decaying over 0.4s once the pointer leaves. A click or a tap bursts it (more bolts, a shower of sparks and a bloom, 0.45s). Its node and trace flare with its published charge (`motion.charge.marks`), a burst flashing the node past full. One mark charges at a time, the one just left still discharging. Paused or with reduced motion: a static charged glow on hover.

### Pills
- **Pills** on practice pages, one per technology (the landing cards carry none): blue tint, hairline edge, small glass surfaces with 12px blur, in a centred wrapping row. Each opens with a **bead**: a small clear round window (36px, concentric with the pill's end cap, a soft hairline ring that takes 55% Electric Blue when the pill is lit; the label starts 10px past it), clear in both glass modes (on CSS glass the pill's frost is cut out of the bead's disc). In it sits a droplet of the orb's own glass (an instanced refractive bead, since a pill is too small for the field's grid; radius 0.3 of the pill's height, wholly inside the bead), so it reads as a distinct small ball; it wobbles gently (6%, over 2.3s and 3.1s), shies from the pointer and jiggles when pressed, never leaving its bead, and lights the pill. With no scene, a solid pill or on paper the bead goes and the label recentres, because an empty ring would read as a control.

### Icons
One drawn family on a 24px grid: 1.75px round strokes, `currentColor`. No Unicode glyphs stand in for icons.

### The Liquid Circuit scene (signature)
A fixed full-screen React Three Fiber canvas behind everything: 30 transmissive metaballs (ior 1.33) fused into one marching-cubes surface, over a flight of circuit boards in black fog tinted Fog Blue, with sparse glass beads for depth. The orb reflects the circuit image; split into the service cards, one mesh is drawn three times with three environments (each practice's photo), each kept to its own body with soft seams. One master tick drives everything in a fixed order (magnetic pull, then the glass registry, then the story, then the scene), with steps capped at 1/20s so physics and ripples stay stable after a long frame.
- **Interaction:** a pointer body pushes the orb everywhere, over glass too, harder with speed (radius 0.9, +0.4 at full speed). A click splashes nearby metaballs outward and toward the camera and swells the cluster by 35% for about 0.3s; on touch a tap (a touch that stayed put and was not a scroll) splashes the same way. A body inside a panel keeps all of it inside that panel: a soft wall at the panel's rect, less the body's own margin and 6px, pushes back from 18px out, and a hard limit just past it stops the rest, so the visible body never leaves its panel. The hero's orb and the partner slots' keep the free behaviour, where a soft wall keeps flung bodies in the field. Springs bring them home within about 1s. Dragging orbits the camera (not on touch, where a swipe scrolls).
- **Circuitry between cells:** the Services links, the partner traces and the practice pages' cell links share one additive, fog-to-black material on a plane just behind the bodies, which refract it. Every trace that meets a body runs all the way into a junction point at the body's anchored rest point (a 5px round solder dot in node blue with a white-hot centre and a faint electric-blue falloff), so a pushed or splashed body never leaves a hole; traces draw in from the point outward on first appearance.
- **Motion:** Lenis smooths the scroll (lerp 0.1; anchor jumps 0.7–1.5s). GSAP reveals content as it enters: heads by line (rise and a 6px blur, 1s, expo out), blocks by 28px and an 8px blur (0.9s), items 36px with a 0.08s stagger; glass panes condense with their content. A link that changes page plays a short exit (0.12s, 8px up) while the panes start to dissolve, and the new page's panes condense from a quarter with a drop. The hero lockup has the one CSS entrance (`rise`, painted from the first frame).
- **Reduced motion:** no reveals, no rise, instant scrolling, no arcs; the scene settles out of sight and fades in as a still frame (0.8s).
- **Performance tiers:** quality for a fine pointer (DPR up to 1.5, 4x MSAA, 6 dispersion taps, a 72-cell field), performance for touch and screens up to 768px (DPR up to 1.25, 0.75 scene scale, 3 taps, a 48-cell field, a smaller circuit texture). A monitor steps the pipeline down when frames are GPU-bound. When the orb's rebuild takes the frame (over 0.6 of the budget, measured on the visitor's CPU), the field grid steps 72 → 56 → 48 instead. The field box adapts: it shrinks round the bodies while the orb is merged and compact, so the big hero orb stays smooth at the same CPU cost, and each pose caps the orb's size so a grid cell stays under 16.5px (12px for small bodies): smaller, never faceted.
- **Fallbacks:** a renderer that fails three times, or a GPU without a context, drops the scene and keeps CSS glass; forced colours hide the scene. A restrictive preference switched on mid-visit drops to CSS glass for the rest of the visit.

## Do's and Don'ts

### Do:
- **Do** keep the live scene behind every page and let the pointer reach the orb everywhere, also over glass.
- **Do** put content on frosted glass panels: translucent sheen fill, frost, 20% white hairline rising to 40%, 24px corners.
- **Do** give each section's orb exactly as many bodies as it has panels, each wholly inside its panel (radius at most 0.35 of its shorter side), on every page and at every screen size, and keep its interaction inside that panel.
- **Do** run every trace that meets a body into a junction point (a small round solder dot, never a block) at the body's rest point.
- **Do** move the orb between sections' anchors on a timed transition, triggered by the section change.
- **Do** keep Electric Blue on the border of an occupied panel, the hero lockup's border and a charged logo, and a panel's electricity under the pointer only.
- **Do** keep the hero lockup black (Lockup Black) inside its Pulse Cyan outline, and use the light logo (`sfb-logo-light.svg`) everywhere else on the canvas.
- **Do** keep CSS glass a complete design on its own: it is what touch visitors and every restrictive preference get.
- **Do** give every text on glass the glass text shadow (`--glass-text-shadow`), and text over the open scene the halo.
- **Do** make anything pressable a real link or button with a visible focus ring.
- **Do** use Circuit Glow Blue as the only UI accent.
- **Do** show partner and customer logos in one tone, with their names beneath.
- **Do** write copy for both languages together; Italian runs longer, so test its wrapping.
- **Do** honour `prefers-reduced-motion` and the pause control: no reveals, no arcs, instant scrolling, a still scene.

### Don't:
- **Don't** return to bare text on the void as the page's structure. It was tried and rejected as too blank.
- **Don't** put a plate, scrim or panel behind the hero lockup; it sits over the orb on its light-blue outline.
- **Don't** nest blurred glass inside glass. Controls inside a card are flat tints.
- **Don't** let any glass light or glow push text past the text ceiling.
- **Don't** let circuit traces fade out to change routing; they reshape.
- **Don't** scrub the orb's poses with the scroll position, or give portrait screens a separate, unsplit choreography.
- **Don't** join the technology pills' network to the circuit that frames their section.
- **Don't** use Electric Blue for text, controls or anything but an occupied panel, the hero lockup's border and a charged logo.
- **Don't** light the scene round the logo on its thunder, or give the tagline sparks, arcs or another colour on hover; the owner removed all three.
- **Don't** use the pink-tinted glass; the owner dropped it from the system.
- **Don't** place the logo's charcoal "FB" (#4d494a) on the black canvas. Use the vector logo: `sfb-logo-light.svg` (Logo Light letters) on the canvas, `sfb-logo.svg` (Lockup Black letters) only in the hero, inside its outline.
- **Don't** use opaque panel fills. The scene must show through every surface.
- **Don't** use Unicode glyphs or emoji as icons.
- **Don't** introduce a light theme. The canvas is always black.
- **Don't** add numeric claims, counts or statistics. The owner dropped them.
