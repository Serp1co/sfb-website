import {
  BufferGeometry,
  Float32BufferAttribute,
  GLSL3,
  Mesh,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  type IUniform,
  type Material,
  type WebGLRenderTarget,
  type WebGLRenderer,
} from "three";
import { FULLSCREEN_VERT } from "./shaders/fullscreen.vert";

/**
 * Draws one material over a whole render target (or the canvas) with a single triangle.
 * Owns a private scene so the passes never touch the world's scene graph.
 */
export class FullscreenPass {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new BufferGeometry();
  private readonly mesh: Mesh<BufferGeometry, Material>;

  constructor(placeholder: Material) {
    // One triangle that overhangs the target: no diagonal seam, no wasted quad half.
    this.geometry.setAttribute("position", new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.mesh = new Mesh(this.geometry, placeholder);
    // The vertex shader ignores every matrix, and the triangle's bounds mean nothing to a camera.
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.scene.matrixWorldAutoUpdate = false;
    this.scene.add(this.mesh);
  }

  /** Renders `material` into `target` (null = the canvas). The caller owns autoClear. */
  render(gl: WebGLRenderer, material: Material, target: WebGLRenderTarget | null): void {
    this.mesh.material = material;
    gl.setRenderTarget(target);
    gl.render(this.scene, this.camera);
  }

  /**
   * Compiles `material` without drawing, using KHR_parallel_shader_compile where available, so a
   * program (the pipeline's own at boot, a tier's variant later) can be swapped in without a frame
   * hitch. `target` is where the material will draw: three keys a program by whether it renders to
   * the canvas or to a render target (the output colour space), so it must be bound while compiling.
   */
  compile(gl: WebGLRenderer, material: Material, target: WebGLRenderTarget | null): Promise<unknown> {
    const previousMaterial = this.mesh.material;
    const previousTarget = gl.getRenderTarget();
    this.mesh.material = material;
    gl.setRenderTarget(target);
    try {
      // Without the extension (SwiftShader, some drivers) three's compileAsync is a synchronous
      // compile plus a timer, and it asks for the extension with a console warning each time:
      // compile directly instead (has() never warns).
      if (!gl.extensions.has("KHR_parallel_shader_compile")) {
        gl.compile(this.scene, this.camera);
        return Promise.resolve();
      }
      return gl.compileAsync(this.scene, this.camera);
    } finally {
      gl.setRenderTarget(previousTarget);
      this.mesh.material = previousMaterial;
    }
  }

  dispose(): void {
    this.geometry.dispose();
  }
}

/** A GLSL3 pass material: no depth, no tone mapping (the pipeline owns every colour step). */
export function passMaterial(
  fragmentShader: string,
  uniforms: Record<string, IUniform>,
  defines: Record<string, number> = {},
): ShaderMaterial {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: FULLSCREEN_VERT,
    fragmentShader,
    uniforms,
    defines,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}
