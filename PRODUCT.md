# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Visitors to SFB's public website, at several levels. The owner confirmed all of these as in scope (2026-11-01) and named no single primary:

- Enterprise and public-sector IT buyers (CIOs, IT managers, procurement) evaluating a consultancy.
- Integrators and vendors (prime contractors, partners) checking SFB's credibility before subcontracting or co-selling.
- Engineers and prospective candidates who share an open-source mindset.
- People who already know SFB and want confirmation that it is real and competent.

Each level of visitor should get an interactive, "cool" way in that hooks them, then enough substance to explore the offer and make contact.

## Product Purpose

The public website of SFB S.R.L. ("Strive For Better"), a small Italian IT consultancy based in Rome. It exists to make visitors want to engage with SFB and get in touch.

Owner's brief (2026-11-01): the site should be artistically complex, using interactivity and visual effects to hook viewers. The owner also judges that the information and content currently feel weak and need strengthening. The owner reported contrast problems with the logos and with the positioning of labels.

Success: a visitor of any level is hooked by the interaction, finds credible information on what SFB does, and reaches out.

Conversions (owner-confirmed, 2026-11-01): emailing amministrazione@sfbs.it (`mailto:`) and visiting the SFB LinkedIn company page. The GitHub link presents SFB's open-source content and is not itself a conversion. *This reading of the owner's note is an inference.*

## Positioning

Owner-confirmed differentiators, numbered by the owner:

1. Infrastructure, development and security from one team, with no hand-offs.
2. Deep community (open-source) expertise.
3. Vendor partnerships.
4. Trusted customers.

## Operating Context

Consulting engagements across three practices (from `src/app/data/site-data.ts`):

- **Infrastructure:** OpenShift/Kubernetes, Ansible/Terraform, VMware vSphere and Aria, KVM and OpenShift Virtualization, enterprise storage, Commvault backup, observability.
- **Development:** Quarkus/Java, Kafka, API design, CI/CD, Rust and Python systems work, AI/agentic development, ML infrastructure.
- **Security:** Keycloak/RHBK identity (SAML, OIDC, SPID/CIE), application and container security, compliance (GDPR, ISO 27001, OWASP), AI/LLM security.

Italian market context is present in the content (SPID/CIE, GDPR). Company details on the site: SFB S.R.L., Viale Luca Gaurico 93, 00143 Roma (RM), Italia; P.IVA 17782391001; amministrazione@sfbs.it; LinkedIn company page and a GitHub account.

## Capabilities and Constraints

- **Delivery:** static site. Next.js 16 App Router with `output: 'export'`, trailing slashes, unoptimized images. There is no server, so no backend or form handling. Contact is `mailto:` plus the LinkedIn page.
- **Structure:** one landing page (hero, about, services, partners, contact) plus three service detail pages at `/services/infrastructure`, `/services/development` and `/services/security`. Content is data-driven from `src/app/data/site-data.ts`.
- **Interactive background:** a fixed full-screen WebGL scene (React Three Fiber, three, Rapier physics) with performance tiers and mobile detection in code. Target device floor is not confirmed.
- **Liquid-glass rebuild (owner-confirmed, 2026-11-01):** the content panels are drawn as liquid glass by a WebGL composite (refraction at the rims, chromatic dispersion, frost the cursor wipes, water ripples), with the CSS frosted glass as the baseline and fallback. Header, footer and menus stay CSS glass. GSAP (ScrollTrigger, SplitText) and Lenis are approved dependencies. Touch devices get frosted CSS glass over the live scene; mouse devices get the WebGL glass. Ambient motion can be paused from a visible on-page toggle; reduced motion gets a still scene.
- **Language:** English and Italian (owner-confirmed, 2026-11-01). The site was English-only (`<html lang="en">`). Claude writes the Italian copy and the owner reviews it afterwards, so Italian text is a draft until the owner signs it off. Because the site is a static export, the approach has to work without a server. The URL scheme is a technical choice made during implementation: English keeps the existing URLs and Italian lives under `/it/`.
- **Numeric claims:** the owner decided to drop them (2026-11-01) and the stats block has been removed from the site. It had shown "50+ Certifications, 42 Projects, 8 Customers, 1 Partnership". Treat those figures as unverified, do not reuse them, and do not invent replacements.
- **Terminology:** "Partners" and "Customers" are distinct lists. RedHat is both a partner and a customer (owner-confirmed, 2026-11-01), which is why it appears in both. The tier, scope and dates of its and the other relationships are not recorded.
- **Undecided:** any contact mechanism beyond email and LinkedIn.

