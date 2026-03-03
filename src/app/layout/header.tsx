"use client";

import { useState, JSX } from "react";
import Image from "next/image";
import GlassPanel from "../components/glassism/glass-panel";
import { GlassButton } from "../components/glassism/glass-button";
import { NAV_ITEMS, navLabelToSectionId, CONTACT_EMAIL } from "../data/site-data";

interface HeaderProps {
  activeSection: string;
  isMobile: boolean;
  onNavigate: (sectionId: string) => void;
}

export default function Header({ activeSection, isMobile, onNavigate }: HeaderProps): JSX.Element {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNav = (label: string) => {
    onNavigate(navLabelToSectionId(label));
    setMobileMenuOpen(false);
  };

  return (
    <header className="header-navigation">
      <GlassPanel
        className="header-glass-panel"
        style={{ paddingLeft: "2.5em" }}
        width="100%"
        height="100%"
        blur={25}
        glassColor="rgba(255, 255, 255, 0.03)"
      >
        {/* Logo */}
        <div className="logo" onClick={() => onNavigate("hero")}>
          <Image src="/sfbs-logo.png" alt="SFB Logo" width={100} height={40} />
        </div>

        {/* Navigation */}
        <div id="navigation">
          {/* Desktop nav */}
          <nav className={`desktop-nav ${isMobile ? "hidden" : ""}`}>
            {NAV_ITEMS.map((item) => (
              <button
                className={`desktop-nav-button ${
                  activeSection === navLabelToSectionId(item) ? "active" : ""
                }`}
                key={item}
                onClick={() => handleNav(item)}
              >
                {item}
              </button>
            ))}
          </nav>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className={`mobile-nav-button ${isMobile ? "visible" : ""} ${
              mobileMenuOpen ? "active" : ""
            }`}
          >
            ☰
          </button>
        </div>

        {/* Desktop CTA */}
        {!mobileMenuOpen && !isMobile && (
          <div className="work-with-us-wrapper">
            <GlassButton
              variant="secondary"
              width={200}
              onClick={() => (window.location.href = `mailto:${CONTACT_EMAIL}`)}
            >
              Work with us
            </GlassButton>
          </div>
        )}
      </GlassPanel>

      {/* Mobile dropdown */}
      {mobileMenuOpen && isMobile && (
        <div className="mobile-menu-wrapper">
          <GlassPanel className="mobile-menu-panel" style={{ flexDirection: "column" }}>
            {NAV_ITEMS.map((item) => (
              <button className="mobile-menu-button" key={item} onClick={() => handleNav(item)}>
                {item}
              </button>
            ))}
            <GlassButton
              variant="secondary"
              width={200}
              onClick={() => (window.location.href = `mailto:${CONTACT_EMAIL}`)}
            >
              Work with us
            </GlassButton>
          </GlassPanel>
        </div>
      )}
    </header>
  );
}
