import React from "react";
import ServiceSection, { ServiceSectionProps } from "./services-section";
import './services-section.css';

interface ServiceSectionListProps {
  services: ServiceSectionProps[];
  onLearnMore?: () => void;
}

const ServiceSectionList: React.FC<ServiceSectionListProps> = ({ services, onLearnMore }) => {
  return (
    <div className="service-section-list">
      {services.map((service, i) => (
        <ServiceSection
          key={i}
          title={service.title}
          description={service.description}
          icon={service.icon}
          onLearnMore={onLearnMore}
        />
      ))}
    </div>
  );
};

export default ServiceSectionList;
