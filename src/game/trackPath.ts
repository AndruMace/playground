import * as THREE from 'three';

// --- Track definition ---

const TRACK_CONTROL_POINTS = [
  new THREE.Vector3(0, 0, 70),
  new THREE.Vector3(50, 0, 72),
  new THREE.Vector3(85, 0, 55),
  new THREE.Vector3(100, 0, 20),
  new THREE.Vector3(95, 0, -20),
  new THREE.Vector3(75, 0, -55),
  new THREE.Vector3(40, 0, -72),
  new THREE.Vector3(0, 0, -75),
  new THREE.Vector3(-40, 0, -72),
  new THREE.Vector3(-75, 0, -55),
  new THREE.Vector3(-95, 0, -20),
  new THREE.Vector3(-100, 0, 20),
  new THREE.Vector3(-85, 0, 55),
  new THREE.Vector3(-50, 0, 72),
];

export const TRACK_CURVE = new THREE.CatmullRomCurve3(TRACK_CONTROL_POINTS, true, 'centripetal');
export const TRACK_WIDTH = 18;
export const TOTAL_LAPS = 3;
export const NUM_CHECKPOINTS = 4;

// --- Pre-sampled track points for fast nearest-point queries ---

const TRACK_SAMPLES = 500;
const sampledPoints: THREE.Vector3[] = [];
for (let i = 0; i < TRACK_SAMPLES; i++) {
  sampledPoints.push(TRACK_CURVE.getPointAt(i / TRACK_SAMPLES));
}

// --- Track query functions ---

export function getNearestTrackInfo(pos: THREE.Vector3): {
  point: THREE.Vector3;
  t: number;
  distance: number;
} {
  let minDist = Infinity;
  let nearestIdx = 0;

  for (let i = 0; i < sampledPoints.length; i++) {
    const dx = pos.x - sampledPoints[i].x;
    const dz = pos.z - sampledPoints[i].z;
    const d = dx * dx + dz * dz; // squared distance for speed
    if (d < minDist) {
      minDist = d;
      nearestIdx = i;
    }
  }

  return {
    point: sampledPoints[nearestIdx],
    t: nearestIdx / TRACK_SAMPLES,
    distance: Math.sqrt(minDist),
  };
}

export function isOnTrack(pos: THREE.Vector3): boolean {
  return getNearestTrackInfo(pos).distance < TRACK_WIDTH / 2;
}

export function getStartPosition(offset = 0): { position: THREE.Vector3; rotation: number } {
  const t = 0;
  const position = TRACK_CURVE.getPointAt(t).clone();
  const tangent = TRACK_CURVE.getTangentAt(t);
  const rotation = Math.atan2(tangent.x, tangent.z);

  // Offset laterally for multiple starting positions
  if (offset !== 0) {
    const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    position.add(perp.multiplyScalar(offset));
  }
  position.y = 0.5;

  return { position, rotation };
}

export function getCheckpointTs(): number[] {
  const cps: number[] = [];
  for (let i = 0; i < NUM_CHECKPOINTS; i++) {
    cps.push((i + 1) / (NUM_CHECKPOINTS + 1));
  }
  return cps; // e.g., [0.2, 0.4, 0.6, 0.8]
}

// --- Road geometry generation ---

export function createRoadGeometry(): THREE.BufferGeometry {
  const segments = 200;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = (i % (segments + 1)) / segments;
    const point = TRACK_CURVE.getPointAt(t);
    const tangent = TRACK_CURVE.getTangentAt(t);
    const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    const left = point.clone().add(perp.clone().multiplyScalar(TRACK_WIDTH / 2));
    const right = point.clone().sub(perp.clone().multiplyScalar(TRACK_WIDTH / 2));

    positions.push(left.x, 0.05, left.z);
    positions.push(right.x, 0.05, right.z);

    uvs.push(0, (i / segments) * 20);
    uvs.push(1, (i / segments) * 20);
  }

  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2;
    const d = (i + 1) * 2 + 1;
    indices.push(a, c, b);
    indices.push(b, c, d);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createEdgePoints(side: 'left' | 'right'): THREE.Vector3[] {
  const segments = 200;
  const offset = side === 'left' ? TRACK_WIDTH / 2 : -TRACK_WIDTH / 2;
  const points: THREE.Vector3[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = (i % (segments + 1)) / segments;
    const point = TRACK_CURVE.getPointAt(t);
    const tangent = TRACK_CURVE.getTangentAt(t);
    const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    points.push(point.clone().add(perp.multiplyScalar(offset)).setY(0.08));
  }

  return points;
}

// --- Curb geometry (red/white striped barriers) ---

export function createCurbGeometry(side: 'left' | 'right'): THREE.BufferGeometry {
  const segments = 200;
  const curbWidth = 1.5;
  const baseOffset = side === 'left' ? TRACK_WIDTH / 2 : -TRACK_WIDTH / 2;
  const outerOffset =
    side === 'left' ? baseOffset + curbWidth : baseOffset - curbWidth;

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = (i % (segments + 1)) / segments;
    const point = TRACK_CURVE.getPointAt(t);
    const tangent = TRACK_CURVE.getTangentAt(t);
    const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    const inner = point.clone().add(perp.clone().multiplyScalar(baseOffset));
    const outer = point.clone().add(perp.clone().multiplyScalar(outerOffset));

    positions.push(inner.x, 0.06, inner.z);
    positions.push(outer.x, 0.06, outer.z);

    // Alternating red/white
    const isRed = Math.floor(i / 3) % 2 === 0;
    const r = isRed ? 0.9 : 1.0;
    const g = isRed ? 0.1 : 1.0;
    const b = isRed ? 0.1 : 1.0;
    colors.push(r, g, b, r, g, b);
  }

  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2;
    const d = (i + 1) * 2 + 1;
    indices.push(a, c, b);
    indices.push(b, c, d);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
