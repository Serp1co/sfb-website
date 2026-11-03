import {
  HalfFloatType,
  LinearFilter,
  RGBAFormat,
  Vector2,
  WebGLRenderTarget,
  type ShaderMaterial,
  type Texture,
  type TextureDataType,
  type WebGLRenderer,
} from "three";
import { FROST } from "./glass-config";
import { passMaterial, type FullscreenPass } from "./fullscreen-pass";
import { BLUR_DOWN_FRAG, BLUR_FIRST_FRAG, BLUR_UP_FRAG, FIRST_PASS_MAX_TAPS } from "./shaders/blur.frag";

/*
 * Dual-Kawase frost chain sized in CSS px: level k is ceil(css / 2^k), whatever the DPR or the
 * sceneRT scale, so the frost is the same width on every device and tier.
 *
 *   sceneRT -> L(start) -> ... -> L4 (1/16)            down
 *   L4 -> U3 (1/8) -> frost (1/4)                       up: the full frost
 *   L3 -> frostMid (1/4)                                up: the middle frost stage
 *
 * frostMid is taken from the 1/8 DOWN level, not from the 1/8 up level: measured, the 1/8 up level
 * is nearly as blurred as the result (sigma 14.0 vs 15.2 CSS px at offset 1, both rebuilt from 1/16),
 * so it could not be a middle stage.
 *
 * Cheaper tiers start at 1/4 (one level lower); the chain still ends at 1/16, so the frost keeps its
 * size (measured sigma 20.0 +- 0.2 px across DPR 1-1.5 and every tier).
 */

/** Deepest level: 1/16 CSS. */
const DEEPEST_LEVEL = 4;
/** frost and frostMid live at 1/4 CSS. */
const FROST_LEVEL = 2;

/**
 * Kawase offset -> effective Gaussian sigma (CSS px) of the full frost, measured by simulating this
 * chain with exact bilinear sampling (averaged over DPR 1 and 1.5 and sub-texel impulse positions).
 */
const FROST_SIGMA_BY_OFFSET: readonly (readonly [number, number])[] = [
  [1, 15.16],
  [1.25, 17.14],
  [1.5, 19.31],
  [1.75, 22.96],
  [2, 26.0],
  [2.5, 30.88],
  [3, 37.67],
];

/** frostMid's up-pass offset -> its sigma, measured at the main offset that gives sigma 20. */
const MID_SIGMA_BY_OFFSET: readonly (readonly [number, number])[] = [
  [0.75, 7.0],
  [1, 7.73],
  [1.25, 8.39],
  [1.5, 9.15],
  [2, 11.12],
];

/** Inverse of a monotonic [x, y] table by linear interpolation (clamped to its ends). */
function offsetForSigma(table: readonly (readonly [number, number])[], sigma: number): number {
  if (sigma <= table[0][1]) return table[0][0];
  for (let i = 1; i < table.length; i++) {
    const [x0, y0] = table[i - 1];
    const [x1, y1] = table[i];
    if (sigma <= y1) return x0 + ((sigma - y0) / (y1 - y0)) * (x1 - x0);
  }
  return table[table.length - 1][0];
}

const KAWASE_OFFSET = offsetForSigma(FROST_SIGMA_BY_OFFSET, FROST.sigmaCss);
const MID_OFFSET = offsetForSigma(MID_SIGMA_BY_OFFSET, FROST.midSigmaCss);

