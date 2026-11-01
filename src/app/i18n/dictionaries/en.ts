import type { Dictionary } from "./types";

const en: Dictionary = {
  meta: {
    title: "SFB S.R.L. | Infrastructure, development and security consulting",
    description:
      "SFB is an IT consultancy in Rome with deep open-source expertise. One team for infrastructure, development and security, with no hand-offs.",
    serviceTitle: "{practice} | SFB S.R.L.",
  },
  common: {
    newTab: "opens in a new tab",
  },
  header: {
    homeAria: "SFB S.R.L., home",
    skipToContent: "Skip to content",
    primaryNav: "Main navigation",
    languageNav: "Language",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    cta: "Contact us",
    nav: {
      home: "Home",
      about: "About",
      services: "Services",
      partners: "Partners",
      contact: "Contact",
    },
  },
  hero: {
    claimLead: "Infrastructure, development and security.",
    claimEmphasis: "One team, no hand-offs.",
    lead: "An IT consultancy in Rome with deep open-source expertise. The same team designs, builds and secures what you run.",
    primaryCta: "Contact us",
    secondaryCta: "See services",
  },
  about: {
    title: "About SFB",
    subtitle: "Infrastructure, development and security, with the same team.",
    missionTitle: "Our mission",
    approachTitle: "Our approach",
    lead: "We help organisations transform and thrive in a fast-moving digital landscape. Our team of seasoned technology professionals shares a passion for open-source collaboration and a commitment to meaningful results.",
    points: [
      {
        title: "One team, no hand-offs",
        body: "Infrastructure, development and security sit with the same people, so a decision made at one layer is never lost at the next.",
      },
      {
        title: "Open source, in depth",
        body: "We build robust solutions on open-source technologies such as OpenShift, Keycloak, Quarkus and Kafka, and we learn and share with the community.",
      },
      {
        title: "Close to the client",
        body: "We work closely with each client on a strategy that fits, and aim for measurable growth through innovation.",
      },
    ],
  },
  services: {
    title: "Services",
    lead: "Three practices, one team.",
    learnMore: "Learn more",
    learnMoreSr: "about {practice}",
  },
  partners: {
    title: "Partners and customers",
    lead: "The vendors we work with, and the organisations we work for.",
    partnersLabel: "Technology partners",
    customersLabel: "Customers",
    sharedNote: "Red Hat is both a partner and a customer.",
  },
  contact: {
    title: "Get in touch",
    lead: "Tell us what you are working on.",
    emailCta: "Email us",
    copyCta: "Copy address",
    copied: "Address copied",
    copyFailed: "Could not copy. Select the address instead.",
    linkedinCta: "LinkedIn page",
    githubCta: "Open source on GitHub",
    addressLabel: "Address",
    emailLabel: "Email",
    businessLabel: "Business info",
    vatLabel: "VAT number",
  },
  footer: {
    tagline: "SFB S.R.L. — Strive For Better",
  },
  servicePage: {
    deliverTitle: "What we deliver",
    techTitle: "Technologies we use",
    ctaTitle: "Talk to the team about {practice}",
    ctaBody: "Tell us what you are working on and we will tell you how our {practice} expertise can help.",
    ctaButton: "Contact us",
    otherTitle: "Other practices",
    allServices: "All services",
  },
  practices: {
    infrastructure: {
      title: "Infrastructure",
      summary: "Solid expertise in managing and orchestrating your infrastructures with cloud-native solutions.",
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
    },
    development: {
      title: "Development",
      summary: "Performant, distributed, robust and maintainable applications built with modern technologies.",
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
    },
    security: {
      title: "Security",
      summary: "Security consultancy at every level, from system architecture to application security.",
      heroSubtitle: "End-to-End Security Consultancy",
      detailedDescription:
        "Security is not an afterthought — it’s woven into every layer of what we build. From identity management and access control to container platform hardening, compliance frameworks, and AI-specific threat modelling, we provide holistic security consulting that protects your organization without slowing it down.",
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
    },
  },
};

export default en;
