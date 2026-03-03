"use client";

import { useState, useRef, useEffect, JSX } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import GlassPanel from "../components/glassism/glass-panel";
import { GlassButton } from "../components/glassism/glass-button";
import { NAV_ITEMS, navLabelToSectionId, CONTACT_EMAIL, SERVICES } from "../data/site-data";

interface HeaderProps {
  activeSection?: string;
  isMobile?: boolean;
  onNavigate?: (sectionId: string) => void;
}

export default function Header({ activeSection = "", isMobile = false, onNavigate }: HeaderProps): JSX.Element {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [mobileServicesOpen, setMobileServicesOpen] = useState(false);
  const servicesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const isHome = pathname === "/";

  useEffect(() => {
    return () => {
      if (servicesTimeoutRef.current) clearTimeout(servicesTimeoutRef.current);
    };
  }, []);

  const handleNav = (label: string) => {
    setMobileMenuOpen(false);
    setMobileServicesOpen(false);
    const sectionId = navLabelToSectionId(label);

    if (isHome && onNavigate) {
      onNavigate(sectionId);
    } else {
      router.push(`/#${sectionId}`);
    }
  };

  const handleServiceNav = (slug: string) => {
    setServicesOpen(false);
    setMobileMenuOpen(false);
    setMobileServicesOpen(false);
    router.push(`/services/${slug}`);
  };

  const handleLogoClick = () => {
    if (isHome && onNavigate) {
      onNavigate("hero");
    } else {
      router.push("/");
    }
  };

  const openServicesDropdown = () => {
    if (servicesTimeoutRef.current) clearTimeout(servicesTimeoutRef.current);
    setServicesOpen(true);
  };

  const closeServicesDropdown = () => {
    servicesTimeoutRef.current = setTimeout(() => setServicesOpen(false), 200);
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
        <div className="logo" onClick={handleLogoClick}>
          <Image src="/sfbs-logo.png" alt="SFB Logo" width={100} height={40} />
        </div>

        {/* Navigation */}
        <div id="navigation">
          {/* Desktop nav */}
          <nav className={`desktop-nav ${isMobile ? "hidden" : ""}`}>
            {NAV_ITEMS.map((item) => {
              if (item === "Services") {
                return (
                  <div
                    key={item}
                    className="nav-item-with-dropdown"
                    onMouseEnter={openServicesDropdown}
                    onMouseLeave={closeServicesDropdown}
                  >
                    <button
                      className={`desktop-nav-button ${
                        activeSection === "services" || pathname.startsWith("/services") ? "active" : ""
                      }`}
                      onClick={() => handleNav(item)}
                    >
                      Services
                      <span className="nav-dropdown-arrow">{"\u25BE"}</span>
                    </button>

                    {servicesOpen && (
                      <div className="services-dropdown">
                        <GlassPanel
                          blur={25}
                          glassColor="rgba(10, 10, 30, 0.7)"
                          borderRadius={16}
                          className="services-dropdown-panel"
                        >
                          <div className="services-dropdown-list">
                            {SERVICES.map((s) => (
                              <button
                                key={s.slug}
                                className={`services-dropdown-item ${
                                  pathname === `/services/${s.slug}` ? "active" : ""
                                }`}
                                onClick={() => handleServiceNav(s.slug)}
                              >
                                {s.title}
                              </button>
                            ))}
                          </div>
                        </GlassPanel>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <button
                  className={`desktop-nav-button ${
                    activeSection === navLabelToSectionId(item) ? "active" : ""
                  }`}
                  key={item}
                  onClick={() => handleNav(item)}
                >
                  {item}
                </button>
              );
            })}
          </nav>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className={`mobile-nav-button ${isMobile ? "visible" : ""} ${
              mobileMenuOpen ? "active" : ""
            }`}
          >
            {"\u2630"}
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
            {NAV_ITEMS.map((item) => {
              if (item === "Services") {
                return (
                  <div key={item} className="mobile-services-group">
                    <button
                      className="mobile-menu-button"
                      onClick={() => setMobileServicesOpen((prev) => !prev)}
                    >
                      Services {mobileServicesOpen ? "\u25B4" : "\u25BE"}
                    </button>
                    {mobileServicesOpen && (
                      <div className="mobile-services-sublist">
                        {SERVICES.map((s) => (
                          <button
                            key={s.slug}
                            className={`mobile-menu-button mobile-service-subitem ${
                              pathname === `/services/${s.slug}` ? "active" : ""
                            }`}
                            onClick={() => handleServiceNav(s.slug)}
                          >
                            {s.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <button className="mobile-menu-button" key={item} onClick={() => handleNav(item)}>
                  {item}
                </button>
              );
            })}
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
