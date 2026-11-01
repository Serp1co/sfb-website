"use client";

import { useRef, type JSX, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useEventForwarding } from "../hooks";

/**
 * three.js and the physics engine are ~3.8 MB of JavaScript. Loading them
 * client-only keeps them out of the way of first paint and hydration.
 */
const SceneCanvas = dynamic(() => import("./scene-canvas"), { ssr: false });

/**
 * The fixed 3D scene plus the overlay that carries the page. Pointer events on
 * the overlay are forwarded to the canvas so the orb reacts across the page.
 * Children are server-rendered and passed through untouched.
 */
export default function SiteShell({ children }: { children: ReactNode }): JSX.Element {
  const sceneRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEventForwarding(overlayRef, sceneRef);

  return (
    <div className="site">
      <div ref={sceneRef} className="scene" aria-hidden="true">
        <SceneCanvas />
      </div>
      <div ref={overlayRef} className="site-overlay">
        {children}
      </div>
    </div>
  );
}
