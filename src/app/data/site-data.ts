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
  { number: "8", label: "Customers" },
  { number: "1", label: "Partnership" }
];

/* -- Services ------------------------------------------------------ */

export interface ServiceFeature {
  title: string;
  description: string;
}

export interface ServiceItem {
  title: string;
  slug: string;
  description: string[];
  icon: string;
  heroSubtitle: string;
  detailedDescription: string;
  features: ServiceFeature[];
  technologies: string[];
}

export const SERVICES: ServiceItem[] = [
  {
    title: "Infrastructure",
    slug: "infrastructure",
    description: [
      "Solid expertise in managing and orchestrating your infrastructures with cloud-native solutions.",
    ],
    icon: "services-1.jpg",
    heroSubtitle: "Cloud-Native Solutions & Orchestration",
    detailedDescription:
      "We design, deploy, and manage resilient infrastructure that scales with your business. From on-premise data centers to hybrid-cloud environments, our team brings deep expertise in container orchestration, automation, and observability to keep your systems running at peak performance.",
    features: [
      {
        title: "Container Orchestration",
        description:
          "Production-grade Kubernetes and OpenShift deployments with automated scaling, self-healing workloads, and multi-cluster management.",
      },
      {
        title: "Infrastructure as Code",
        description:
          "Reproducible, version-controlled environments using Ansible, Terraform, and GitOps workflows for consistent deployments across all stages.",
      },
      {
        title: "Hybrid & Multi-Cloud",
        description:
          "Seamless integration across on-premise, private, and public cloud providers — optimizing cost, compliance, and performance.",
      },
      {
        title: "Monitoring & Observability",
        description:
          "End-to-end visibility with centralized logging, distributed tracing, and real-time alerting to detect and resolve issues before they impact users.",
      },
      {
        title: "Virtualization",
        description:
          "Enterprise virtualization across the full stack — from VMware vSphere and Aria suites to KVM-based platforms and OpenShift Virtualization, enabling VM-to-container migration paths and unified management of mixed workloads.",
      },
      {
        title: "Datacenter & Physical Infrastructure",
        description:
          "Datacenter architecture, capacity planning, network fabric design, and lifecycle management — including storage tiering, backup strategies, disaster recovery site planning, and workload placement across availability zones.",
      },
      {
        title: "Enterprise Storage Solutions",
        description:
          "Design and management of SAN, NAS, and software-defined storage platforms — including capacity planning, performance tuning, snapshot policies, replication strategies, and integration with virtualization and container platforms for persistent volume provisioning.",
      },
      {
        title: "Backup & Data Protection",
        description:
          "Enterprise-grade backup and recovery strategies built on Commvault and similar platforms — covering policy-driven scheduling, deduplication, cross-site replication, granular restore capabilities, and compliance-ready data retention lifecycle management.",
      },
      {
        title: "Aria Automation & Orchestration",
        description:
          "VMware Aria Automation for self-service infrastructure provisioning, blueprint-driven deployments, multi-cloud resource management, and end-to-end workflow orchestration — including VRO package development, custom resource integrations, and approval-based governance pipelines.",
      },
    ],
    technologies: ["OpenShift", "Kubernetes", "Ansible", "Terraform", "VMware vSphere", "Aria Automation", "VRO", "KVM", "OpenShift Virt", "Commvault", "Prometheus", "Grafana"],
  },
  {
    title: "Development",
    slug: "development",
    description: [
      "Performant, distributed, robust and maintainable applications built with modern technologies.",
    ],
    icon: "services-2.jpg",
    heroSubtitle: "Modern, Distributed & Maintainable Applications",
    detailedDescription:
      "We build software that lasts. Our development practice combines enterprise-grade Java ecosystems with modern reactive patterns, event-driven architectures, and rigorous engineering discipline to deliver applications that are fast, reliable, and a joy to maintain.",
    features: [
      {
        title: "Enterprise Java & Quarkus",
        description:
          "Cloud-native microservices built on Quarkus and Jakarta EE — fast startup, low memory footprint, and seamless Kubernetes integration.",
      },
      {
        title: "Event-Driven Architecture",
        description:
          "Scalable, decoupled systems powered by Apache Kafka and Confluent Platform for real-time data streaming and reliable message processing.",
      },
      {
        title: "API Design & Integration",
        description:
          "RESTful and GraphQL APIs with comprehensive documentation, versioning strategies, and integration middleware for connecting disparate systems.",
      },
      {
        title: "CI/CD & DevOps",
        description:
          "Fully automated build, test, and deployment pipelines that ensure rapid, safe delivery from commit to production.",
      },
      {
        title: "Systems Programming & Scripting",
        description:
          "High-performance system-level tooling in Rust — including eBPF integrations, SSH connection pooling, and security monitoring agents — alongside Python for automation scripting, data pipelines, and rapid prototyping of application-layer services.",
      },
      {
        title: "AI & Agentic Development",
        description:
          "End-to-end AI application engineering: agentic workflow orchestration with Google ADK and LiteLLM, advanced prompt engineering including chain-of-thought, tree-of-thought, prompt steering and injection hardening, LLM security gate architectures, and multi-agent validation systems built on SOLID principles.",
      },
      {
        title: "ML Infrastructure & Model Operations",
        description:
          "Deep expertise in transformer and diffusion model architectures — from fine-tuning and distillation techniques to production deployment via vLLM, Ollama, and Kubernetes-native MLOps pipelines. Edge deployment strategies, multi-slot inference architectures, and sampler configuration for personality-driven model behavior.",
      },
    ],
    technologies: ["Quarkus", "Java", "Rust", "Python", "Kafka", "React", "PostgreSQL", "Red Hat Fuse", "OpenAPI", "Google ADK", "LiteLLM", "vLLM", "Ollama", "Stable Diffusion"],
  },
  {
    title: "Security",
    slug: "security",
    description: [
      "Full degree security consultancy, from system architecture to application security.",
    ],
    icon: "services-3.jpg",
    heroSubtitle: "End-to-End Security Consultancy",
    detailedDescription:
      "Security is not an afterthought — it's woven into every layer of what we build. From identity management and access control to container platform hardening, compliance frameworks, and AI-specific threat modelling, we provide holistic security consulting that protects your organization without slowing it down.",
    features: [
      {
        title: "Identity & Access Management",
        description:
          "Enterprise SSO, federation, and fine-grained authorization with Keycloak / RHBK, supporting SAML 2.0, OpenID Connect, and national identity schemes like SPID and CIE.",
      },
      {
        title: "Application Security",
        description:
          "Secure coding practices, dependency scanning, SAST/DAST integration, and runtime protection to harden applications against modern attack vectors.",
      },
      {
        title: "Compliance & Governance",
        description:
          "Policy-as-code enforcement, audit trail management, and alignment with industry standards including GDPR, ISO 27001, and OWASP guidelines.",
      },
      {
        title: "Infrastructure Hardening",
        description:
          "SELinux configuration, network segmentation, secrets management, and zero-trust architecture design to minimize attack surfaces.",
      },
      {
        title: "Container & Cloud Security",
        description:
          "Security-first OpenShift and Kubernetes operations — pod security standards, image vulnerability scanning, runtime threat detection, admission controllers, and supply chain integrity with signed container images and SBOMs.",
      },
      {
        title: "Network & Certificate Management",
        description:
          "TLS/mTLS enforcement across service meshes, automated certificate lifecycle management, firewall policy design, and encrypted traffic inspection — ensuring end-to-end confidentiality without operational overhead.",
      },
      {
        title: "AI & LLM Security",
        description:
          "Defensive prompt engineering against injection and jailbreak attacks, LLM output guardrails and content filtering gates, model input sanitization, adversarial robustness testing, and secure inference pipeline design with audit logging and token-level access control.",
      },
    ],
    technologies: ["Keycloak", "RHBK", "SPID/CIE", "Vault", "SELinux", "OAuth 2.0", "SAML", "OPA", "Falco", "Trivy", "cert-manager"],
  },
];

/* -- Partners / Customers ------------------------------------------ */

export interface PartnerItem {
  name: string;
  icon: string;
}

export const PARTNERS: PartnerItem[] = [
  { name: "RedHat", icon: "/partners/redhat.svg" },
];

export const CUSTOMERS: PartnerItem[] = [
    { name: "RedHat", icon: "/partners/redhat.svg" },
    { name: "Engineering", icon: "/partners/engineering.svg" },
    { name: "Evoila", icon: "/partners/evoila.svg" },
    { name: "Reply", icon: "/partners/reply.svg" },
    { name: "TAI", icon: "/partners/tai.svg" },

];

/* -- Contact ------------------------------------------------------- */

export interface ContactItem {
  icon: string;
  title: string;
  content: string[];
}

export const CONTACTS: ContactItem[] = [
  {
    icon: "/icons/location.png",
    title: "Address",
    content: ["Viale Luca Gaurico, 93", "00143 ROMA (RM), ITALIA"],
  },
  {
    icon: "/icons/mail.png",
    title: "Email",
    content: ["amministrazione@sfbs.it"],
  },
  {
    icon: "/icons/residential.png",
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
