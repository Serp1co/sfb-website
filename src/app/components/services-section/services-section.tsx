import React from "react";
import Image from "next/image";
import GlassPanel from "../glassism/glass-panel";
import { GlassCard } from "../glassism/glass-card";
import { GlassButton } from "../glassism/glass-button";
import './services-section.css'

export interface ServiceSectionProps {
  title: string;
  description: string[];
  icon: string;
}

const ServiceSection: React.FC<ServiceSectionProps> = ({ icon, title, description }) => (
  <GlassCard
    height={380}
    blur={20}
    className="services-glass-card"
  >
    <div className="services-glass-container"
    >
      <div className="services-icon">
        <GlassPanel
          style={{ padding: "0", position: "absolute", width: "100%", height: "100%" }}
          blur={0.4}
          glassColor="rgba(0, 6, 92, 0.25)"
        />
        <Image
          src={icon}
          alt={title}
          width={300}
          height={300}
          className="services-image"
        />
      </div>

      <h3 className="services-title">
        {title}
      </h3>

      {description.map((line, i) => (
        <p
          key={i}
          className="services-description">
          {line}
        </p>
      ))}
      <div className="glass-button-wrapper">
        <GlassButton variant="primary">
          Learn More
        </GlassButton>
      </div>
      </div>
  </GlassCard>
);

export default ServiceSection;