## Brand Commitments

- Name: SFB S.R.L., "Strive For Better". Hero line: "Infrastructure. Development. Security." Logo: `public/sfbs-logo.png`.
- Hero (owner decision, 2026-11-02): the hero shows only the logo and "Infrastructure. Development. Security.", laid over a big centred orb, made legible by a dark text halo and drop shadow (no plate). The lead, the two calls to action and the practice doors left the hero; "Contact us" stays in the header and the no-hand-offs claim lives in About.
- Choreography v2 (owner decision, 2026-11-02): the orb splits into as many bodies as a section has panels and each body sits inside its panel (About 2, Services 3 with each ball reflecting its practice's photo and the cards linked by circuitry, Contact 3); an occupied panel glows electric blue and its border crackles with "electricity" on hover. Around Partners the single orb moves from the gap above the heading to the gap below the bands, and its circuit traces morph between the two positions instead of disappearing. The cursor stirs the bodies even under the glass.
- Choreography v3 (owner decision, 2026-11-02): the practice pages behave like the home page (one body inside each feature card and the call-to-action panel, the cards linked by circuitry, the border electricity on focus), and phones and tablets follow the desktop choreography as closely as they can: bodies split into the same panels, stacked, and stay anchored inside them while scrolling. Phones keep the CSS frosted glass; the occupied panel nearest the centre of the screen gets the electricity, since touch has no hover.
- The owner names the interactive metaball / liquid form with circuitry embedded inside, which reacts to the visitor, as the current embodiment of the "interactive and artistically complex" idea. Earlier on 2026-11-01 the owner decided to keep the scene as it was; later that day they asked for a motion-led rebuild around it ("liquid-glass-circuitry") and chose the **"Living circuit"** direction: the orb keeps its metaballs, palette and circuit reflections, and gains a job. Scroll flies the camera through circuit boards in depth; in Services the orb splits into three bodies behind the three practice cards and merges as the visitor leaves ("one team, no hand-offs"); partners and customers sit on lit circuit nodes; Contact dollies in on the orb.
- Values stated in the current About copy (existing text, not separately confirmed as voice): open-source technologies, close partnership with clients, continuous learning and community sharing, measurable growth through innovation.

## Evidence on Hand

- Partner logos in `public/partners/` (SVG): RedHat, Commvault, NetApp, Nutanix. Customer logos: RedHat, Engineering, Evoila, Reply, TAI. The tier, scope and dates of each relationship are not recorded.
- Detailed "what we do" descriptions and technology lists for each practice in `src/app/data/site-data.ts`. The owner confirmed (2026-11-01) that this existing text is the content to work from, and that new proof content is out of scope for now.
- **Absent, do not fabricate:** testimonials, case studies, named projects, press, certification lists, team bios, pricing, customer quotes. The owner has chosen not to pursue these for now. The weak feel of the content is therefore a presentation problem to solve with the existing text, not a call for new claims.

## Product Principles

1. Give every level of visitor a way in. Interaction hooks, and substance keeps them.
2. Interaction never replaces facts. What SFB does, with whom, and how to reach it stays reachable.
3. Lead with the no-hand-offs claim across infrastructure, development and security. Back it with the existing capability descriptions and the named partners and customers, not counts.
4. Claim only what is evidenced: no invented numbers, customers or credentials.
