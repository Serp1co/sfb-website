import type { Dictionary } from "./types";

/**
 * Italian copy. Drafted by Claude; to be reviewed by the owner.
 * Register: "tu" for buttons and direct address, impersonal elsewhere.
 * Technology and product names stay in English on purpose.
 */
const it: Dictionary = {
  meta: {
    title: "SFB S.R.L. | Consulenza su infrastruttura, sviluppo e sicurezza",
    description:
      "SFB è una società di consulenza IT di Roma con solida esperienza open source. Un solo team per infrastruttura, sviluppo e sicurezza, senza passaggi di consegne.",
    serviceTitle: "{practice} | SFB S.R.L.",
  },
  common: {
    newTab: "si apre in una nuova scheda",
    // Draft, for the owner's review.
    motion: { pause: "Ferma animazione", play: "Avvia animazione" },
  },
  header: {
    homeAria: "SFB S.R.L., home",
    skipToContent: "Vai al contenuto",
    primaryNav: "Navigazione principale",
    languageNav: "Lingua",
    openMenu: "Apri il menu",
    closeMenu: "Chiudi il menu",
    cta: "Contattaci",
    nav: {
      home: "Home",
      about: "Chi siamo",
      services: "Servizi",
      partners: "Partner",
      contact: "Contatti",
    },
  },
  hero: {
    // Draft, for the owner's review: the English line, phrase for phrase.
    tagline: ["Infrastruttura.", "Sviluppo.", "Sicurezza."],
  },
  about: {
    title: "Chi siamo",
    subtitle: "Infrastruttura, sviluppo e sicurezza, con lo stesso team.",
    missionTitle: "La nostra missione",
    approachTitle: "Il nostro approccio",
    lead: "Aiutiamo le organizzazioni a trasformarsi e a crescere in un panorama digitale in continua evoluzione. Il nostro team di professionisti esperti condivide la passione per la collaborazione open source e l’impegno a ottenere risultati concreti.",
    points: [
      {
        title: "Un solo team, nessun passaggio di consegne",
        body: "Infrastruttura, sviluppo e sicurezza sono nelle mani delle stesse persone: una decisione presa a un livello non si perde al livello successivo.",
      },
      {
        title: "Open source, in profondità",
        body: "Realizziamo soluzioni solide su tecnologie open source come OpenShift, Keycloak, Quarkus e Kafka, e impariamo e condividiamo con la community.",
      },
      {
        title: "Vicini al cliente",
        body: "Lavoriamo a stretto contatto con ogni cliente su una strategia su misura, puntando a una crescita misurabile attraverso l’innovazione.",
      },
    ],
  },
  services: {
    title: "Servizi",
    lead: "Tre aree di competenza, un solo team.",
    learnMore: "Approfondisci",
    learnMoreSr: "su {practice}",
  },
  partners: {
    title: "Partner e clienti",
    lead: "I vendor con cui collaboriamo e le organizzazioni per cui lavoriamo.",
    partnersLabel: "Partner tecnologici",
    customersLabel: "Clienti",
  },
  contact: {
    title: "Contatti",
    lead: "Raccontaci su cosa stai lavorando.",
    emailCta: "Scrivici",
    copyCta: "Copia l’indirizzo",
    copied: "Indirizzo copiato",
    copyFailed: "Impossibile copiare. Seleziona l’indirizzo.",
    linkedinCta: "Pagina LinkedIn",
    githubCta: "Open source su GitHub",
    addressLabel: "Indirizzo",
    emailLabel: "Email",
    businessLabel: "Dati aziendali",
    vatLabel: "Partita IVA",
  },
  footer: {
    tagline: "SFB S.R.L. — Strive For Better",
  },
  servicePage: {
    deliverTitle: "Cosa realizziamo",
    techTitle: "Tecnologie che utilizziamo",
    ctaTitle: "Parla con il team di {practice}",
    ctaBody: "Raccontaci su cosa stai lavorando: ti diremo come la nostra esperienza in {practice} può aiutarti.",
    ctaButton: "Contattaci",
    otherTitle: "Altre aree",
    allServices: "Tutti i servizi",
  },
  practices: {
    infrastructure: {
      title: "Infrastruttura",
      summary: "Progettiamo, automatizziamo e gestiamo piattaforme cloud-native, dai cluster OpenShift e Kubernetes a storage, backup e monitoraggio.",
      heroSubtitle: "Soluzioni cloud-native e orchestrazione",
      detailedDescription:
        "Progettiamo, distribuiamo e gestiamo infrastrutture resilienti che crescono con il tuo business. Dai data center on-premise agli ambienti hybrid cloud, il nostro team porta una profonda esperienza in orchestrazione di container, automazione e osservabilità per mantenere i sistemi al massimo delle prestazioni.",
      features: [
        {
          title: "Orchestrazione di container",
          description:
            "Installazioni Kubernetes e OpenShift di livello produttivo, con scalabilità automatica, workload auto-riparanti e gestione multi-cluster.",
        },
        {
          title: "Infrastructure as Code",
          description:
            "Ambienti riproducibili e versionati con Ansible, Terraform e flussi GitOps, per deployment coerenti in tutte le fasi.",
        },
        {
          title: "Hybrid e multi-cloud",
          description:
            "Integrazione fluida tra ambienti on-premise, cloud privati e pubblici, per ottimizzare costi, conformità e prestazioni.",
        },
        {
          title: "Monitoraggio e osservabilità",
          description:
            "Visibilità end-to-end con logging centralizzato, distributed tracing e allerte in tempo reale, per individuare e risolvere i problemi prima che raggiungano gli utenti.",
        },
        {
          title: "Virtualizzazione",
          description:
            "Virtualizzazione enterprise su tutto lo stack, da VMware vSphere e Aria a piattaforme basate su KVM e OpenShift Virtualization, con percorsi di migrazione da VM a container e gestione unificata dei carichi di lavoro misti.",
        },
        {
          title: "Datacenter e infrastruttura fisica",
          description:
            "Architettura del datacenter, capacity planning, progettazione del network fabric e gestione del ciclo di vita, inclusi storage tiering, strategie di backup, pianificazione dei siti di disaster recovery e collocazione dei carichi tra availability zone.",
        },
        {
          title: "Soluzioni di storage enterprise",
          description:
            "Progettazione e gestione di piattaforme SAN, NAS e software-defined storage, con capacity planning, tuning delle prestazioni, policy di snapshot, strategie di replica e integrazione con piattaforme di virtualizzazione e container per il provisioning di volumi persistenti.",
        },
        {
          title: "Backup e protezione dei dati",
          description:
            "Strategie di backup e ripristino enterprise basate su Commvault e piattaforme analoghe: pianificazione guidata da policy, deduplica, replica tra siti, ripristino granulare e gestione del ciclo di conservazione dei dati conforme alle normative.",
        },
        {
          title: "Aria Automation e orchestrazione",
          description:
            "VMware Aria Automation per il provisioning self-service dell’infrastruttura, deployment basati su blueprint, gestione multi-cloud delle risorse e orchestrazione end-to-end dei workflow, incluso lo sviluppo di package VRO, integrazioni di risorse personalizzate e pipeline di governance con approvazioni.",
        },
      ],
    },
    development: {
      title: "Sviluppo",
      summary: "Sviluppiamo software distribuito e manutenibile, dai servizi Quarkus e dagli stream di eventi Kafka alle API e al rilascio automatizzato.",
      heroSubtitle: "Applicazioni moderne, distribuite e manutenibili",
      detailedDescription:
        "Costruiamo software che dura. La nostra area di sviluppo unisce ecosistemi Java enterprise, pattern reattivi moderni, architetture event-driven e rigore ingegneristico per realizzare applicazioni veloci, affidabili e piacevoli da mantenere.",
      features: [
        {
          title: "Enterprise Java e Quarkus",
          description:
            "Microservizi cloud-native su Quarkus e Jakarta EE: avvio rapido, basso consumo di memoria e integrazione nativa con Kubernetes.",
        },
        {
          title: "Architetture event-driven",
          description:
            "Sistemi scalabili e disaccoppiati basati su Apache Kafka e Confluent Platform, per lo streaming dei dati in tempo reale e l’elaborazione affidabile dei messaggi.",
        },
        {
          title: "Progettazione e integrazione di API",
          description:
            "API REST e GraphQL con documentazione completa, strategie di versionamento e middleware di integrazione per connettere sistemi eterogenei.",
        },
        {
          title: "CI/CD e DevOps",
          description:
            "Pipeline di build, test e deployment completamente automatizzate, per una consegna rapida e sicura dal commit alla produzione.",
        },
        {
          title: "Programmazione di sistema e scripting",
          description:
            "Strumenti di sistema ad alte prestazioni in Rust, tra cui integrazioni eBPF, connection pooling SSH e agenti di monitoraggio della sicurezza, insieme a Python per scripting di automazione, pipeline di dati e prototipazione rapida di servizi applicativi.",
        },
        {
          title: "Sviluppo AI e agentico",
          description:
            "Ingegneria di applicazioni AI end-to-end: orchestrazione di workflow agentici con Google ADK e LiteLLM, prompt engineering avanzato (chain-of-thought, tree-of-thought, prompt steering e hardening contro la prompt injection), architetture di LLM security gate e sistemi di validazione multi-agente basati sui principi SOLID.",
        },
        {
          title: "Infrastruttura ML e operations dei modelli",
          description:
            "Solida competenza su architetture transformer e di diffusione, dal fine-tuning e dalla distillazione al deployment in produzione con vLLM, Ollama e pipeline MLOps native per Kubernetes. Strategie di deployment all’edge, architetture di inferenza multi-slot e configurazione dei sampler per comportamenti dei modelli guidati dalla personalità.",
        },
      ],
    },
    security: {
      title: "Sicurezza",
      summary: "Proteggiamo identità, applicazioni e piattaforme, dal single sign-on con Keycloak e SPID/CIE alla sicurezza dei container e alla conformità.",
      heroSubtitle: "Consulenza sulla sicurezza end-to-end",
      detailedDescription:
        "La sicurezza non è un ripensamento: è integrata in ogni livello di ciò che costruiamo. Dalla gestione delle identità e del controllo degli accessi all’hardening delle piattaforme container, dai framework di conformità al threat modelling specifico per l’AI, offriamo una consulenza di sicurezza completa che protegge la tua organizzazione senza rallentarla.",
      features: [
        {
          title: "Identity & Access Management",
          description:
            "SSO enterprise, federazione e autorizzazione granulare con Keycloak / RHBK, con supporto a SAML 2.0, OpenID Connect e identità digitali nazionali come SPID e CIE.",
        },
        {
          title: "Sicurezza applicativa",
          description:
            "Pratiche di secure coding, scansione delle dipendenze, integrazione SAST/DAST e protezione a runtime per rendere le applicazioni resistenti ai vettori di attacco moderni.",
        },
        {
          title: "Conformità e governance",
          description:
            "Applicazione di policy as code, gestione degli audit trail e allineamento a standard di settore tra cui GDPR, ISO 27001 e le linee guida OWASP.",
        },
        {
          title: "Hardening dell’infrastruttura",
          description:
            "Configurazione SELinux, segmentazione di rete, gestione dei segreti e progettazione di architetture zero-trust per ridurre al minimo la superficie di attacco.",
        },
        {
          title: "Sicurezza di container e cloud",
          description:
            "Operatività OpenShift e Kubernetes orientata alla sicurezza: pod security standard, scansione delle vulnerabilità delle immagini, rilevamento delle minacce a runtime, admission controller e integrità della supply chain con immagini container firmate e SBOM.",
        },
        {
          title: "Gestione di rete e certificati",
          description:
            "Applicazione di TLS/mTLS sui service mesh, gestione automatizzata del ciclo di vita dei certificati, progettazione delle policy di firewall e ispezione del traffico cifrato, per garantire riservatezza end-to-end senza aggravio operativo.",
        },
        {
          title: "Sicurezza AI e LLM",
          description:
            "Prompt engineering difensivo contro injection e jailbreak, guardrail e filtri di contenuto sull’output degli LLM, sanificazione degli input dei modelli, test di robustezza avversariale e progettazione di pipeline di inferenza sicure con audit logging e controllo degli accessi a livello di token.",
        },
      ],
    },
  },
};

export default it;
