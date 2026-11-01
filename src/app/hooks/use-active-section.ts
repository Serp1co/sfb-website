"use client";

import { useEffect, useState } from "react";

/**
 * Tracks which page section currently contains the viewport centre.
 * Pass an empty list to switch it off (for example on pages without sections).
 *
 * @param sectionIds – ordered list of DOM ids to observe.
 */
export function useActiveSection(sectionIds: readonly string[]): string {
  const [activeSection, setActiveSection] = useState(sectionIds[0] ?? "");

  useEffect(() => {
    if (sectionIds.length === 0) return;

    let frame = 0;

    const update = () => {
      frame = 0;
      const center = window.scrollY + window.innerHeight / 2;
      let current = sectionIds[0];

      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = window.scrollY + el.getBoundingClientRect().top;
        if (center >= top && center < top + el.offsetHeight) {
          current = id;
          break;
        }
      }
      setActiveSection(current);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sectionIds]);

  return activeSection;
}
