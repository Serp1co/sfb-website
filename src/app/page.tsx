"use client";

import { Canvas } from "@react-three/fiber";
import { useRef, useEffect, useState, JSX } from "react";
import * as THREE from "three";
import { HDRBackground } from "./aquaism/backgrounds/background-loader";
import MetaballSimulation from "./aquaism/core/metaball-simulation";
import { getPerformanceConfig } from "./aquaism/core/performance-configs";
import { GlassButton } from "./components/glassism/glass-button";
import { GlassCard } from "./components/glassism/glass-card";
import GlassPanel from "./components/glassism/glass-panel";
import { AdvancedFakeReflectionSetup } from "./aquaism/backgrounds/reflective-background";
import Image from "next/image";
import { forwardEventToCanvas } from "./components/forward-event-to-canvas";
import SocialButton from "@/app/components/social-button/social-button";
import SocialButtonList from "./components/social-button/social-button-list";
import "@/app/page.css"
import ContactSectionList from "./components/contact-section/contact-section-list";
import ServiceSection from "./components/services-section/services-section";
import ServiceSectionList from "./components/services-section/services-section-list";
import StatsSection from "./components/stats-section/stats-section";
import StatsSectionList from "./components/stats-section/stats-section-list";

export default function Home(): JSX.Element {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState('hero');
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const overlay: HTMLDivElement | null = overlayRef.current;
    const canvasContainer: HTMLDivElement | null = canvasContainerRef.current;
    if (!overlay || !canvasContainer) return;

    // Function to forward events to canvas    

    const eventsToForward: readonly string[] = [
      'mousedown', 'mouseup', 'mousemove', 'mouseenter', 'mouseleave',
      'pointerdown', 'pointerup', 'pointermove', 'pointerenter', 'pointerleave',
      'click', 'dblclick', 'wheel', 'contextmenu'
    ] as const;

    const handlers: Record<string, (e: Event) => void> = {};
    eventsToForward.forEach((eventType: string) => {
      handlers[eventType] = (e: Event): void => {
        const canvas = canvasContainer.querySelector('canvas');
        forwardEventToCanvas(e as MouseEvent | WheelEvent | PointerEvent, canvas);
      };
      overlay.addEventListener(eventType, handlers[eventType], { capture: true });
    });

    return (): void => {
      eventsToForward.forEach((eventType: string) => {
        overlay.removeEventListener(eventType, handlers[eventType], { capture: true });
      });
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const handleScroll = () => {
      const sections = ['hero', 'about', 'services', 'partners', 'contact'];
      const scrollPosition = window.scrollY + window.innerHeight / 2; // Use viewport center instead of fixed offset
      // Find the section that contains the center of the viewport
      let currentSection = 'hero'; // Default to hero
      for (const section of sections) {
        const element = document.getElementById(section);
        if (element) {
          const rect = element.getBoundingClientRect();
          const absoluteTop = window.scrollY + rect.top;
          const absoluteBottom = absoluteTop + rect.height;
          // Check if the viewport center is within this section
          if (scrollPosition >= absoluteTop && scrollPosition < absoluteBottom) {
            currentSection = section;
            break;
          }
        }
      }

      setActiveSection(currentSection);
    };

    // Call handleScroll immediately to set initial state
    handleScroll();

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setMobileMenuOpen(false);
    }
  };

  return (
    <div className="relative w-screen min-h-screen overflow-x-hidden">
      {/* Global Styles */}
      <style jsx global>{`
        body {
          overflow-x: hidden;
        }
        text {
          textShadow: '0 4px 20px rgba(0, 0, 0, 1)'
        }
        p {
          textShadow: '0 4px 20px rgba(0, 0, 0, 1)'
        }
        section {
          width: 100%;
        }
      `}
      </style>

      {/* Canvas Background - Fixed Position */}
      <div ref={canvasContainerRef} className="fixed inset-0 w-full h-full" style={{ zIndex: 0 }}>
        <Canvas
          camera={{ position: [0, 0, 5], fov: 75 }}
          gl={{
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            outputColorSpace: THREE.SRGBColorSpace,
            powerPreference: "high-performance",
          }}
          dpr={[1, 1.5]}
          performance={{ min: 0.5, max: 1 }}
        >
          <AdvancedFakeReflectionSetup
            reflectionImage="/hero-bg-ultra-low.jpg"
            backgroundColor={"#000000"}
            fogColor="#008cff"
            fogNear={5}
            fogFar={20}
            isFogEnabled={true}
          />
          <HDRBackground path="/hero-bg-ultra-low.jpg" format="jpg" blur={0.02} visible={false} exposure={10} intensity={10} />
          <MetaballSimulation config={getPerformanceConfig("quality")} />
        </Canvas>
      </div>
      {/* Content Overlay */}
      <div ref={overlayRef} className="relative" style={{ zIndex: 1 }}>
        {/* Header/Navigation */}
        <header className="header-navigation">
          <GlassPanel
            className="header-glass-panel"
            style={{ paddingLeft: '2.5em' }}
            width={'100%'}
            height={'100%'}
            blur={25}
            glassColor="rgba(255, 255, 255, 0.03)"
          >

            {/* Logo - Left aligned */}
            <div
              className="logo"
              onClick={() => scrollToSection('hero')}
            >
              <Image
                src="/sfbs-logo.png"
                alt="SFB Logo"
                width={100}
                height={40}
              />
            </div>

            {/* Navigation */}
            <div id="navigation">
              {/* Desktop Navigation */}
              <nav className={`desktop-nav ${isMobile ? 'hidden' : ''}`}>
                {['Home', 'About', 'Services', 'Partners', 'Contact'].map((item) => (
                  <button
                    className={`desktop-nav-button 
                      ${activeSection === (item.toLowerCase() === 'home' ? 'hero' : item.toLowerCase())
                        ? 'active'
                        : ''
                      }`}
                    key={item}
                    onClick={() =>
                      scrollToSection(item.toLowerCase() === 'home' ? 'hero' : item.toLowerCase())
                    }
                  >
                    {item}
                  </button>

                ))}
              </nav>

              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className={`mobile-nav-button ${isMobile ? 'visible' : ''} ${mobileMenuOpen ? 'active' : ''}`}
              >
                ☰
              </button>
            </div>
            {!mobileMenuOpen && !isMobile && (
              <div className="work-with-us-wrapper">
                <GlassButton
                  variant="secondary"
                  width={200}
                  onClick={() => window.location.href = 'mailto:amministrazione@sfbs.it'}
                >
                  Work with us
                </GlassButton>
              </div>
            )}
          </GlassPanel>

          {/* Mobile Menu Dropdown */}
          {mobileMenuOpen && isMobile && (
            <div className="mobile-menu-wrapper">
              <GlassPanel className="mobile-menu-panel" style={{ flexDirection: 'column' }}>
                {['Home', 'About', 'Services', 'Partners', 'Contact'].map((item) => (
                  <button
                    className="mobile-menu-button"
                    key={item}
                    onClick={() =>
                      scrollToSection(item.toLowerCase() === 'home' ? 'hero' : item.toLowerCase())
                    }
                  >
                    {item}
                  </button>
                ))}
                <GlassButton
                  variant="secondary"
                  width={200}
                  onClick={() =>
                    window.location.href = 'mailto:amministrazione@sfbs.it'
                  }
                >
                  Work with us
                </GlassButton>
              </GlassPanel>
            </div>
          )}
        </header>

        {/* Hero Section */}
        <section id="hero">
          <div className="animate-in">
            <Image
              src="/sfbs-logo.png"
              alt="SFB"
              height={300}
              width={300}
              className="hero-logo" />
            <h1>
              STRIVE FOR BETTER
            </h1>
            <p>
              Infrastructure. Development. Security.
            </p>
            <div className="glass-container">
              <GlassButton
                variant="primary"
                blur={30}
                width={180}
                onClick={() => scrollToSection('services')}
                className="hero-button">
                Our Services
              </GlassButton>
              <GlassButton
                variant="ghost"
                blur={30}
                width={180}
                onClick={() => scrollToSection('contact')}
              >
                Get in Touch
              </GlassButton>
            </div>
          </div>
        </section>

        {/* About Section */}
        <GlassPanel blur={10}
          glassColor="rgba(0, 0, 0, 0)"
          borderRadius={0}
          className="about-section-panel">

          <section id="about">
            <div>
              <div className="about-header">
                <h2 className="about-us">
                  About Us
                </h2>
                <p className="about-description">
                  Empowering Businesses Through Innovative IT Solutions
                </p>
              </div>

              <div className="about-container" >
                <GlassPanel
                  height={400}
                  blur={20}
                  className="about-container-panel"
                >
                  <div className="mission-container">
                    <h3>Our Mission</h3>
                    <p>
                      At SFB, we are dedicated to helping organizations transform and thrive in today&apos;s
                      fast-paced digital landscape. We&apos;ve brought together a team of seasoned technology
                      professionals who share a passion for open-source collaboration and a commitment to
                      driving meaningful results.
                    </p>
                  </div>
                </GlassPanel>

                <GlassCard
                  height={400}
                  blur={20}
                  className="approach-container-panel"
                >
                  <div className="approach-container">
                    <h3>Our Approach</h3>
                    <ul>
                      <li>
                        ✓ Leverage open-source technologies for robust solutions
                      </li>
                      <li>
                        ✓ Partner closely with clients for custom strategies
                      </li>
                      <li>
                        ✓ Foster continuous learning and community sharing
                      </li>
                      <li>
                        ✓ Drive measurable growth through innovation
                      </li>
                    </ul>
                  </div>
                </GlassCard>
              </div>

              {/* Stats */}
              <div className="stats-section">
                <StatsSectionList
                  stats={[
                    { number: '50+', label: 'Certifications' },
                    { number: '42', label: 'Projects' },
                    { number: '16', label: 'Partnerships' },
                    { number: '100%', label: 'Client Satisfaction' },
                  ]}
                />
              </div>
            </div>
          </section>

          {/* Services Section */}
          <section id="services">
            <div className="services-container">
              <div className="services-description">
                <h2>
                  Our Services
                </h2>
                <p>
                  Comprehensive IT solutions tailored to your needs
                </p>
              </div>

              <ServiceSectionList
                services={[
                  {
                    title: "Infrastructure",
                    description: [
                      "Solid expertise in managing and orchestrating your infrastructures with cloud-native solutions.",
                    ],
                    icon: "services-1.jpg",
                  },
                  {
                    title: "Development",
                    description: [
                      "Performant, distributed, robust and maintainable applications built with modern technologies.",
                    ],
                    icon: "services-2.jpg",
                  },
                  {
                    title: "Security",
                    description: [
                      "Full degree security consultancy, from system architecture to application security.",
                    ],
                    icon: "services-3.jpg",
                  },
                ]}
              />
            </div>
          </section>

          {/* Partners Section */}
          <section id="partners">
            <div style={{
              maxWidth: '1200px',
              margin: '0 auto',
            }}>
              <div className="partners-container">
                <h2>
                  Our Partners
                </h2>
                <p>
                  Trusted by industry leaders
                </p>
              </div>

              <GlassPanel
                width="100%"
                height={200}
                blur={40}
                glassColor='rgba(255, 174, 0, 0.1)'
                style={{
                  background: 'rgba(255, 174, 0, 0.06)',
                }}
              >
                <div className="partners-list">
                  {[{ name: 'RedHat', icon: "partners/redhat.png" }, { name: 'VMware', icon: "partners/vmware.png" }, { name: 'Engineering', icon: "partners/engineering.png" }].map((partner, index) => (
                    <div key={index} className="partners-listed">
                      <Image
                        src={partner.icon}
                        alt={partner.name}
                        width={150}
                        height={150}
                        className="partners-images"
                      />
                      <p style={{ width: '100%' }}>{partner.name}</p>
                    </div>
                  ))}
                </div>
              </GlassPanel>
            </div>
          </section>

          {/* Contact Section */}
          <section id="contact" className="contact-section">
            <div className="contact-container">
              <div className="contact-header">
                <h2>Get in Touch</h2>
                <p>Let&apo;s discuss how we can help transform your business</p>
              </div>

              <ContactSectionList
                contacts={[
                  {
                    icon: 'icons/location.png',
                    title: 'Address',
                    content: ['Via Paolo Buzzi, 61', '00143 ROMA (RM), ITALIA'],
                  },
                  {
                    icon: 'icons/mail.png',
                    title: 'Email',
                    content: ['amministrazione@sfbs.it'],
                  },
                  {
                    icon: 'icons/residential.png',
                    title: 'Business Info',
                    content: ['P.IVA: 17782391001'],
                  },
                ]}
              />

              <div className="contact-button">
                <GlassButton
                  className="contact-glass-button"
                  variant="secondary"
                  onClick={() => window.location.href = 'mailto:amministrazione@sfbs.it'}
                >
                  Contact Us Now
                </GlassButton>
              </div>
            </div>
          </section>
        </GlassPanel>

        {/* Footer */}
        <footer className="footer">
          <GlassPanel className="glass-panel-footer"
            width={'100%'}
            height={80}
            blur={25}
            glassColor="rgba(255, 255, 255, 0.03)"
          >
            <div className="social-button-container">
              <div style={{
                display: 'flex',
                gap: '20px',
              }}>
                <SocialButtonList
                  links={[
                    { name: 'LinkedIn', link: 'https://it.linkedin.com/company/sfb-srl' },
                    { name: 'GitHub', link: 'https://github.com/Serp1co' }
                  ]}
                />
              </div>
            </div>
          </GlassPanel>
        </footer>
      </div>
    </div>
  );
}