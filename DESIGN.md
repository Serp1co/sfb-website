---
name: SFB S.R.L.
description: A black canvas holding a live liquid-glass orb that refracts a circuit board, with the page's content on frosted glass panels that blur and refract it as it passes behind.
colors:
  circuit-glow-blue: "#4488ff"
  logo-cobalt: "#0e44fe"
  logo-light: "#eceef4"
  logo-charcoal: "#4d494a"
  fog-blue: "#008cff"
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
  dropdown-night: "rgba(10, 10, 30, 0.7)"
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
    fontFamily: "Sora, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(2rem, 4.2vw, 4rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Sora, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 3vw, 2.75rem)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.015em"
  card-title:
    fontFamily: "Sora, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(1.375rem, 1.6vw, 1.625rem)"
    fontWeight: 700
    lineHeight: 1.2
  lead:
    fontFamily: "Sora, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(1.0625rem, 0.4vw + 0.95rem, 1.25rem)"
    fontWeight: 400
    lineHeight: 1.65
  panel-copy:
    fontFamily: "Sora, Segoe UI, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.8
  title:
    fontFamily: "Sora, Segoe UI, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Sora, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.7
  small:
    fontFamily: "Sora, Segoe UI, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
  caption:
    fontFamily: "Sora, Segoe UI, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  button:
    fontFamily: "Sora, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.01em"
  tag:
    fontFamily: "Sora, Segoe UI, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 700
    letterSpacing: "0.01em"
rounded:
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
  glass-band:
    backgroundColor: "{colors.glass-amber-tint}"
    rounded: "{rounded.hair}"
    padding: "32px 0"
  glass-pill:
    backgroundColor: "{colors.glass-blue-tint}"
    textColor: "{colors.signal-white}"
    typography: "{typography.tag}"
    rounded: "{rounded.pill}"
    padding: "11px 24px"
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
  tag:
    backgroundColor: "{colors.glass-blue-tint}"
    textColor: "{colors.signal-white}"
    typography: "{typography.tag}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
  footer-bar:
    backgroundColor: "{colors.glass-bar-tint}"
    textColor: "{colors.dim-white}"
    typography: "{typography.small}"
    rounded: "{rounded.lg}"
    height: "56px"
  footer-link-hover:
    textColor: "{colors.circuit-glow-blue}"
---

# Design System: SFB S.R.L.

## Overview

**Creative North Star: "The Liquid Circuit"**

The page is a black void with a living scene behind it: a water-clear orb of fused metaballs, bending the blue traces of a circuit board as it moves. Infrastructure made fluid and touchable. The circuitry is the technical truth, and the liquid is how it responds to you. The owner's brief is that each mouse touch, stroke and movement should make the page feel alive, so the orb is pushed by the cursor and can be dragged around.

Content lives on **frosted glass**. Panels, cards, bands, the header and the footer bar are translucent: they blur the scene behind them and refract the orb as it drifts past, so the page and the scene read as one object. Sections are centred, with a bold headline over a quiet lead, then glass. The system is dark-only, scene-first, and speaks in one typeface, Sora.

Mood: futuristic and fluid, confident and polished, technical and precise, animated and interactive. No visual anti-reference has been confirmed. The owner has said this frosted-glass composition is what they prefer; a bare, text-on-void layout was tried and rejected as "too blank and simple".

**Key Characteristics:**
- A fixed, full-screen WebGL scene is the real background; the HTML `body` is plain black.
- Content on frosted glass: translucent fill with a soft sheen, backdrop blur, hairline edge, 24px corners.
- Centred sections; panels and cards in wrapping rows; full-bleed glass bands for logos.
- One UI accent, Circuit Glow Blue, against white on black; amber and silver appear only as faint band tints.
- Bold geometric headlines in Sora, left to the scene to supply the colour.
- Every pointer interaction answers back: an edge that brightens, a card that lifts, a colour shift.

## Colors

