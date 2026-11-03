import type { JSX } from "react";
import { ANCHORS } from "../glass/contract";

/** The two gaps the scene may park the orb in (glass/contract.ts). */
type OrbSlotAnchor = typeof ANCHORS.orbSlotPartners | typeof ANCHORS.orbSlotContact;

/**
 * An invisible box over the empty gap at the top of a section: from the end of the previous
 * section's content down to this section's head (styles/sections.css, .orb-slot). The scene reads
 * its rect and parks the orb in its centre, sized from its height. It carries no content, so it is
 * hidden from assistive technology, and it is out of flow, so it never changes the gap it spans.
 * Render it as the section's first child.
 */
export default function OrbSlot({ anchor }: { anchor: OrbSlotAnchor }): JSX.Element {
  return <div className="orb-slot" data-anchor={anchor} aria-hidden="true" />;
}
