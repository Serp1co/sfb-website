import * as THREE from "three";
import { createRandom } from "./math";
import { GROUP_COUNT } from "./orb-controls";
import { clampToField } from "./orb-field";

/**
 * Group colours from the site's scene palette (DESIGN.md): infrastructure the blues, development
 * the cyans, security the whites and silvers. Merged, the three swirl into one orb; a practice
 * page's pill droplets take its practice's two (pill-droplets.ts).
 */
export const GROUP_PALETTES: readonly (readonly [number, number])[] = [
  [0x0067b1, 0x4e99ce],
  [0x55d7e2, 0x9bcbeb],
  [0xffffff, 0x9ca9b2],
];

/** The palette's rare warm flecks, on one body of each group so every body carries one. */
const FLECK_COLOURS = [0xf69230, 0xf5d81f, 0xf69230] as const;
const FLECK_BODIES = [4, 17, 27] as const;

/**
 * Bodies start loosely around the centre and condense in place at boot, in step with the glass
 * wave that starts from the orb (review M1). Scattered wider or lifted, they rained through the
 * lead and the orb came to rest 130 px below the point the boot wave had started from.
 */
const START_RADIUS = 1.4;
const START_LIFT = 0;

/** Each body aims at its own point inside its cluster, so the packing stays blobby, not stacked. */
export const REST_OFFSET_RADIUS = 0.32;

/**
 * Each rest offset turns slowly about the vertical axis at its own signed rate, so the colours
 * shear past each other inside the merged orb (a swirl, not a rigid spin).
 */
const SWIRL_RATE_MIN = 0.12;
const SWIRL_RATE_SPAN = 0.2;

/** Spread of the scroll slosh per body, so the liquid deforms as it lurches instead of translating. */
const INERTIA_GAIN_MIN = 0.75;
const INERTIA_GAIN_SPAN = 0.5;

/** Fixed seed: the orb is the same on every visit. */
const BODY_SEED = 20261101;

export interface BodySpec {
  /** 0 infrastructure, 1 development, 2 security (i % 3). */
  group: number;
  /** Linear vertex colour. */
  colour: THREE.Color;
  /** Start offset from the centre, physics units. */
  start: THREE.Vector3;
  /** Rest offset inside the body's cluster, physics units. */
  offset: THREE.Vector3;
  /** Signed angular rate of the rest offset's swirl about the vertical axis, rad/s. */
  swirlRate: number;
  /** Multiplier on the scroll's inertial acceleration. */
  inertiaGain: number;
}

function pointInBall(random: () => number, radius: number, out: THREE.Vector3): THREE.Vector3 {
  for (;;) {
    const x = random() * 2 - 1;
    const y = random() * 2 - 1;
    const z = random() * 2 - 1;
    if (x * x + y * y + z * z <= 1) return out.set(x * radius, y * radius, z * radius);
  }
}

export function createBodySpecs(count: number): BodySpec[] {
  const random = createRandom(BODY_SEED);
  const specs: BodySpec[] = [];
  for (let i = 0; i < count; i++) {
    const group = i % GROUP_COUNT;
    const fleck = FLECK_BODIES.indexOf(i as (typeof FLECK_BODIES)[number]);
    const palette = GROUP_PALETTES[group];
    const hex = fleck >= 0 ? FLECK_COLOURS[fleck] : palette[random() < 0.5 ? 0 : 1];

    const start = pointInBall(random, START_RADIUS, new THREE.Vector3());
    start.y += START_LIFT;
    start.set(clampToField(start.x), clampToField(start.y), clampToField(start.z));

    specs.push({
      group,
      colour: new THREE.Color(hex),
      start,
      offset: pointInBall(random, REST_OFFSET_RADIUS, new THREE.Vector3()),
      swirlRate: (SWIRL_RATE_MIN + random() * SWIRL_RATE_SPAN) * (random() < 0.5 ? -1 : 1),
      inertiaGain: INERTIA_GAIN_MIN + random() * INERTIA_GAIN_SPAN,
    });
  }
  return specs;
}
