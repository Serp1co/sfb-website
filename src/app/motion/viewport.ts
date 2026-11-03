/*
 * motion.viewport: the layout viewport without the scrollbar, the space that client rects and
 * pointer coordinates live in. Read on boot and on every resize or device-pixel-ratio change,
 * never per tick.
 */

import { motion } from "./store";

export function readViewport(): void {
  const root = document.documentElement;
  motion.viewport.width = Math.max(root.clientWidth, 1);
  motion.viewport.height = Math.max(root.clientHeight, 1);
  motion.viewport.dpr = window.devicePixelRatio || 1;
}

/**
 * Keeps motion.viewport current. A DPR change without a resize (dragging the window to another
 * monitor) only shows up through a resolution media query, which has to be re-armed with the new
 * ratio after each change.
 */
export function startViewportTracking(): () => void {
  let dprQuery: MediaQueryList | null = null;

  const onDprChange = () => {
    readViewport();
    watchDpr();
  };
  const watchDpr = () => {
    dprQuery?.removeEventListener("change", onDprChange);
    dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    dprQuery.addEventListener("change", onDprChange);
  };
  const onResize = () => readViewport();

  readViewport();
  watchDpr();
  window.addEventListener("resize", onResize);
  return () => {
    window.removeEventListener("resize", onResize);
    dprQuery?.removeEventListener("change", onDprChange);
    dprQuery = null;
  };
}
