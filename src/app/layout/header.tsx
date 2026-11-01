"use client";

import { useEffect, useRef, useState, type JSX, type KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useActiveSection } from "../hooks";
import { SECTION_IDS } from "../data/site-data";
import type { Dictionary } from "../i18n/dictionaries/types";
import { LOCALES, LOCALE_NAMES, type Locale } from "../i18n/locales";
import { ChevronDownIcon, CloseIcon, MailIcon, MenuIcon } from "../components/icons";

export interface HeaderPractice {
  slug: string;
  title: string;
  href: string;
}

interface HeaderProps {
  locale: Locale;
  /** Landing page: nav items are in-page anchors. Elsewhere they link back to it. */
  isHome: boolean;
  homeHref: string;
  /** Where the same page lives in each language, for the language switch. */
  hrefByLocale: Record<Locale, string>;
  /** Slug of the practice page being viewed, if any. */
  activeService?: string;
  email: string;
  labels: Dictionary["header"];
  practices: HeaderPractice[];
}

const NO_SECTIONS: readonly string[] = [];

/**
 * In-page anchors stay plain links (native smooth scroll); links from other
 * pages use client navigation. Defined at module level so it keeps its
 * identity between renders and never drops keyboard focus.
 */
function NavAnchor({
  isHome,
  href,
  current,
  className,
  onClick,
  anchorRef,
  children,
}: {
  isHome: boolean;
  href: string;
  current: boolean;
  className?: string;
  onClick?: () => void;
  anchorRef?: React.Ref<HTMLAnchorElement>;
  children: React.ReactNode;
}): JSX.Element {
  const common = {
    className,
    onClick,
    "aria-current": current ? ("true" as const) : undefined,
    ref: anchorRef,
  };
  return isHome ? (
    <a href={href} {...common}>
      {children}
    </a>
  ) : (
    <Link href={href} {...common}>
      {children}
    </Link>
  );
}

const NAV: { id: (typeof SECTION_IDS)[number]; key: keyof Dictionary["header"]["nav"] }[] = [
  { id: "hero", key: "home" },
  { id: "about", key: "about" },
  { id: "services", key: "services" },
  { id: "partners", key: "partners" },
  { id: "contact", key: "contact" },
];

export default function Header({
  locale,
  isHome,
  homeHref,
  hrefByLocale,
  activeService,
  email,
  labels,
  practices,
}: HeaderProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuDismissed, setMenuDismissed] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const servicesLinkRef = useRef<HTMLAnchorElement>(null);
  const activeSection = useActiveSection(isHome ? SECTION_IDS : NO_SECTIONS);

  const targetHref = (id: string) => (isHome ? `#${id}` : `${homeHref}#${id}`);
  /** On a practice page the Services item stays lit; on the landing page the scroll position decides. */
  const isCurrent = (id: string) => (isHome ? activeSection === id : id === "services");

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const closeMenus = () => setMenuOpen(false);

  const onServicesKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.key === "Escape") {
      setMenuDismissed(true);
      servicesLinkRef.current?.focus();
    }
  };

  return (
    <header className="site-header">
      <div className="header-bar glass">
        <Link href={homeHref} className="header-logo" aria-label={labels.homeAria} onClick={closeMenus}>
          <Image src="/sfbs-logo-light.png" alt="" width={601} height={244} priority />
        </Link>

        <nav className="nav" aria-label={labels.primaryNav}>
          <ul className="nav-list">
            {NAV.map(({ id, key }) =>
              id === "services" ? (
                <li
                  key={id}
                  className="nav-item has-menu"
                  data-dismissed={menuDismissed}
                  onKeyDown={onServicesKeyDown}
                  onMouseLeave={() => setMenuDismissed(false)}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) setMenuDismissed(false);
                  }}
                >
                  <NavAnchor
                    isHome={isHome}
                    href={targetHref(id)}
                    current={isCurrent(id)}
                    className="nav-link"
                    anchorRef={servicesLinkRef}
                  >
                    {labels.nav[key]}
                    <ChevronDownIcon className="icon nav-chevron" />
                  </NavAnchor>
                  <ul className="nav-menu glass">
                    {practices.map((practice) => (
                      <li key={practice.slug}>
                        <Link
                          href={practice.href}
                          aria-current={activeService === practice.slug ? "true" : undefined}
                        >
                          {practice.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : (
                <li key={id} className="nav-item">
                  <NavAnchor isHome={isHome} href={targetHref(id)} current={isCurrent(id)} className="nav-link">
                    {labels.nav[key]}
                  </NavAnchor>
                </li>
              ),
            )}
          </ul>
        </nav>

        <div className="header-actions">
          <nav className="lang" aria-label={labels.languageNav}>
            {LOCALES.map((code) => (
              <a
                key={code}
                href={hrefByLocale[code]}
                lang={code}
                hrefLang={code}
                aria-current={code === locale ? "true" : undefined}
                aria-label={LOCALE_NAMES[code]}
              >
                {code.toUpperCase()}
              </a>
            ))}
          </nav>

          <a className="btn btn-primary btn-sm header-cta" href={`mailto:${email}`}>
            <MailIcon />
            {labels.cta}
          </a>

          <button
            ref={menuButtonRef}
            type="button"
            className="menu-button"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? labels.closeMenu : labels.openMenu}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      <div id="mobile-menu" className="mobile-menu glass" hidden={!menuOpen}>
        <nav aria-label={labels.primaryNav}>
          <ul>
            {NAV.map(({ id, key }) => (
              <li key={id}>
                <NavAnchor isHome={isHome} href={targetHref(id)} current={isCurrent(id)} onClick={closeMenus}>
                  {labels.nav[key]}
                </NavAnchor>
                {id === "services" && (
                  <ul className="mobile-sub">
                    {practices.map((practice) => (
                      <li key={practice.slug}>
                        <Link
                          href={practice.href}
                          onClick={closeMenus}
                          aria-current={activeService === practice.slug ? "true" : undefined}
                        >
                          {practice.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <a className="btn btn-primary" href={`mailto:${email}`} onClick={closeMenus}>
          <MailIcon />
          {labels.cta}
        </a>
      </div>
    </header>
  );
}
