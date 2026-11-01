---
target: landing page (src/app/page.tsx)
total_score: 18
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 4
target_identity: "file:C:\\Git\\sfb-website\\src\\app\\page.tsx"
target_fingerprint: "sha256:bbab54f93683739b459fe67076109a85df7b86fa15a516d42632f934a73025d1"
target_path: "C:\\Git\\sfb-website\\src\\app\\page.tsx"
timestamp: 2026-11-01T18-39-17Z
slug: src-app-page-tsx
---
Method: dual-agent (A: design-review sub-agent, B: detector + browser sub-agent). Rendered evidence via headless Chrome (WebGL via SwiftShader), 1440x900 and emulated 390x844. No in-browser overlay available.

# Critique: landing page (src/app/page.tsx)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No WebGL loading/poster state, no focus or pressed state on glass CTAs, nothing signals the orb is pushable. |
| 2 | Match System / Real World | 2 | Boilerplate copy; "Trusted by industry leaders" under both Partners and Customers; lang="en" for an Italian firm. |
| 3 | User Control and Freedom | 3 | Logo goes home, smooth scroll, dropdown grace delay. No orbit reset or pause for motion. |
| 4 | Consistency and Standards | 2 | Primary actions are div onClick; pink and blue CTA languages coexist; three dark panel tints; bands break glass rules. |
| 5 | Error Prevention | 2 | Sole conversion is a mailto: fired from a div; no copy-email fallback. |
| 6 | Recognition Rather Than Recall | 3 | Nav clear; the technologies (the differentiator) sit one click deep on detail pages. |
| 7 | Flexibility and Efficiency | n/a | Persuade/Experience landing page. |
| 8 | Aesthetic and Minimalist Design | 2 | Restraint tipped into emptiness; heavy black text halo on nearly all text. |
| 9 | Error Recovery | 2 | Degrades without WebGL by accident; no poster, no prefers-reduced-motion. |
| 10 | Help and Documentation | n/a | Not applicable to a landing page. |
| **Total** | | **18/32 (56%)** | **Acceptable: significant improvement needed** |

## Design Specificity Verdict

LLM assessment: one authentic element inside a category-default shell. The refractive metaball reacting to the pointer is unmistakably SFB; the rest is the standard black + glassmorphism + one blue + Arial + centred H2 template.
- The orb carries no meaning: 30 bodies in 9 random colors pulled by a constant centripetal force (physics-body.tsx:24-26) into one orb at the viewport centre, regardless of section. About 3% of pixels; the rest is black. The circuit board is only a hidden environment map; it is never seen.
- Glass with nothing to refract: white at 10% over black is flat grey (rgb 26,26,26). Three different dark tints across About, Services, Contact.
- Structural sameness: every section is centred H2 + 20px subtitle + centred row of rounded cards.
- Drift: pink variant still renders as dark maroon (header, mobile menu, Contact); Customers band is a flat grey slab, the brightest object; Geist loaded but never applied.
- Missed character: "no hand-offs" performed by the scene, Rome and open source, named technologies on the landing, the slanted cut of the SFB mark.

Deterministic scan: impeccable detect src/app returned 16 findings (exit 2): 15 advisory design-system-font-size and 1 overused-font (globals.css:25). Rendered-page scan: 6 at 1440 (2 straggler, 1 overused-font, 3 nested-cards) and 5 at emulated 390 (1 straggler, 1 overused-font, 3 nested-cards). False positives: none. The font-size advisories are measured against the DESIGN.md ramp, which condensed ranges (22-28px etc.) into single values, so they are drift notes only.
- Agreement: Arial only, Geist unused; logo contrast measured independently (NetApp 1.09, Engineering 1.05, Evoila ~1.2, Nutanix 1.39, TAI ~1.85, hero FB charcoal 2.36).
- Detector caught what review missed: invalid CSS at services-section.css:5 (`border-color 0.3 ease` has no unit, whole transition shorthand dropped); horizontal overflow at 1440 from the w-screen wrapper (scrollWidth 1440 vs clientWidth 1425); orphaned last-line words ("results." in mission paragraph, "security." in Security card); nested cards in each service card.
- Review caught what detector cannot: positioning/content, keyboard reachability, GlassPanel ignoring width/height, orb behaviour, conversion path.

Visual overlays: unavailable (no human browser tab).

## Overall Impression

One real idea (interactive liquid orb refracting circuitry) that lands for three seconds, then boilerplate copy, flat grey boxes, a loud grey logo band and a faint maroon final CTA. Biggest opportunity: give the scene a job. Make it perform "one team, no hand-offs" and give glass something to refract; the content and contrast problems get solved by the same move.

## What's Working

1. The orb is a real signature; pointer displacement is delightful and glass buttons pick up refraction as it passes behind.
2. Disciplined palette and a clear spine: white on black with one blue near the logo cobalt, decisive 72px H1, tagline maps 1:1 onto the three service cards, order hero/what/proof/contact.
3. Real content exists in site-data.ts (Keycloak/RHBK with SPID/CIE, Quarkus, Kafka, OpenShift Virtualization, SBOM supply chain) and genuine partner/customer logos; the problem is presentation.

## Priority Issues

