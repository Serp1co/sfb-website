import type { Material, WebGLRenderer } from "three";

export type LinkStatus = "pending" | "linked" | "failed";

interface ProgramRecord {
  currentProgram?: { program?: WebGLProgram | null } | null;
}

function isProgramRecord(value: unknown): value is ProgramRecord {
  return typeof value === "object" && value !== null;
}

/**
 * Whether a material's shader program linked, read after its first render. With
 * gl.debug.checkShaderErrors off (production) three never queries LINK_STATUS, and a failed
 * program just draws nothing, so the pipeline asks once per program before it lets the WebGL
 * glass replace the CSS glass. "pending" until three has built a program for the material.
 */
function readLinkStatus(gl: WebGLRenderer, material: Material): LinkStatus {
  const record = gl.properties.get(material);
  if (!isProgramRecord(record) || !record.currentProgram) return "pending";
  const program = record.currentProgram.program;
  if (!program) return "failed";
  const context = gl.getContext();
  return context.getProgramParameter(program, context.LINK_STATUS) === true ? "linked" : "failed";
}

/**
 * Caches each material's verdict: the query is a synchronous GPU round trip, so a program is asked
 * until it has been built, then never again.
 */
export class ProgramValidator {
  private readonly verdicts = new WeakMap<Material, Exclude<LinkStatus, "pending">>();

  status(gl: WebGLRenderer, material: Material): LinkStatus {
    const known = this.verdicts.get(material);
    if (known) return known;
    const status = readLinkStatus(gl, material);
    if (status !== "pending") this.verdicts.set(material, status);
    return status;
  }

  /** Failed if any failed, pending if any is still pending, else linked. */
  statusAll(gl: WebGLRenderer, materials: readonly Material[]): LinkStatus {
    let pending = false;
    for (const material of materials) {
      const status = this.status(gl, material);
      if (status === "failed") return "failed";
      if (status === "pending") pending = true;
    }
    return pending ? "pending" : "linked";
  }
}
