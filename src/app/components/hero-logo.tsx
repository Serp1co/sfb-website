"use client";

import { useRef, type JSX } from "react";
import Image from "next/image";
import { ANCHORS } from "../glass/contract";
import { useRiseFlag } from "./rise-flag";

/** data-rise on the logo once its rise has ended (components/rise-flag.ts); kept here for v3.3's readers. */
export { RISE_DONE } from "./rise-flag";

/*
 * The hero's vector lockup (v3.2), crisp at every size: a cobalt S and F crossbar, black F and B
 * (owner, 2026-11-02 evening), outlined in white, a crisp line of about 2 px (the CSS's
 * from the first frame, then the composite's: styles/sections.css, LOGO_BORDER.outline).
 * Decorative (empty alt): the header's home link names the brand, the heading below carries the
 * page. An anchor of its own (hero-logo): the scene traces its outline. It is a client component
 * only for the rise-end hook (data-rise); the markup is the server's, so hydration changes nothing.
 */
export default function HeroLogo(): JSX.Element {
  const ref = useRef<HTMLImageElement>(null);
  useRiseFlag(ref);

  return (
    <Image
      ref={ref}
      className="hero-logo rise"
      src="/sfb-logo.svg"
      alt=""
      width={601}
      height={244}
      preload
      data-anchor={ANCHORS.heroLogo}
    />
  );
}
