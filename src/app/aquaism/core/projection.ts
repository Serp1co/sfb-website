import * as THREE from "three";

/**
 * The canvas's CSS box (R3F's measured `state.size`). Client coordinates (pointer, anchor rects)
 * map onto it; the scene canvas is fixed at the viewport's top-left, so left/top are normally 0.
 */
export interface ScreenBox {
  width: number;
  height: number;
  left: number;
  top: number;
}

const _origin = new THREE.Vector3();
const _through = new THREE.Vector3();
const _view = new THREE.Vector3();

/**
 * Casts the ray from the camera through a client point and intersects the world plane
 * z = planeZ. Needs the camera's matrices current (the rig updates them first each frame).
 * Returns false when the plane is behind the camera or parallel to the ray.
 */
export function clientToPlaneZ(
  out: THREE.Vector3,
  camera: THREE.Camera,
  box: ScreenBox,
  x: number,
  y: number,
  planeZ: number,
): boolean {
  if (!(box.width > 0 && box.height > 0)) return false;
  const ndcX = ((x - box.left) / box.width) * 2 - 1;
  const ndcY = 1 - ((y - box.top) / box.height) * 2;
  _origin.setFromMatrixPosition(camera.matrixWorld);
  _through.set(ndcX, ndcY, 0.5).unproject(camera).sub(_origin);
  if (Math.abs(_through.z) < 1e-6) return false;
  const t = (planeZ - _origin.z) / _through.z;
  if (!(t > 0) || !Number.isFinite(t)) return false;
  out.copy(_origin).addScaledVector(_through, t);
  return true;
}

/** A world point on screen: client CSS px plus its view depth (world units in front of the camera). */
export interface ScreenPoint {
  x: number;
  y: number;
  depth: number;
}

/** Projects a world point to client CSS px. Returns false when it is behind the camera. */
export function worldToClient(out: ScreenPoint, camera: THREE.Camera, box: ScreenBox, point: THREE.Vector3): boolean {
  _view.copy(point).applyMatrix4(camera.matrixWorldInverse);
  out.depth = -_view.z;
  if (!(out.depth > 0)) return false;
  _view.applyMatrix4(camera.projectionMatrix);
  out.x = box.left + ((_view.x + 1) / 2) * box.width;
  out.y = box.top + ((1 - _view.y) / 2) * box.height;
  return Number.isFinite(out.x) && Number.isFinite(out.y);
}

/** Vertical field of view in radians; orthographic or unknown cameras get the site's 75 degrees. */
export function verticalFov(camera: THREE.Camera): number {
  const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : DEFAULT_FOV_DEGREES;
  return THREE.MathUtils.degToRad(fov);
}

/** CSS px per world unit at a view depth: converts a world radius to a screen radius. */
export function pixelsPerUnitAt(camera: THREE.Camera, box: ScreenBox, depth: number): number {
  const focal = box.height / 2 / Math.tan(verticalFov(camera) / 2);
  return depth > 0 ? focal / depth : 0;
}

const DEFAULT_FOV_DEGREES = 75;
