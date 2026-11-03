"use client";

import { useEffect, useRef, useState, type JSX, type KeyboardEvent, type ReactNode, type Ref } from "react";
import Image from "next/image";
import Link from "next/link";
import { useActiveSection } from "../hooks";
import { SECTION_IDS } from "../data/site-data";
import type { Dictionary } from "../i18n/dictionaries/types";
import { LOCALES, LOCALE_NAMES, type Locale } from "../i18n/locales";
import { ChevronDownIcon, CloseIcon, MailIcon, MenuIcon } from "../components/icons";
import MotionToggle from "../components/motion-toggle";

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
  /** The pause control's labels: below 960 px the menu is the nearest place to reach it. */
  motionLabels: Dictionary["common"]["motion"];
  practices: HeaderPractice[];
}

const NO_SECTIONS: readonly string[] = [];

/**
 * The bar takes the lockup with light letters (owner, 2026-11-02): the hero's sfb-logo.svg has
 * black ones, which the hero outlines in white, and on the small dark bar they would vanish.
 */
const HEADER_LOGO = "/sfb-logo-light.svg";

/**
 * In-page anchors stay plain `#id` links: the motion runtime scrolls them (smoothly, in the same
 * frame as the WebGL glass) and moves focus to the target. Links from other pages use client
 * navigation. Defined at module level so it keeps its identity between renders and never drops
 * keyboard focus.
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
  anchorRef?: Ref<HTMLAnchorElement>;
  children: ReactNode;
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
  motionLabels,
  practices,
}: HeaderProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuDismissed, setMenuDismissed] = useState(false);
  const [servicesHovered, setServicesHovered] = useState(false);
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

  // A menu opened by hover must close on Escape too (WCAG 1.4.13), and focus may be anywhere then:
  // the li's own handler below only hears keys while focus is inside it.
  useEffect(() => {
    if (!servicesHovered) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setMenuDismissed(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [servicesHovered]);

  const closeMenus = () => setMenuOpen(false);

  const onServicesKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.key === "Escape") {
      setMenuDismissed(true);
      servicesLinkRef.current?.focus();
    }
  };

  /*
   * One glass layer: the bar. Everything inside it is a flat tint (the CTA, the menu button) or,
   * for the Services menu, a near-opaque fill, because a blur nested in the bar samples nothing.
   * The mobile menu is the bar's sibling, so it is real glass of its own.
   */
  return (
    <header className="site-header">
      <div className="header-bar glass">
        {/* On the landing page the logo is the way back to the top: a same-URL Link would not
            scroll, while #hero takes the runtime's anchor path (smooth scroll, focus moved). */}
        {isHome ? (
          <a href="#hero" className="header-logo" aria-label={labels.homeAria} onClick={closeMenus}>
            <Image src={HEADER_LOGO} alt="" width={601} height={244} preload />
          </a>
        ) : (
          <Link href={homeHref} className="header-logo" aria-label={labels.homeAria} onClick={closeMenus}>
            <Image src={HEADER_LOGO} alt="" width={601} height={244} preload />
          </Link>
        )}

        <nav className="nav" aria-label={labels.primaryNav}>
          <ul className="nav-list">
            {NAV.map(({ id, key }) =>
              id === "services" ? (
                <li
                  key={id}
                  className="nav-item has-menu"
                  data-dismissed={menuDismissed}
                  onKeyDown={onServicesKeyDown}
                  onMouseEnter={() => setServicesHovered(true)}
                  onMouseLeave={() => {
                    setServicesHovered(false);
                    setMenuDismissed(false);
                  }}
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
                  <ul className="nav-menu">
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
          {/* The name starts with the visible code ("EN – English"), so a speech command that
              says what it sees ("click EN") matches it (WCAG 2.5.3). */}
          <nav className="lang" aria-label={labels.languageNav}>
            {LOCALES.map((code) => (
              <a
                key={code}
                href={hrefByLocale[code]}
                lang={code}
                hrefLang={code}
                aria-current={code === locale ? "true" : undefined}
              >
                {code.toUpperCase()}
                <span className="sr-only"> – {LOCALE_NAMES[code]}</span>
              </a>
            ))}
          </nav>

          <a className="btn-flat btn-flat-primary btn-sm header-cta" href={`mailto:${email}`}>
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

      {/* data-lenis-prevent: the menu scrolls on its own when it is taller than the screen. */}
      <div id="mobile-menu" className="mobile-menu glass" hidden={!menuOpen} data-lenis-prevent="">
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
        <a className="btn-flat btn-flat-primary mobile-cta" href={`mailto:${email}`} onClick={closeMenus}>
          <MailIcon />
          {labels.cta}
        </a>
        <MotionToggle labels={motionLabels} className="motion-toggle-menu" />
      </div>
    </header>
  );
}
