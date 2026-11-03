import { HalfFloatType, LinearFilter, RGBAFormat, UnsignedByteType, WebGLRenderTarget } from "three";
import { LARGE_SCENE_PX, type TierSettings } from "./glass-config";

/**
 * The scene render target: linear (three never tone-maps into render targets), HalfFloat when the
 * GPU can render to float targets (the orb's highlights reach ~10), MSAA per tier. Depth is only
 * for the scene pass itself, so it is neither resolved nor kept after the resolve. It is the only
 * depth buffer the scene has: the canvas has none, so even the direct fallback renders here.
 */
export class SceneTarget {
  readonly target: WebGLRenderTarget;

  constructor(hdr: boolean) {
    this.target = new WebGLRenderTarget(1, 1, {
      type: hdr ? HalfFloatType : UnsignedByteType,
      format: RGBAFormat,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      generateMipmaps: false,
      depthBuffer: true,
      stencilBuffer: false,
      samples: 0,
      resolveDepthBuffer: false,
      storeMultisampledDepthBuffer: false,
    });
  }

  /** Sizes the target from the drawing buffer and the tier (cheap when nothing changed). */
  resize(bufferWidth: number, bufferHeight: number, tier: TierSettings): void {
    const width = Math.max(1, Math.round(bufferWidth * tier.sceneScale));
    const height = Math.max(1, Math.round(bufferHeight * tier.sceneScale));
    const samples = width * height > LARGE_SCENE_PX ? tier.msaaLarge : tier.msaa;
    if (this.target.samples !== samples) {
      this.target.samples = samples;
      // three reads `samples` when it builds the framebuffers: rebuild them on the next render.
      this.target.dispose();
    }
    this.target.setSize(width, height);
  }

  dispose(): void {
    this.target.dispose();
  }
}
