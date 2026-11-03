import type { JSX } from "react";
import { SOCIAL_LINKS } from "../data/site-data";
import MotionToggle from "../components/motion-toggle";

interface FooterProps {
  tagline: string;
  newTab: string;
  /** The pause control's labels: the bar is the one place it is always on screen (from 960 px). */
  motionLabels: { pause: string; play: string };
}

/** Glass bar: fixed to the bottom on wide screens, a normal block on phones (see components.css). */
export default function Footer({ tagline, newTab, motionLabels }: FooterProps): JSX.Element {
  return (
    <footer className="site-footer">
      <div className="footer-inner glass">
        <p className="footer-tagline">{tagline}</p>
        <div className="footer-end">
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
          <MotionToggle labels={motionLabels} className="motion-toggle-bar" />
        </div>
      </div>
    </footer>
  );
}
