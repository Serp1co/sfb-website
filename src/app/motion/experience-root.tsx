"use client";

/*
 * Lives in each root layout (via RootShell), so the WebGL scene, smooth scroll and the glass
 * registry persist across client navigations within a language (crossing EN <-> IT is a full
 * page load: separate root layouts). Renders the structure the CSS expects:
 *   <div class="site">
 *     <div class="scene" aria-hidden="true"> SceneCanvas (next/dynamic, ssr: false) </div>
 *     <div class="site-overlay"> {children} </div>
 *   </div>
 * The children are server-rendered and passed through untouched.
 */

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { handleRouteChange, startRuntime, stopRuntime } from "./runtime";
import SceneErrorBoundary from "./scene-error-boundary";
import { motion } from "./store";

/**
 * three.js and the physics engine are megabytes of JavaScript: loaded client-only and after the
 * page, so the content is readable and interactive without waiting for them.
 */
const SceneCanvas = dynamic(() => import("../scene/scene-canvas"), { ssr: false });

export default function ExperienceRoot({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname() ?? "";
  // The scene mounts only after the runtime has read this visitor's capabilities, and only with
  // WebGL2 (three.js needs it). Before that, and without it, the CSS glass is the whole design.
  const [sceneAllowed, setSceneAllowed] = useState(false);
  const handledPath = useRef(pathname);

  useEffect(() => {
    startRuntime(handledPath.current);
    setSceneAllowed(motion.capabilities.webgl2);
    return () => stopRuntime();
  }, []);

  // A layout effect, so the new page's scroll and reveal start states are set before it paints.
  // Comparing with the last handled path (not a "first run" flag) skips the initial render and
  // StrictMode's re-run alike.
  useLayoutEffect(() => {
    if (handledPath.current === pathname) return;
    handledPath.current = pathname;
    handleRouteChange(pathname);
  }, [pathname]);

  return (
    <div className="site">
      <div className="scene" aria-hidden="true">
        {sceneAllowed && (
          <SceneErrorBoundary>
            <SceneCanvas />
          </SceneErrorBoundary>
        )}
      </div>
      <div className="site-overlay">{children}</div>
    </div>
  );
}
