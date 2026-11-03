/*
 * motion.story: where the reading is, as a continuous position through the page's [data-story]
 * sections. Names are rebuilt on scan; the position is computed per tick from cached layout boxes.
 */

import { getStorySections } from "../glass/registry";
import { computeSectionKnots, sectionAtScroll } from "./section-knots";
import { clamp } from "./springs";
import { motion } from "./store";

/**
 * The position never quite reaches names.length: at the very bottom it is (n - 1) + this, so
 * Math.floor(position) always indexes a real section and the last pose is fully reached.
 */
const LAST_SECTION_END = 0.9999;

/** Per-tick scratch (the ticker is single-threaded): indices of the sections that have a box... */
const live: number[] = [];
/** ...their document tops... */
const tops: number[] = [];
/** ...and where each of them starts, plus the scroll limit (see section-knots.ts). */
const knots: number[] = [];

function sameNames(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((name, i) => name === b[i]);
}

/** After a scan: section names, the practice slug and the path the story belongs to. */
export function rebuildStory(path: string): void {
  const story = motion.story;
  const names = getStorySections().map((section) => section.name);
  // Keep the array identity while the names are unchanged; the scene may hold on to it.
  if (!sameNames(names, story.names)) story.names = names;
  story.practice = document.querySelector("main[data-practice]")?.getAttribute("data-practice") ?? "";
  story.path = path;
}

/**
 * Per tick: a piecewise-linear map from the scroll to the position, over the knots where each
 * section starts. A middle section starts when its top reaches the viewport centre (so between
 * two contiguous sections f = (centre - top) / height, the spec's centre rule); the first runs from
 * scroll 0 and the last ends exactly at the scroll limit. Knots a short first or last section would
 * put outside [0, limit] (a practice hero or practice CTA on a tall monitor, the contact section in
 * 4K) are pushed back inside, so both end poses are reached and held on any viewport.
 */
export function updateStory(): void {
  const story = motion.story;
  const sections = getStorySections();
  const count = sections.length;
  if (count === 0) {
    story.position = 0;
    return;
  }
  const y = motion.scroll.y;
  const limit = Math.max(motion.scroll.limit, 0);

  if (count === 1) {
    story.position = Math.min(clamp(y / Math.max(limit, 1), 0, 1), LAST_SECTION_END);
    return;
  }

  // Sections without a box (display: none at this width) take no scroll.
  live.length = 0;
  tops.length = 0;
  for (let i = 0; i < count; i++) {
    const box = sections[i].box;
    if (box.height <= 0) continue;
    live.push(i);
    tops.push(box.y);
  }
  const m = live.length;
  if (m === 0) {
    story.position = 0;
    return;
  }
  computeSectionKnots(tops, m, motion.viewport.height / 2, limit, knots);
  const j = sectionAtScroll(knots, m, y);
  const fraction = clamp((y - knots[j]) / Math.max(knots[j + 1] - knots[j], 1e-6), 0, 1);
  // The last laid-out section never reaches 1, so floor(position) is always a section with a box.
  story.position = live[j] + Math.min(fraction, j === m - 1 ? LAST_SECTION_END : 1);
}
