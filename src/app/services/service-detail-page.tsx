"use client";

import { useRef, JSX } from "react";
import Image from "next/image";
import { useEventForwarding, useIsMobile } from "../hooks";
import { SERVICES, CONTACT_EMAIL, ServiceItem } from "../data/site-data";
import CanvasBackground from "../layout/canvas-background";
import Header from "../layout/header";
import GlassPanel from "../components/glassism/glass-panel";
import { GlassCard } from "../components/glassism/glass-card";
import { GlassButton } from "../components/glassism/glass-button";
import Footer from "../layout/footer";
import "./service-detail.css";

interface ServiceDetailPageProps {
  slug: string;
}

export default function ServiceDetailPage({ slug }: ServiceDetailPageProps): JSX.Element {
  const service = SERVICES.find((s) => s.slug === slug) as ServiceItem;

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  useEventForwarding(overlayRef, canvasContainerRef);

  return (
    <div className="service-detail-wrapper">
      <style jsx global>{`
        body { overflow-x: hidden; }
      `}</style>

      <CanvasBackground ref={canvasContainerRef} />

      <div ref={overlayRef} className="relative" style={{ zIndex: 1 }}>
        <Header isMobile={isMobile} />

        {/* Hero */}
        <div className="service-hero">
          <h1>{service.title}</h1>
          <p className="service-hero-subtitle">{service.heroSubtitle}</p>
          <p className="service-hero-description">{service.detailedDescription}</p>
        </div>

        {/* Features */}
        <div className="service-features-section">
          <h2 className="service-features-heading">What We Deliver</h2>
          <div className="service-features-grid">
            {service.features.map((feature) => (
              <GlassCard key={feature.title} blur={20} className="service-feature-card">
                <div className="service-feature-content">
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>

        {/* Technologies */}
        <div className="service-tech-section">
          <h2 className="service-tech-heading">Technologies We Use</h2>
          <div className="service-tech-tags">
            {service.technologies.map((tech) => (
              <GlassPanel
                key={tech}
                blur={16}
                glassColor="rgba(68, 136, 255, 0.1)"
                borderRadius={50}
                className="service-tech-tag"
                style={{ padding: "12px 28px" }}
              >
                <span className="service-tech-tag-label">{tech}</span>
              </GlassPanel>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="service-cta-section">
          <GlassCard blur={20} className="service-cta-panel">
            <div className="service-cta-inner">
              <h3>Ready to get started?</h3>
              <p>
                Let&apos;s discuss how our {service.title.toLowerCase()} expertise
                can accelerate your goals.
              </p>
              <div className="service-cta-button">
                <GlassButton
                  variant="secondary"
                  width={200}
                  onClick={() => (window.location.href = `mailto:${CONTACT_EMAIL}`)}
                >
                  Get in Touch
                </GlassButton>
              </div>
            </div>
          </GlassCard>
        </div>

        <Footer />
      </div>
    </div>
  );
}