Black, white and translucent white, lit by one cool blue. The scene supplies the rest of the colour.

### Primary
- **Circuit Glow Blue** (#4488ff): the single UI accent. The hero's emphasised claim, the active nav item and its underline, check icons, contact icons, link hovers, and the tint of actions. 6.2:1 on black.

### Secondary
- **Logo Cobalt** (#0e44fe): the saturated blue of the "S" and "F" in the SFB mark. Lives in the logo artwork only.
- **Fog Blue** (#008cff): the colour of the scene's depth fog. Never appears in HTML.

### Neutral
- **Void Black** (#000000): the page background and the 3D scene's clear colour.
- **Signal White** (#ffffff): headlines, button labels, nav links, logos.
- **Mist White** (rgba(255, 255, 255, 0.8)): lead paragraphs, body copy, menu items.
- **Dim White** (rgba(255, 255, 255, 0.7)): captions, footer text, the name under a logo.
- **Logo Light** (#eceef4): the reversed logo's "FB". The original charcoal (**Logo Charcoal**, #4d494a) measures 2.4:1 on black and is never placed on the canvas.
- **Header Night** (rgba(10, 10, 24, 0.58)) and **Dropdown Night** (rgba(10, 10, 30, 0.7)): the darker glass of the header, footer bar and menus, so their text stays readable over bright logos scrolling beneath.

### Glass
- **Panel fill:** a soft diagonal sheen from 14% to 5% to 8% white, plus a 1px inner top highlight (18% white), so a panel reads as glass even over pure black.
- **Tints:** blue (10%) for pills and flat controls; **blue strong** (28%, 42% on hover) with a **button edge** (rgba(120, 170, 255, 0.55)) for the primary action; **amber** (8%) for the Partners band and **silver** (7%) for the Customers band.
- **Edges:** a **hairline** at 20% white, 40% on hover, and a softer 12% for dividers and the image tile's border.
- On screens narrower than 1024px the scene is dimmed by **Scene Dim** (40% black), because text then crosses the orb.

### Scene palette (in code, not UI tokens)
The metaballs are vertex-coloured from nine hues: #0067b1, #4e99ce, #9bcbeb, #55d7e2, #ffffff, #9ca9b2, #4e6676, #f69230 and #f5d81f. Blues, cyans and greys dominate, with orange and yellow as rare flecks.

### Named Rules
**The Black Canvas Rule.** The page is black, always. The scene provides all atmosphere; no section paints an opaque background over it.

**The One Signal Rule.** Circuit Glow Blue is the only UI accent. Amber and silver are band tints, not accents.

**The One Tone Rule.** Partner and customer logos are shown in one tone (white at 90%), because their brand colours measured 1.05–2.4:1 on black. A logo with overlapping shapes gets a pre-toned asset with layered opacities so its shapes stay distinct.

## Typography

**Display Font:** Sora (with Segoe UI, system-ui, sans-serif)
**Body Font:** Sora (same family)

**Character:** Wide, geometric, smooth-curved. Its extended forms echo the heavy, speed-cut lettering of the SFB mark, and its round bowls suit the liquid scene. One variable family, self-hosted by `next/font` with a size-adjusted fallback, carries the entire hierarchy: weight and size do the work. It replaced Arial, which was a leftover default and not a considered choice.

### Hierarchy
- **Display** (700, clamp(2rem, 4.2vw, 4rem), 1.08, -0.02em): the hero claim and each practice page's title.
- **Headline** (700, clamp(1.75rem, 3vw, 2.75rem), 1.12): section titles.
- **Card title** (700, clamp(1.375rem, 1.6vw, 1.625rem)): the practice name on each service card.
- **Lead** (400, clamp(1.0625rem, 0.4vw + 0.95rem, 1.25rem), 1.65, 48ch): the sentence under a section title.
- **Panel copy** (400, 1.125rem, 1.8): the Mission text.
- **Title** (700, 1.25rem, 1.25): panel and card headings, point titles.
- **Body** (400, 1rem, 1.7): running copy.
- **Small** (400, 0.9375rem): tags, menu items, door stacks, footer text.
- **Caption** (400, 0.875rem): the name under a logo, fact labels, the language switch.
- **Button** (700, 1rem, 0.01em) and **Tag** (700, 0.9375rem, 0.01em).

### Named Rules
**The One Family Rule.** One typeface; weight and size carry the hierarchy.

**The Balance Rule.** Headings wrap with `text-wrap: balance`, paragraphs with `pretty`, so no line ends on a lone word. Sora's `ch` unit is wide, so measure is set in `ch` tuned for it (lead 48ch, copy 46ch).

## Layout

Sections are centred in a 1240px container with a fluid gutter (`clamp(1.25rem, 4vw, 3rem)`). Each opens with a centred headline and a quiet lead, then its content. Sections take `clamp(4rem, 10vh, 6.5rem)` of vertical padding, and in-page anchors clear the fixed header with `scroll-margin-top`. Spacing uses a 4px-based scale (4, 8, 12, 16, 24, 32, 48, 64, 96).

- **Hero:** fills the viewport, centred: the reversed logo, the claim (white, then blue), a lead, two actions, and three "doors" (glass cards linking straight to each practice, naming three technologies each). The doors are hidden below 900px, where the Services section follows.
- **About:** a faint full-width band, a centred headline, and two panels side by side: Mission, and Approach (three points with check icons).
- **Services:** a centred row of three glass cards, each with an image, the practice name, a one-line summary, four technology tags and a "Learn more" link.
- **Partners and customers:** two full-bleed glass bands (amber- and silver-tinted), each with a label and a centred row of one-tone logos with their names beneath; one line notes Red Hat is both.
- **Contact:** three glass cards (Address, Email with a copy button, Business info), then the Email and LinkedIn actions side by side, and a GitHub link.
- **Practice pages:** a centred hero, a grid of glass cards for what we deliver (`repeat(auto-fit, minmax(280px, 1fr))`, 28px gap), glass pills for technologies, and a closing glass card with the contact action.

The header is a floating glass bar inset from the viewport edges. The footer is a glass bar fixed to the bottom on screens 960px and wider, and an ordinary block at the end of the page on phones, where it would cover too much. Breakpoints: 480px (compact buttons), 720px (lighter blur, tighter panels), 900px (doors appear), 960px (nav expands, fixed footer), 1024px (the scene's dim lifts).

## Elevation & Depth

Depth is layered translucency over a moving scene. Each glass surface blurs what is behind it; the amount of blur and the soft shadow set how far it floats.

### Shadow Vocabulary
- **Panel lift** (`box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2)` with a 1px inner top highlight): glass cards, panels and bands.
- **Button rest** (`box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1)`): glass buttons.
- **Text halo** (`text-shadow: 0 2px 16px rgba(0, 0, 0, 0.95)`): set once on `body`, so text over the open scene stays legible when the orb passes behind it. Everything on glass resets it to none.
- **Blur steps** (`backdrop-filter`): 12px (pills; every panel on phones), 20px (panels, cards, bands, buttons), 25px (header, footer bar, menus).
- **Hairline border** (`1px solid` 20% white, 40% on hover): the edge of every glass surface.

About 22 surfaces are blurred at once on the landing page. That is the cost of the look, so blur drops to 12px below 720px.

### Named Rules
**The Scene-First Rule.** Glass reveals the scene; it never replaces it. Panels are translucent and the orb must read through them.

**The Halo Rule.** Text over the open scene carries the black halo, because the scene moves behind it.

**The Flat-Inside Rule.** Controls and tags inside a glass card are flat tints (no blur of their own). Glass never nests inside glass.

## Shapes

Soft and rounded, like droplets. Panels, cards and buttons take 24px corners; glass pills and the language switch are pills; the Services menu panel is 16px with 10px item hovers; service images take 16px inside their card. The glass bands are the exception: full-bleed with square corners and no side edges, so they read as strips of frosted glass across the page.

## Components

### Glass cards and panels
- **Shape:** 24px corners, hairline edge, soft sheen fill, lift shadow, backdrop blur 20px.
- **Behaviour:** the edge brightens on hover. Service, feature and door cards also lift 4px on hover (pointer devices only).
- **Content:** left-aligned inside Mission, Approach and feature cards; centred inside service, contact and call-to-action cards.

### Buttons
- **Primary:** blue strong glass (28%) with a blue edge, for the single most important action ("Contact us", "Email us").
- **Ghost:** 5% white glass, for secondary actions.
- **Flat (inside cards):** blue-tinted, hairline-edged, no blur: "Learn more", "Copy address", the call-to-action. Primary flat uses the strong tint.
- **States:** real `<a>` or `<button>` elements. Hover brightens the edge and lifts a glass button 2px; pressing scales it to 0.98; keyboard focus draws a 2px Circuit Glow Blue ring with a 3px offset.

### Navigation
- **Header:** a floating glass bar: the reversed logo, five links, the language switch and "Contact us". The current section is blue with a 2px underline that draws in. On practice pages the Services item stays lit.
- **Services menu:** opens on hover and on keyboard focus (so Tab reaches it), dismisses with Escape, and lists the three practices in Dropdown Night glass.
- **Language switch:** EN | IT as two real links in a pill outline; the current language is tinted blue and carries `aria-current`.
- **Mobile (below 960px):** a 44px menu button opens a glass panel with every link, the practices under Services, and the contact action; Escape closes it and returns focus to the button.
- **Footer bar:** tagline left, LinkedIn and GitHub right.

### Partner and customer bands
- Two full-bleed glass bands, amber- and silver-tinted. Each: an uppercase label, then logos in one tone at 3.5rem tall with their names beneath.

### Tags and pills
- **Tags** inside cards: blue tint, hairline edge, flat. **Pills** standing alone on practice pages: the same, as small glass surfaces with 12px blur.

### Icons
One drawn family on a 24px grid: 1.75px round strokes, `currentColor`. No Unicode glyphs stand in for icons.

### The Liquid Circuit scene (signature)
A fixed full-screen React Three Fiber canvas behind everything: 30 transmissive metaballs at the "quality" tier (glass-clear, ior 1.33) reflecting a circuit-board image in black fog tinted #008cff. A kinematic cursor body displaces the blobs and the camera can be orbited by dragging (disabled on touch, where a swipe should scroll). It loads after the page so the content is usable first. Phones use a lighter tier. With reduced motion it settles out of sight and fades in as a still frame.

## Do's and Don'ts

### Do:
- **Do** keep the live scene behind every page and forward pointer events to it, so the page always reacts to the cursor.
- **Do** put content on frosted glass panels: translucent sheen fill, backdrop blur, 20% white hairline rising to 40%, 24px corners.
- **Do** make anything pressable a real link or button with a visible focus ring.
- **Do** use Circuit Glow Blue as the only UI accent.
- **Do** show partner and customer logos in one tone, with their names beneath.
- **Do** write copy for both languages together; Italian runs longer, so test its wrapping.
- **Do** honour `prefers-reduced-motion`: no hero animation, instant scrolling, a still scene.

### Don't:
- **Don't** return to bare text on the void as the page's structure. It was tried and rejected as too blank.
- **Don't** nest blurred glass inside glass. Controls inside a card are flat tints.
- **Don't** use the pink-tinted glass; the owner dropped it from the system.
- **Don't** place the logo's charcoal "FB" (#4d494a) on the black canvas. Use the reversed lockup (Logo Light).
- **Don't** use opaque panel fills. The scene must show through every surface.
- **Don't** use Unicode glyphs or emoji as icons.
- **Don't** introduce a light theme. The canvas is always black.
- **Don't** add numeric claims, counts or statistics. The owner dropped them.
