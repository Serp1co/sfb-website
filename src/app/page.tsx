"use client";

import { useRef, useCallback, JSX } from "react";
import { useEventForwarding, useIsMobile, useActiveSection } from "./hooks";
import { SECTION_IDS } from "./data/site-data";
import CanvasBackground from "./layout/canvas-background";
import Header from "./layout/header";
import Footer from "./layout/footer";
import "@/app/page.css";
import HeroSection from "@/app/sections/hero-section";
import AboutSection from "@/app/sections/about-section";
import ServicesSection from "@/app/sections/services-section";
import PartnersSection from "@/app/sections/partners-section";
import ContactSection from "@/app/sections/contact-section";

export default function Home(): JSX.Element {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Hooks — each one owns exactly one concern
  useEventForwarding(overlayRef, canvasContainerRef);
  const isMobile = useIsMobile();
  const activeSection = useActiveSection(SECTION_IDS);

  const scrollToSection = useCallback((sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <div className="relative w-screen min-h-screen overflow-x-hidden">
      {/* Global overrides */}
      <style jsx global>{`
        body { overflow-x: hidden; }
        section { width: 100%; }
      `}</style>

      <CanvasBackground ref={canvasContainerRef} />

      <div ref={overlayRef} className="relative" style={{ zIndex: 1 }}>
        <Header
          activeSection={activeSection}
          isMobile={isMobile}
          onNavigate={scrollToSection}
        />

        <HeroSection onNavigate={scrollToSection} />
        <AboutSection />
        <ServicesSection />
        <PartnersSection />
        <ContactSection />

        <Footer />
      </div>
    </div>
  );
}
