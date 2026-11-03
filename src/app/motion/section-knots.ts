/*
 * Where each section of a page "starts" as a scroll offset, shared by the scene's story position
 * (story.ts) and the header's scroll-spy (hooks/use-active-section.ts), so the two always agree on
 * which section the visitor is in.
 *
 * A section starts when its top reaches the viewport centre; the first starts at scroll 0 and the
 * last ends at the scroll limit. On a tall viewport a short first or last section puts its knot
 * outside [0, limit] (several can, on a very tall one), and that section could then never become
 * current: the knots are pushed back inside, each section keeping at least MIN_SECTION_SCROLL_PX
 * of scroll. Layouts whose knots already fit keep exactly the centre rule.
 */

/** Every section keeps at least this much scroll, so no layout can squeeze one out of reach. */
const MIN_SECTION_SCROLL_PX = 1;

/**
 * Fills `knots` with count + 1 offsets: knots[j] is where section j starts (knots[0] = 0) and
 * knots[count] is the scroll limit. `tops` holds the sections' document tops, in order. The result
 * is non-decreasing, and every span is at least min(MIN_SECTION_SCROLL_PX, limit / count).
 * Allocation-free once `knots` has grown (it is a per-tick scratch array).
 */
export function computeSectionKnots(
  tops: readonly number[],
  count: number,
  halfViewport: number,
  limit: number,
  knots: number[],
): void {
  const end = Math.max(limit, 0);
  knots.length = count + 1;
  knots[0] = 0;
  for (let j = 1; j < count; j++) knots[j] = tops[j] - halfViewport;
  knots[count] = end;
  if (count === 0) return;
  // gap <= end / count, so both passes are always satisfiable.
  const gap = Math.min(MIN_SECTION_SCROLL_PX, end / count);
  for (let j = count - 1; j >= 1; j--) knots[j] = Math.min(knots[j], knots[j + 1] - gap);
  for (let j = 1; j < count; j++) knots[j] = Math.max(knots[j], knots[j - 1] + gap);
}

/** The section (0..count-1) the scroll offset `y` is in: the last one whose knot it has passed. */
export function sectionAtScroll(knots: readonly number[], count: number, y: number): number {
  let j = 0;
  while (j < count - 1 && y > knots[j + 1]) j++;
  return j;
}
