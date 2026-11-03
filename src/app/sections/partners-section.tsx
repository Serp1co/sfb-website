import type { JSX } from "react";
import Image from "next/image";
import { CUSTOMERS, PARTNERS, type PartnerItem } from "../data/site-data";
import { ANCHORS } from "../glass/contract";
import type { Dictionary } from "../i18n/dictionaries/types";
import OrbSlot from "../components/orb-slot";

/*
 * Every logo cell is an anchor: the scene lights a circuit node behind it and runs a trace to it
 * from the orb. The bands are lone glass surfaces that condense as they scroll in; nothing inside
 * them is scroll-revealed, because a reveal moving an anchor's ancestor would slide the logos off
 * their nodes. The orb holds in the open, never behind the bands: in the gap above the head (this
 * section's slot) while that gap is in view, then in the gap below the customers band (the contact
 * section's slot), and it only glides past them between the two. The traces run from wherever it
 * is. The head is bare text over the scene (a copy anchor).
 *
 * Every mark is an anchor too (logo-mark, v3.3), one per cell and in the cells' order: the pointer
 * over a mark charges it with the hero logo's electricity, and the scene builds the mark's field
 * from the image's own src (the alpha silhouette: the marks are toned by a CSS filter). The image
 * keeps its layout box: the mark is drawn object-fit: contain, centred in it.
 */
interface LogoBandProps {
  label: string;
  items: PartnerItem[];
  tint: "amber" | "silver";
  /** The band's own anchor name, if the scene measures the band itself (ANCHORS.partnersBand). */
  anchor?: string;
}

function LogoBand({ label, items, tint, anchor }: LogoBandProps): JSX.Element {
  return (
    <div
      className={`glass glass-band logo-band logo-band-${tint}`}
      data-glass="band"
      data-glass-tint={tint}
      data-anchor={anchor}
    >
      <div className="container">
        <h3 className="logo-label">{label}</h3>
        <ul className="logo-flex">
          {items.map((item) => (
            <li key={item.name} className="logo-cell" data-anchor={ANCHORS.logo}>
              <div className="logo-box">
                {/* One tone on the black canvas: the brand colours measured 1.05–2.4:1 here.
                    The name below carries the meaning, so the mark itself is decorative. */}
                <Image
                  className={`logo-img${item.preToned ? " logo-img-toned" : ""}`}
                  src={item.icon}
                  alt=""
                  width={160}
                  height={56}
                  data-anchor={ANCHORS.logoMark}
                />
              </div>
              <span className="logo-name">{item.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function PartnersSection({ copy }: { copy: Dictionary["partners"] }): JSX.Element {
  return (
    <section id="partners" className="section" data-story="partners" aria-labelledby="partners-title">
      <OrbSlot anchor={ANCHORS.orbSlotPartners} />
      <div className="container">
        <header className="section-head" data-anchor={ANCHORS.copy}>
          <h2 id="partners-title" className="h2" data-reveal="lines">
            {copy.title}
          </h2>
          <p className="lead" data-reveal="lines">
            {copy.lead}
          </p>
        </header>
      </div>

      <LogoBand label={copy.partnersLabel} items={PARTNERS} tint="amber" anchor={ANCHORS.partnersBand} />
      <LogoBand label={copy.customersLabel} items={CUSTOMERS} tint="silver" />
    </section>
  );
}
