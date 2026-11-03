"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { notifyPauseListeners } from "./pause";
import { hideScene, setEngineMode } from "./store";

interface SceneErrorBoundaryProps {
  children: ReactNode;
}

interface SceneErrorBoundaryState {
  failed: boolean;
}

/**
 * R3F rethrows renderer-creation failures (blocklisted GPU, context limit) and render-phase scene
 * errors into the React tree, and the root layout has no error.js above it: without this boundary
 * one scene exception would replace the whole site with Next's error page. Instead the scene
 * disappears and the panels keep (or get back) their CSS glass. A failed chunk load of the
 * dynamically imported canvas lands here too.
 */
export default class SceneErrorBoundary extends Component<SceneErrorBoundaryProps, SceneErrorBoundaryState> {
  state: SceneErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): SceneErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    setEngineMode("css");
    // The canvas is unmounted (render returns null); html[data-scene="off"] also tells the rest of
    // the page there is no scene, so the pause toggle hides.
    hideScene();
    notifyPauseListeners();
    console.error("[scene] The 3D scene failed; the page continues with CSS glass.", error, info.componentStack);
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
