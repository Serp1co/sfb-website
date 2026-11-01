import type { JSX } from "react";
import Image from "next/image";
import { CUSTOMERS, PARTNERS, type PartnerItem } from "../data/site-data";
import type { Dictionary } from "../i18n/dictionaries/types";

function LogoBand({ label, items, tint }: { label: string; items: PartnerItem[]; tint: "amber" | "silver" }): JSX.Element {
  return (
    <div className={`glass glass-band logo-band logo-band-${tint}`}>
      <div className="container">
        <h3 className="logo-label">{label}</h3>
        <ul className="logo-flex">
          {items.map((item) => (
            <li key={item.name} className="logo-cell">
              <div className="logo-box">
                {/* One tone on the black canvas: the brand colours measured 1.05–2.4:1 here.
                    The name below carries the meaning, so the mark itself is decorative. */}
                <Image
                  className={`logo-img${item.preToned ? " logo-img-toned" : ""}`}
                  src={item.icon}
                  alt=""
                  width={160}
                  height={56}
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
    <section id="partners" className="section" aria-labelledby="partners-title">
      <div className="container">
        <header className="section-head">
          <h2 id="partners-title" className="h2">
            {copy.title}
          </h2>
          <p className="lead">{copy.lead}</p>
        </header>
      </div>

      <LogoBand label={copy.partnersLabel} items={PARTNERS} tint="amber" />
      <LogoBand label={copy.customersLabel} items={CUSTOMERS} tint="silver" />

      <p className="logo-note">{copy.sharedNote}</p>
    </section>
  );
}
