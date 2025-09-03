import React from "react";
import GlassPanel from "../glassism/glass-panel";
import Image from "next/image";
import './contact-section.css'

export interface ContactSectionProps {
    icon: string;
    title: string;
    content: string[];
}

const ContactSection: React.FC<ContactSectionProps> = ({ icon, title, content }) => (
    <GlassPanel
        height={200}
        blur={15}
        glassColor="rgba(68,136,255,0.05)"
        className="contact-glass-panel"
    >
        <div className="contact-content">
            <div className="contact-icon">
                <Image
                    src={icon}
                    alt={title}
                    width={64}
                    height={64}
                />
            </div>
            <h3 className="contact-title">
                {title}
            </h3>
            {content.map((line, i) => (
                <p key={i} className="contact-line">
                    {line}
                </p>
            ))}
        </div>
    </GlassPanel>
);

export default ContactSection;