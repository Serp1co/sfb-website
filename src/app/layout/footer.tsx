import type { JSX } from "react";
import { SOCIAL_LINKS } from "../data/site-data";

/** Glass bar: fixed to the bottom on wide screens, a normal block on phones (see components.css). */
export default function Footer({ tagline, newTab }: { tagline: string; newTab: string }): JSX.Element {
  return (
    <footer className="site-footer">
      <div className="footer-inner glass">
        <p className="footer-tagline">{tagline}</p>
        <ul className="footer-links">
          {SOCIAL_LINKS.map((social) => (
            <li key={social.name}>
              <a href={social.link} target="_blank" rel="noopener noreferrer">
                {social.name}
                <span className="sr-only"> ({newTab})</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
