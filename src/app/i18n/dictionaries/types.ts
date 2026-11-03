import type { ServiceSlug } from "../../data/site-data";

export interface ServiceCopy {
  title: string;
  /** One sentence shown on the landing page. */
  summary: string;
  heroSubtitle: string;
  detailedDescription: string;
  features: { title: string; description: string }[];
}

export interface Dictionary {
  meta: {
    title: string;
    description: string;
    /** `{practice}` is the practice name. A service page's description is its summary. */
    serviceTitle: string;
  };
  common: {
    newTab: string;
    /**
     * The ambient-animation toggle (WCAG 2.2.2) in the footer bar and the mobile menu. Each label
     * names the action a press takes, so the label changes with the state.
     */
    motion: { pause: string; play: string };
  };
  header: {
    homeAria: string;
    skipToContent: string;
    primaryNav: string;
    languageNav: string;
    openMenu: string;
    closeMenu: string;
    cta: string;
    nav: { home: string; about: string; services: string; partners: string; contact: string };
  };
  hero: {
    /**
     * The h1 under the logo, one short phrase per practice, read as one line ("Infrastructure.
     * Development. Security."). The hero holds nothing else (owner, 2026-11-02): the header keeps
     * the contact action and the services section the ways into the practices. Each phrase keeps
     * its own line on a phone, so the line never breaks inside a pair.
     */
    tagline: string[];
  };
  about: {
    title: string;
    subtitle: string;
    missionTitle: string;
    approachTitle: string;
    lead: string;
    points: { title: string; body: string }[];
  };
  services: {
    title: string;
    lead: string;
    learnMore: string;
    /** Screen-reader suffix. `{practice}` is the practice name. */
    learnMoreSr: string;
  };
  partners: {
    title: string;
    lead: string;
    partnersLabel: string;
    customersLabel: string;
  };
  contact: {
    title: string;
    lead: string;
    emailCta: string;
    copyCta: string;
    copied: string;
    copyFailed: string;
    linkedinCta: string;
    githubCta: string;
    addressLabel: string;
    emailLabel: string;
    businessLabel: string;
    vatLabel: string;
  };
  footer: {
    tagline: string;
  };
  servicePage: {
    deliverTitle: string;
    techTitle: string;
    /** `{practice}` is the lowercase practice name. */
    ctaTitle: string;
    ctaBody: string;
    ctaButton: string;
    otherTitle: string;
    allServices: string;
  };
  practices: Record<ServiceSlug, ServiceCopy>;
}
