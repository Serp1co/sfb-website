"use client";

import { useEffect, useState } from "react";
import { createLayoutBox, hasSize, measureLayoutBox } from "../glass/layout-box";
import { computeSectionKnots, sectionAtScroll } from "../motion/section-knots";

/**
 * Tracks which page section the reading is in: the last one whose top has passed the viewport
 * centre, with the same reachable-span rule as the scene's story (motion/section-knots.ts). A
 * short last section is current at the scroll limit even when its top never reaches the centre
 * (Contact on a 4K or portrait screen, right after clicking "Contact"), and a short first one at
 * the top. Pass an empty list to switch it off (for example on pages without sections).
 *
 * Section boxes and the scroll limit are measured only when the layout changes (resize observer,
 * window resize), never per scroll frame: smooth scroll fires a scroll event every frame, and a
 * layout read in each one would force a reflow per frame. Boxes are layout boxes, so reveal
 * transforms never skew them.
 *
 * @param sectionIds – ordered list of DOM ids to observe.
 */
export function useActiveSection(sectionIds: readonly string[]): string {
  const [activeSection, setActiveSection] = useState(sectionIds[0] ?? "");

  useEffect(() => {
    if (sectionIds.length === 0) return;

    const sections = sectionIds.map((id) => ({ id, element: document.getElementById(id), box: createLayoutBox() }));
    /** The measured sections that are laid out, in order, with their tops. */
    const laidOut: string[] = [];
    const tops: number[] = [];
    const knots: number[] = [];
    let limit = 0;
    let halfViewport = 0;
    let frame = 0;
    let stale = true;

    const measure = () => {
      laidOut.length = 0;
      tops.length = 0;
      for (const section of sections) {
        if (!section.element) continue;
        measureLayoutBox(section.element, section.box);
        if (!hasSize(section.box)) continue;
        laidOut.push(section.id);
        tops.push(section.box.y);
      }
      const root = document.documentElement;
      limit = Math.max(root.scrollHeight - root.clientHeight, 0);
      halfViewport = root.clientHeight / 2;
      stale = false;
    };

    const update = () => {
      frame = 0;
      if (stale) measure();
      const count = laidOut.length;
      if (count === 0) {
        setActiveSection(sectionIds[0]);
        return;
      }
      computeSectionKnots(tops, count, halfViewport, limit, knots);
      setActiveSection(laidOut[sectionAtScroll(knots, count, window.scrollY)]);
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    const invalidate = () => {
      stale = true;
      schedule();
    };

    const observer = new ResizeObserver(invalidate);
    for (const section of sections) {
      if (section.element) observer.observe(section.element);
    }
    observer.observe(document.body);

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", invalidate);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", invalidate);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sectionIds]);

  return activeSection;
}
