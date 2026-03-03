"use client";

import { RefObject, useEffect } from "react";
import { forwardEventToCanvas } from "../utils/forward-event-to-canvas";

const FORWARDED_EVENTS: readonly string[] = [
  "mousedown", "mouseup", "mousemove", "mouseenter", "mouseleave",
  "pointerdown", "pointerup", "pointermove", "pointerenter", "pointerleave",
  "click", "dblclick", "wheel", "contextmenu",
] as const;

/**
 * Forwards mouse/pointer/wheel events from an overlay element to the
 * underlying <canvas> inside a container element.
 */
export function useEventForwarding(
  overlayRef: RefObject<HTMLDivElement | null>,
  canvasContainerRef: RefObject<HTMLDivElement | null>,
): void {
  useEffect(() => {
    const overlay = overlayRef.current;
    const canvasContainer = canvasContainerRef.current;
    if (!overlay || !canvasContainer) return;

    const handlers: Record<string, (e: Event) => void> = {};

    FORWARDED_EVENTS.forEach((eventType) => {
      handlers[eventType] = (e: Event): void => {
        const canvas = canvasContainer.querySelector("canvas");
        forwardEventToCanvas(e as MouseEvent | WheelEvent | PointerEvent, canvas);
      };
      overlay.addEventListener(eventType, handlers[eventType], { capture: true });
    });

    return () => {
      FORWARDED_EVENTS.forEach((eventType) => {
        overlay.removeEventListener(eventType, handlers[eventType], { capture: true });
      });
    };
  }, [overlayRef, canvasContainerRef]);
}