1. [P1] The page never states or proves the positioning, and content feels weak. No "one team, no hand-offs" line; generic About copy; stats block (50+/42/8/1) still renders, contradicts logos and the decision to drop numbers; both bands share "Trusted by industry leaders"; RedHat in both with no explanation; service cards are one abstract sentence with no technology names. Fix: hero claim "Infrastructure, development and security. One team, no hand-offs."; replace Mission/Approach cards with 3-4 claims, one per differentiator; delete stats; show 4-6 technologies[] tags per service card and SPID/CIE, GDPR, ISO 27001 competence lines; retitle bands "Technology partners" / "Delivered for", explain RedHat's dual role; no new claims or numbers. Command: /impeccable clarify, then /impeccable distill (shape first if the hero is re-briefed).

2. [P1] Logo contrast and the Partners and Customers bands. About half the logos are effectively invisible (NetApp 1.09:1, Engineering 1.05:1, Evoila ~1.2:1, Nutanix 1.39:1, TAI ~1.85:1, hero "FB" 2.36:1). Wrapper width:120%/margin:-10% makes a 1680px band; GlassPanel ignores height={200} so bands are ~300px; captions on different baselines; ~36px gap to "Our Customers" vs 100px elsewhere; mobile stacks about 2,500px of one-per-row logos. Fix: one logo tone (white 70-85% via brightness(0) invert(1) or mono SVGs), fixed ~40px logo boxes in a single strip, no tinted slabs, drop captions (alt carries the name), 2-3 columns on mobile, lighter "FB" or light lockup at 4.5:1+. Command: /impeccable colorize, then /impeccable layout.

3. [P1] The signature scene is nearly invisible and fights legibility. In 4 of 6 desktop captures the orb sits behind a heading or subtitle and the black halo smears across it. Fix: section-aware orb (dock/offset, never under body text); three practice-coloured lobes merging at hero and contact; visible circuit-board layer; left-aligned asymmetric columns; drop the blanket text-shadow; add prefers-reduced-motion and a static poster. Command: /impeccable bolder, plus layout and animate.

4. [P1; P0 for keyboard-only visitors] The conversion mechanics. Tab order is only nav buttons, dropdown items, LinkedIn and GitHub; hero CTAs, "Work with us", three "Learn More" and "Contact Us Now" are GlassPanel divs with onClick (not focusable); Services dropdown opens on hover only; email is plain text; LinkedIn is 14px in the fixed footer; "Contact Us Now" is the faintest object (maroon bar, the dropped pink variant); four labels for one destination; no focus ring. Fix: real <a>/<button> glass CTAs; mailto: link with copy fallback, email card as primary action in Contact with LinkedIn at equal weight; remove the pink variant; focus-openable dropdown and visible focus rings; two labels ("Contact us", "See services"). Command: /impeccable harden, then /impeccable polish.

5. [P2] Rhythm, mobile length and performance. Five identical templates; 9,624px mobile page; fixed header+footer cover ~18% of an 844px viewport; hard-coded "quality" tier on every phone (inferred cost); touch events forwarded to a canvas with OrbitControls (swipe may orbit, inferred). Fix: vary composition and scale, drop fixed footer on mobile, mobile and reduced-motion tiers, disable orbit on touch, one first-view cue for interactivity. Command: /impeccable adapt, then /impeccable optimize.

## Persona Red Flags

Jordan (first-timer): hero shows logo, "STRIVE FOR BETTER" and three nouns, nothing says IT consultancy or Rome; brand stacked three times in the first viewport; nothing says the orb is pushable; three equal-weight buttons.
Casey (mobile): headline wraps, ~300px hero logo; header+footer ~152px of 844px; 9.6k px page with ~2,500px of stacked logos; Contact last in the hamburger; no hover so orb reacts only during touch; 14px social tap targets.
Sam (keyboard/screen reader): hero CTAs, Work with us, Learn More x3, Contact Us Now unreachable; service pages keyboard-unreachable; home-logo div not focusable; no prefers-reduced-motion; lang="en".
Skeptical enterprise/PA buyer: stats do not match logos; "Trusted by industry leaders" under tool vendors; P.IVA buried as a peer of Email; no PEC; SPID/CIE, GDPR, ISO 27001 only on detail pages; the fix is better presentation of existing facts.
Vendor/integrator: four logos, two nearly invisible; misaligned captions read careless; GitHub points to a personal account at 14px; cannot tell certified partner from tool in use.

## Minor Observations

- GlassPanel ignores width and height (never destructured; style spread twice). Hero buttons render ~145x64 (not 180x60), Partners band ~308px (not 200). DESIGN.md states the wrong sizes; refresh with /impeccable document after fixes.
- Invalid CSS at services-section.css:5.
- Header/footer bleed offsets show rounded corners at screen edges.
- <title> and meta description are weak for search and link previews.
- Stock service imagery; the Development image shows C#/JS/PHP badges that do not match SFB's stack.
- Light-mode remnant in globals.css.
- Orphaned last-line words in three places; text-wrap: pretty would fix them.

## Questions to Consider

1. What if the three practices were three liquid lobes in their own colors, merging at hero and Contact, separating on service hover?
2. If the circuit board were a visible full-bleed layer, would grey cards, tinted bands and text halos still be needed?
3. Which visitor does the hero speak to first? What if the first screen were three doors (I run IT / I build with you / I want to build here)?
4. What if partners and customers were nodes on the circuit, with traces from the SFB mark to each logo in one white tone?
