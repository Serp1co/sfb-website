import { useEffect, type RefObject } from "react";

/**
 * What data-rise says on a hero element once its CSS focus-pull (`rise`, styles/sections.css) has
 * ended, or at once when it plays none (reduced motion, or it ended before hydration). Absent while
 * a rise is still to end. The scene reads it on the hero's logo (v3.3) and tagline (v3.4) to fade
 * their outlines in where they come to rest: after a client navigation home the rise replays on a
 * fresh hero, and effects drawn at the layout box from the start would sit up to 14 px off the
 * rising, blurred glyphs for most of a second.
 */
export const RISE_DONE = "done";

/** The CSS animation the hero enters with (the @keyframes name in styles/sections.css). */
const RISE_ANIMATION = "rise";

/** The rise still to end on `element`, if any: finished animations are not returned. */
function pendingRise(element: Element): Animation | undefined {
  if (typeof element.getAnimations !== "function" || typeof CSSAnimation === "undefined") return undefined;
  // getAnimations() flushes pending style, so a rise this commit has just started is found too.
  return element
    .getAnimations()
    .find((animation) => animation instanceof CSSAnimation && animation.animationName === RISE_ANIMATION);
}

/**
 * Keeps data-rise on the element in `ref` honest from mount to unmount: RISE_DONE once its rise has
 * ended (a cancel counts: the motion preference changed mid-way), removed again if a rise starts
 * after mount (a stylesheet that applied after hydration).
 */
export function useRiseFlag(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Bumped per rise and on unmount, so an earlier rise's promise never marks a later one done.
    let token = 0;
    const follow = (rise: Animation | undefined) => {
      const mine = ++token;
      if (!rise) {
        element.dataset.rise = RISE_DONE;
        return;
      }
      delete element.dataset.rise;
      const done = () => {
        if (mine === token) element.dataset.rise = RISE_DONE;
      };
      rise.finished.then(done, done);
    };
    const onStart = (event: AnimationEvent) => {
      if (event.animationName === RISE_ANIMATION) follow(pendingRise(element));
    };
    element.addEventListener("animationstart", onStart);
    follow(pendingRise(element));
    return () => {
      token++;
      element.removeEventListener("animationstart", onStart);
    };
  }, [ref]);
}
