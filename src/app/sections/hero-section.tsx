"use client";

import { JSX } from "react";
import Image from "next/image";
import { GlassButton } from "../components/glassism/glass-button";

interface HeroSectionProps {
  onNavigate: (sectionId: string) => void;
}

export default function HeroSection({ onNavigate }: HeroSectionProps): JSX.Element {
  return (
    <section id="hero">
      <div className="animate-in">
        <Image src="/sfbs-logo.png" alt="SFB" height={300} width={300} className="hero-logo" />
        <h1>STRIVE FOR BETTER</h1>
        <p>Infrastructure. Development. Security.</p>
        <div className="glass-container">
          <GlassButton
            variant="primary"
            blur={30}
            width={180}
            onClick={() => onNavigate("services")}
            className="hero-button"
          >
            Our Services
          </GlassButton>
          <GlassButton
            variant="ghost"
            blur={30}
            width={180}
            onClick={() => onNavigate("contact")}
          >
            Get in Touch
          </GlassButton>
        </div>
      </div>
    </section>
  );
}
