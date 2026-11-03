"use client";

import { Fragment, useRef, type JSX } from "react";
import { ANCHORS } from "../glass/contract";
import { useRiseFlag } from "./rise-flag";

/*
 * The landing page's heading, under the logo and over the orb. An anchor of its own (hero-tagline,
 * v3.4): the composite rasterises the rendered text from its line boxes into a distance field and
 * traces it: its letters are the logo's black (owner, 2026-11-02 evening), outlined in the logo's
 * white at rest, the electric border on top under the pointer. Like the logo it says when its
 * rise has ended (data-rise), so that outline fades in where the text comes to rest; it is a client
 * component only for that hook, and the markup is the server's. The phrases are separate spans so
 * a phone can stack them, one per line; the spaces between them stay real text, so the heading
 * still reads as one sentence.
 */
export default function HeroTagline({ id, phrases }: { id: string; phrases: readonly string[] }): JSX.Element {
  const ref = useRef<HTMLHeadingElement>(null);
  useRiseFlag(ref);

  return (
    <h1 ref={ref} id={id} className="hero-tagline rise" data-anchor={ANCHORS.heroTagline}>
      {phrases.map((phrase, index) => (
        <Fragment key={phrase}>
          {index > 0 && " "}
          <span className="tagline-phrase">{phrase}</span>
        </Fragment>
      ))}
    </h1>
  );
}
