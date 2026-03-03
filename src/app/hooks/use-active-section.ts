"use client";

import { useEffect, useState } from "react";

/**
 * Tracks which page section currently contains the viewport center.
 *
 * @param sectionIds – ordered list of DOM ids to observe.
 * @param fallback   – value returned when no section matches (defaults to first id).
 */
export function useActiveSection(
  sectionIds: readonly string[],
  fallback?: string,
): string {
  const defaultSection = fallback ?? sectionIds[0] ?? "";
  const [activeSection, setActiveSection] = useState(defaultSection);

  useEffect(() => {
    const handleScroll = () => {
      const scrollCenter = window.scrollY + window.innerHeight / 2;
      let current = defaultSection;

      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          const top = window.scrollY + rect.top;
          const bottom = top + rect.height;
          if (scrollCenter >= top && scrollCenter < bottom) {
            current = id;
            break;
          }
        }
      }
      setActiveSection(current);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [sectionIds, defaultSection]);

  return activeSection;
}
