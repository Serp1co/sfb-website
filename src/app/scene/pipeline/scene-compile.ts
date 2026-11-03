import { Light, Line, Mesh, Points, Sprite, type Camera, type Material, type Object3D, type Scene, type WebGLRenderer, type WebGLRenderTarget } from "three";

/**
 * Longest the scene pass waits in a row for programs compiling in the background; past this it
 * draws anyway (three then finishes what is left synchronously, as it would have without the gate).
 */
const COMPILE_WAIT_MAX_MS = 1500;

/** FNV-style mix of 32-bit integers: a cheap fingerprint, not a hash table key. */
function mix(hash: number, value: number): number {
  return Math.imul(hash ^ value, 16777619) >>> 0;
}

/** Per-traversal accumulator (the ticker is single-threaded; no closure is allocated per frame). */
let fingerprint = 0;

/** A small integer per material instance (three's own material id is not in its type definitions). */
const materialKeys = new WeakMap<Material, number>();
let nextMaterialKey = 1;

function materialKey(material: Material): number {
  let key = materialKeys.get(material);
  if (key === undefined) {
    key = nextMaterialKey++;
    materialKeys.set(material, key);
  }
  return key;
}

function mixMaterial(material: Material | Material[]): void {
  if (Array.isArray(material)) {
    for (const entry of material) fingerprint = mix(fingerprint, materialKey(entry));
  } else {
    fingerprint = mix(fingerprint, materialKey(material));
  }
}

function visit(object: Object3D): void {
  if (object instanceof Mesh || object instanceof Points || object instanceof Line || object instanceof Sprite) {
    fingerprint = mix(fingerprint, object.id);
    mixMaterial(object.material);
  } else if (object instanceof Light) {
    fingerprint = mix(fingerprint, object.id);
  }
}

/**
 * What picks the scene's programs: its drawable objects and their materials, its lights, its
 * environment and fog. Material versions are left out on purpose: compile() itself bumps them (it
 * builds both sides of double-sided transparent materials), which would restart the wait forever.
 */
function sceneFingerprint(scene: Scene): number {
  fingerprint = 2166136261;
  fingerprint = mix(fingerprint, scene.environment ? scene.environment.id + 1 : 0);
  fingerprint = mix(fingerprint, scene.fog ? 1 : 0);
  scene.traverse(visit);
  return fingerprint;
}

interface CompiledRecord {
  currentProgram?: { isReady?: () => boolean } | null;
}

function isCompiledRecord(value: unknown): value is CompiledRecord {
  return typeof value === "object" && value !== null;
}

/**
 * Every material's program has finished linking. A non-blocking poll (COMPLETION_STATUS_KHR);
 * without KHR_parallel_shader_compile three reports every program ready at once.
 */
function programsReady(gl: WebGLRenderer, materials: Set<Material>): boolean {
  for (const material of materials) {
    const record: unknown = gl.properties.get(material);
    if (!isCompiledRecord(record)) continue;
    const program = record.currentProgram;
    if (program && typeof program.isReady === "function" && !program.isReady()) return false;
  }
  return true;
}

/**
 * Compiles the world's new programs off the main thread before the scene pass first draws them
 * (m14). three builds a material's program the first time it renders, synchronously: while the
 * world booted that blocked the main thread for 100-470 ms per frame, freezing Lenis, hover and
 * clicks on the CSS-glass page. When the scene's fingerprint changes, compile() issues the new
 * programs at once and KHR_parallel_shader_compile links them in the background; until they are
 * ready the scene pass is skipped and the sceneRT keeps its last image (black while the world
 * boots, the scene before the change later). Programs three already has are ready at once, so
 * nothing waits for them. A change the fingerprint misses only costs a synchronous compile, as before.
 */
export class SceneCompileGate {
  private fingerprint = Number.NaN;
  /** The materials whose programs are still linking; null: none. */
  private pending: Set<Material> | null = null;
  /** performance.now() when the scene pass started waiting for them. */
  private waitingSince = 0;

  /** Whether the scene pass may draw this frame. `target` is where it draws (programs are keyed by it). */
  allows(gl: WebGLRenderer, scene: Scene, camera: Camera, target: WebGLRenderTarget, nowMs: number): boolean {
    if (this.pending && programsReady(gl, this.pending)) this.pending = null;
    if (!this.pending) {
      const next = sceneFingerprint(scene);
      if (next !== this.fingerprint) {
        this.fingerprint = next;
        const materials = this.compile(gl, scene, camera, target);
        if (materials && !programsReady(gl, materials)) {
          this.pending = materials;
          this.waitingSince = nowMs;
        }
      }
    }
    if (!this.pending) return true;
    if (nowMs - this.waitingSince < COMPILE_WAIT_MAX_MS) return false;
    // Waited long enough (a slow driver): draw, and let three finish linking on first use.
    this.pending = null;
    return true;
  }

  /** Issues the scene's programs with its target bound; null if three could not (the render then compiles as before). */
  private compile(gl: WebGLRenderer, scene: Scene, camera: Camera, target: WebGLRenderTarget): Set<Material> | null {
    const previous = gl.getRenderTarget();
    try {
      gl.setRenderTarget(target);
      return gl.compile(scene, camera);
    } catch {
      return null;
    } finally {
      gl.setRenderTarget(previous);
    }
  }
}
