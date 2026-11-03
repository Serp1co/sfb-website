import type { JSX } from "react";
import { ANCHORS } from "../glass/contract";
import type { Dictionary } from "../i18n/dictionaries/types";
import HeroLogo from "../components/hero-logo";
import HeroTagline from "../components/hero-tagline";

/*
 * The stage for the big merged orb (owner, 2026-11-02): the scene centres it on this section
 * (orb-slot-hero) and the logo and the tagline sit over it, centred on the same point. The brand
 * is not a copy anchor, so no guard plate darkens the orb under it and no scrim sits behind it,
 * and the scene still knows where it sits (hero-brand). The logo and the tagline are anchors of
 * their own (hero-logo since v3.2, hero-tagline since v3.4): the scene traces each one's outline
 * with an electric border, which the pointer charges (and a click on the logo discharges, v3.4),
 * and each says when its rise has ended (data-rise, components/rise-flag.ts). Their CSS glow and
 * halo carry them without the scene (styles/sections.css). No scroll reveal here: both keep the
 * CSS focus-pull (.rise), painted from the first frame.
 */
export default function HeroSection({ copy }: { copy: Dictionary["hero"] }): JSX.Element {
  return (
    <section
      id="hero"
      className="hero"
      data-story="hero"
      data-anchor={ANCHORS.orbSlotHero}
      aria-labelledby="hero-title"
    >
      <div className="container hero-inner">
        <div className="hero-brand" data-anchor={ANCHORS.heroBrand}>
          <HeroLogo />
          <HeroTagline id="hero-title" phrases={copy.tagline} />
        </div>
      </div>
    </section>
  );
}
