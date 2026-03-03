"use client";

import { JSX } from "react";
import GlassPanel from "../components/glassism/glass-panel";
import SocialButtonList from "../components/social-button/social-button-list";
import { SOCIAL_LINKS } from "../data/site-data";

export default function Footer(): JSX.Element {
  return (
    <footer className="footer">
      <GlassPanel
        className="glass-panel-footer"
        width="100%"
        height={80}
        blur={25}
        glassColor="rgba(255, 255, 255, 0.03)"
      >
        <div className="social-button-container">
          <div style={{ display: "flex", gap: "20px" }}>
            <SocialButtonList links={SOCIAL_LINKS} />
          </div>
        </div>
      </GlassPanel>
    </footer>
  );
}
