"use client";

import { JSX } from "react";
import GlassPanel from "../components/glassism/glass-panel";
import { GlassCard } from "../components/glassism/glass-card";
import StatsSectionList from "../components/stats-section/stats-section-list";
import { APPROACH_ITEMS, STATS } from "../data/site-data";

export default function AboutSection(): JSX.Element {
  return (
    <GlassPanel
      blur={10}
      glassColor="rgba(0, 0, 0, 0)"
      borderRadius={0}
      className="about-section-panel"
    >
      <section id="about">
        <div>
          <div className="about-header">
            <h2 className="about-us">About Us</h2>
            <p className="about-description">
              Empowering Businesses Through Innovative IT Solutions
            </p>
          </div>

          <div className="about-container">
            <GlassPanel height={400} blur={20} className="about-container-panel">
              <div className="mission-container">
                <h3>Our Mission</h3>
                <p>
                  At SFB, we are dedicated to helping organizations transform and thrive in
                  today&apos;s fast-paced digital landscape. We&apos;ve brought together a team of
                  seasoned technology professionals who share a passion for open-source collaboration
                  and a commitment to driving meaningful results.
                </p>
              </div>
            </GlassPanel>

            <GlassCard height={400} blur={20} className="approach-container-panel">
              <div className="approach-container">
                <h3>Our Approach</h3>
                <ul>
                  {APPROACH_ITEMS.map((item) => (
                    <li key={item}>✓ {item}</li>
                  ))}
                </ul>
              </div>
            </GlassCard>
          </div>

          {/* Stats */}
          <div className="stats-section">
            <StatsSectionList stats={STATS} />
          </div>
        </div>
      </section>
    </GlassPanel>
  );
}
