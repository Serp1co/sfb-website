"use client";

import {useRef, JSX, useCallback} from "react";
import ServiceSectionList from "../components/services-section/services-section-list";
import { SERVICES } from "../data/site-data";
import {useRouter} from "next/navigation";

/**
 * Services section.
 */
export default function ServicesSection(): JSX.Element {
    const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

    function useNavigate() {
        const router = useRouter();
        return useCallback((url: string) => router.push(url), [router]);
    }

    const navigate = useNavigate()

    const handleLearnMore = (slug: string) => {
        const el = cardRefs.current.get(slug);
        if (el) {
            navigate(`/services/${slug}`);
        }
    };

    return (
        <section id="services">
            <div className="services-container">
                <div className="services-description">
                    <h2>Our Services</h2>
                    <p>Comprehensive IT solutions tailored to your needs</p>
                </div>
                <div className="services-grid">
                    {SERVICES.map((service) => (
                        <div
                            key={service.slug}
                            ref={(el) => {
                                if (el) cardRefs.current.set(service.slug, el);
                            }}
                        >
                            <ServiceSectionList
                                services={[service]}
                                onLearnMore={() => handleLearnMore(service.slug)}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}