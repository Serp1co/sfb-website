/* ------------------------------------------------------------------ */
/*  Language-neutral site data: ids, slugs, names, links, assets.     */
/*  Everything a visitor reads in a sentence lives in the locale      */
/*  dictionaries (src/app/i18n/dictionaries), not here.               */
/* ------------------------------------------------------------------ */

export const SECTION_IDS = ["hero", "about", "services", "partners", "contact"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const SERVICE_SLUGS = ["infrastructure", "development", "security"] as const;
export type ServiceSlug = (typeof SERVICE_SLUGS)[number];

export function isServiceSlug(value: string): value is ServiceSlug {
  return (SERVICE_SLUGS as readonly string[]).includes(value);
}

/** Technologies are proper names, so they are shared across languages. */
export const SERVICE_TECHNOLOGIES: Record<ServiceSlug, string[]> = {
  infrastructure: [
    "OpenShift", "Kubernetes", "Ansible", "Terraform", "VMware vSphere", "Aria Automation",
    "VRO", "KVM", "OpenShift Virt", "Commvault", "Prometheus", "Grafana",
  ],
  development: [
    "Quarkus", "Java", "Rust", "Python", "Kafka", "React", "PostgreSQL", "Red Hat Fuse",
    "OpenAPI", "Google ADK", "LiteLLM", "vLLM", "Ollama", "Stable Diffusion",
  ],
  security: [
    "Keycloak", "RHBK", "SPID/CIE", "Vault", "SELinux", "OAuth 2.0", "SAML", "OPA",
    "Falco", "Trivy", "cert-manager",
  ],
};

/** Card images on the landing page. Decorative: the practice name sits right beside them. */
export const SERVICE_IMAGES: Record<ServiceSlug, string> = {
  infrastructure: "/services-1.jpg",
  development: "/services-2.jpg",
  security: "/services-3.jpg",
};

/* -- Partners / Customers ------------------------------------------ */

export interface PartnerItem {
  name: string;
  icon: string;
  /** The asset already has its own one-tone treatment; skip the CSS filter. */
  preToned?: boolean;
}

/**
 * Red Hat's mono asset keeps the hat band as a grey secondary tone (white at 38%, like evoila's
 * secondary shapes): the CSS one-tone filter would merge the black band into the white hat.
 */
const RED_HAT: PartnerItem = { name: "Red Hat", icon: "/partners/redhat-mono.svg", preToned: true };

export const PARTNERS: PartnerItem[] = [
  RED_HAT,
  { name: "Commvault", icon: "/partners/commvault.svg" },
  { name: "NetApp", icon: "/partners/netapp.svg" },
  { name: "Nutanix", icon: "/partners/nutanix.svg" },
];

export const CUSTOMERS: PartnerItem[] = [
  RED_HAT,
  { name: "Engineering", icon: "/partners/engineering.svg" },
  { name: "evoila", icon: "/partners/evoila-mono.svg", preToned: true },
  { name: "Reply", icon: "/partners/reply.svg" },
  { name: "TAI", icon: "/partners/tai.svg" },
];

/* -- Company ------------------------------------------------------- */

export const CONTACT_EMAIL = "amministrazione@sfbs.it";
export const ADDRESS_LINES = ["Viale Luca Gaurico, 93", "00143 ROMA (RM), ITALIA"] as const;
export const VAT_NUMBER = "17782391001";

/* -- Social -------------------------------------------------------- */

export interface SocialLink {
  name: string;
  link: string;
}

export const LINKEDIN: SocialLink = { name: "LinkedIn", link: "https://it.linkedin.com/company/sfb-srl" };
export const GITHUB: SocialLink = { name: "GitHub", link: "https://github.com/Serp1co" };
export const SOCIAL_LINKS: SocialLink[] = [LINKEDIN, GITHUB];
