import type { JSX } from "react";
import type { Dictionary } from "../i18n/dictionaries/types";
import { CheckIcon } from "../components/icons";

export default function AboutSection({ copy }: { copy: Dictionary["about"] }): JSX.Element {
  return (
    <section id="about" className="section section-band" aria-labelledby="about-title">
      <div className="container">
        <header className="section-head">
          <h2 id="about-title" className="h2">
            {copy.title}
          </h2>
          <p className="lead">{copy.subtitle}</p>
        </header>

        <div className="panel-row">
          <article className="glass glass-card panel">
            <h3 className="h3">{copy.missionTitle}</h3>
            <p className="copy">{copy.lead}</p>
          </article>

          <article className="glass glass-card panel">
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
