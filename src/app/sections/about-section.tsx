import type { JSX } from "react";
import { ANCHORS } from "../glass/contract";
import type { Dictionary } from "../i18n/dictionaries/types";
import { CheckIcon } from "../components/icons";

/*
 * The head is bare text over the scene (a copy anchor: the orb keeps clear of it and the scene
 * darkens under it). Both panels are cells (owner, 2026-11-02): here the orb splits in two, one
 * body inside each panel, and a panel lights up electric blue while its body is inside
 * (data-energized, set by the glass registry; the CSS glow is in styles/components.css).
 */

export default function AboutSection({ copy }: { copy: Dictionary["about"] }): JSX.Element {
  return (
    <section id="about" className="section section-band" data-story="about" aria-labelledby="about-title">
      <div className="container">
        <header className="section-head" data-anchor={ANCHORS.copy}>
          <h2 id="about-title" className="h2" data-reveal="lines">
            {copy.title}
          </h2>
          <p className="lead" data-reveal="lines">
            {copy.subtitle}
          </p>
        </header>

        <div className="panel-row" data-reveal="items">
          <article className="glass glass-card panel" data-glass="panel" data-anchor={ANCHORS.aboutCell}>
            <h3 className="h3">{copy.missionTitle}</h3>
            <p className="copy">{copy.lead}</p>
          </article>

          {/* Also the Approach anchor, which the world's About hold read before the split. */}
          <article
            className="glass glass-card panel"
            data-glass="panel"
            data-anchor={`${ANCHORS.aboutCell} ${ANCHORS.aboutApproach}`}
          >
            <h3 className="h3">{copy.approachTitle}</h3>
            <ul className="checks">
              {copy.points.map((point) => (
                <li key={point.title} className="check">
                  <CheckIcon className="icon check-icon" />
                  <div>
                    <strong>{point.title}</strong>
                    <span>{point.body}</span>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}