function levelTarget(type: TextureDataType): WebGLRenderTarget {
  return new WebGLRenderTarget(1, 1, {
    type,
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: false,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

export class BlurChain {
  private readonly down: WebGLRenderTarget[] = [];
  private readonly up3: WebGLRenderTarget;
  private readonly frostTarget: WebGLRenderTarget;
  private readonly midTarget: WebGLRenderTarget;
  private startLevel = 1;
  private readonly firstUniforms = {
    tSrc: { value: null as Texture | null },
    uSrcTexel: { value: new Vector2(1, 1) },
    uTaps: { value: 1 },
  };
  private readonly downUniforms = { tSrc: { value: null as Texture | null }, uHalf: { value: new Vector2() } };
  private readonly upUniforms = { tSrc: { value: null as Texture | null }, uHalf: { value: new Vector2() } };
  readonly firstMaterial: ShaderMaterial;
  readonly downMaterial: ShaderMaterial;
  readonly upMaterial: ShaderMaterial;

  constructor(type: TextureDataType = HalfFloatType) {
    for (let k = 0; k <= DEEPEST_LEVEL; k++) this.down.push(levelTarget(type));
    this.up3 = levelTarget(type);
    this.frostTarget = levelTarget(type);
    this.midTarget = levelTarget(type);
    this.firstMaterial = passMaterial(BLUR_FIRST_FRAG, this.firstUniforms);
    this.downMaterial = passMaterial(BLUR_DOWN_FRAG, this.downUniforms);
    this.upMaterial = passMaterial(BLUR_UP_FRAG, this.upUniforms);
  }

  get frost(): Texture {
    return this.frostTarget.texture;
  }

  get frostMid(): Texture {
    return this.midTarget.texture;
  }

  get materials(): readonly ShaderMaterial[] {
    return [this.firstMaterial, this.downMaterial, this.upMaterial];
  }

  /** Sizes every level from the canvas CSS size (cheap when nothing changed). */
  resize(cssWidth: number, cssHeight: number, startLevel: 1 | 2): void {
    this.startLevel = startLevel;
    const size = (k: number): [number, number] => [
      Math.max(1, Math.ceil(cssWidth / 2 ** k)),
      Math.max(1, Math.ceil(cssHeight / 2 ** k)),
    ];
    for (let k = startLevel; k <= DEEPEST_LEVEL; k++) this.down[k].setSize(...size(k));
    // Levels a cheaper tier skips keep nothing allocated.
    for (let k = 1; k < startLevel; k++) this.down[k].setSize(1, 1);
    this.up3.setSize(...size(DEEPEST_LEVEL - 1));
    this.frostTarget.setSize(...size(FROST_LEVEL));
    this.midTarget.setSize(...size(FROST_LEVEL));
  }

  /** Runs the chain from the scene (`source` is the sceneRT texture, `sourceWidth` its pixel width). */
  render(gl: WebGLRenderer, pass: FullscreenPass, source: Texture, sourceWidth: number, sourceHeight: number): void {
    const first = this.down[this.startLevel];
    const ratio = sourceWidth / first.width;
    this.firstUniforms.tSrc.value = source;
    this.firstUniforms.uSrcTexel.value.set(1 / sourceWidth, 1 / sourceHeight);
    this.firstUniforms.uTaps.value = Math.min(Math.max(Math.ceil(ratio - 1e-3), 1), FIRST_PASS_MAX_TAPS);
    pass.render(gl, this.firstMaterial, first);

    for (let k = this.startLevel + 1; k <= DEEPEST_LEVEL; k++) {
      const target = this.down[k];
      this.downUniforms.tSrc.value = this.down[k - 1].texture;
      this.downUniforms.uHalf.value.set((0.5 / target.width) * KAWASE_OFFSET, (0.5 / target.height) * KAWASE_OFFSET);
      pass.render(gl, this.downMaterial, target);
    }

    this.renderUp(gl, pass, this.down[DEEPEST_LEVEL], this.up3, KAWASE_OFFSET);
    this.renderUp(gl, pass, this.up3, this.frostTarget, KAWASE_OFFSET);
    this.renderUp(gl, pass, this.down[DEEPEST_LEVEL - 1], this.midTarget, MID_OFFSET);
  }

  private renderUp(gl: WebGLRenderer, pass: FullscreenPass, from: WebGLRenderTarget, to: WebGLRenderTarget, offset: number): void {
    this.upUniforms.tSrc.value = from.texture;
    this.upUniforms.uHalf.value.set((0.5 / from.width) * offset, (0.5 / from.height) * offset);
    pass.render(gl, this.upMaterial, to);
  }

  dispose(): void {
    for (const target of this.down) target.dispose();
    this.up3.dispose();
    this.frostTarget.dispose();
    this.midTarget.dispose();
    for (const material of this.materials) material.dispose();
  }
}
