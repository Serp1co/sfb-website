/* ------------------------------------------------------------------ */
/*  Static data for the site – edit here, not inside components.      */
/*  Supports the Open/Closed principle: add entries without touching  */
/*  rendering logic.                                                  */
/* ------------------------------------------------------------------ */

export const NAV_ITEMS = ["Home", "About", "Services", "Partners", "Contact"] as const;

export const SECTION_IDS = ["hero", "about", "services", "partners", "contact"] as const;

/** Maps a nav label to the corresponding section DOM id. */
export function navLabelToSectionId(label: string): string {
  return label.toLowerCase() === "home" ? "hero" : label.toLowerCase();
}

/* -- About --------------------------------------------------------- */

export const APPROACH_ITEMS = [
  "Leverage open-source technologies for robust solutions",
  "Partner closely with clients for custom strategies",
  "Foster continuous learning and community sharing",
  "Drive measurable growth through innovation",
] as const;

/* -- Stats --------------------------------------------------------- */

export interface StatItem {
  number: string;
  label: string;
}

export const STATS: StatItem[] = [
  { number: "50+", label: "Certifications" },
  { number: "42", label: "Projects" },
  { number: "16", label: "Partnerships" },
  { number: "100%", label: "Client Satisfaction" },
];

/* -- Services ------------------------------------------------------ */

export interface ServiceItem {
  title: string;
  description: string[];
  icon: string;
}

export const SERVICES: ServiceItem[] = [
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
];

/* -- Partners / Customers ------------------------------------------ */

export interface PartnerItem {
  name: string;
  icon: string;
}

export const PARTNERS: PartnerItem[] = [
  { name: "RedHat", icon: "partners/redhat.svg" },
];

export const CUSTOMERS: PartnerItem[] = [
  { name: "Engineering", icon: "partners/engineering.svg" },
    { name: "Evoila", icon: "partners/evoila.svg" },
    { name: "Reply", icon: "partners/reply.svg" },
    { name: "TAI", icon: "partners/tai.svg" },

];

/* -- Contact ------------------------------------------------------- */

export interface ContactItem {
  icon: string;
  title: string;
  content: string[];
}

export const CONTACTS: ContactItem[] = [
  {
    icon: "icons/location.png",
    title: "Address",
    content: ["Via Paolo Buzzi, 61", "00143 ROMA (RM), ITALIA"],
  },
  {
    icon: "icons/mail.png",
    title: "Email",
    content: ["amministrazione@sfbs.it"],
  },
  {
    icon: "icons/residential.png",
    title: "Business Info",
    content: ["P.IVA: 17782391001"],
  },
];

/* -- Social -------------------------------------------------------- */

export interface SocialLink {
  name: string;
  link: string;
}

export const SOCIAL_LINKS: SocialLink[] = [
  { name: "LinkedIn", link: "https://it.linkedin.com/company/sfb-srl" },
  { name: "GitHub", link: "https://github.com/Serp1co" },
];

/* -- Constants ----------------------------------------------------- */

export const CONTACT_EMAIL = "amministrazione@sfbs.it";
