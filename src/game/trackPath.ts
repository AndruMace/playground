import * as THREE from 'three';

// --- Track definition ---
// Simplified Nürburgring Nordschleife – "The Green Hell"
// Elongated loop running south → north (east side) → north → south (west side).
// ~20 m of elevation change, famous corners approximated.

const TRACK_CONTROL_POINTS = [
  // ═══ Start / Finish (south, flat) ═══════════════════════════════
  new THREE.Vector3(   0,   0,  200),   // S/F line
  new THREE.Vector3(  30,   0,  205),

  // ═══ Hatzenbach – gentle uphill curves heading NE ═══════════════
  new THREE.Vector3(  60,   1,  195),
  new THREE.Vector3(  80,   2,  175),
  new THREE.Vector3(  70,   3,  150),
  new THREE.Vector3(  85,   4,  125),

  // ═══ Flugplatz – crest! Cars go light over the top ══════════════
  new THREE.Vector3(  95,   8,   95),
  new THREE.Vector3(  90,  10,   70),   // hilltop crest

  // ═══ Schwedenkreuz – fast downhill kink ═════════════════════════
  new THREE.Vector3(  80,   7,   40),
  new THREE.Vector3(  75,   5,   10),

  // ═══ Adenauer Forst – tight blind right-left ════════════════════
  new THREE.Vector3(  85,   4,  -20),
  new THREE.Vector3(  70,   3,  -50),
  new THREE.Vector3(  55,   4,  -75),

  // ═══ Metzgesfeld → Kallenhard ═══════════════════════════════════
  new THREE.Vector3(  40,   6,  -105),
  new THREE.Vector3(  20,   8,  -130),

  // ═══ Wehrseifen – downhill plunge into the valley ═══════════════
  new THREE.Vector3(   0,   4,  -155),
  new THREE.Vector3( -15,   2,  -170),

  // ═══ Breidscheid → Ex-Mühle ════════════════════════════════════
  new THREE.Vector3( -35,   3,  -185),
  new THREE.Vector3( -55,   5,  -175),

  // ═══ Karussell – iconic banked left hairpin ═════════════════════
  new THREE.Vector3( -70,   6,  -155),
  new THREE.Vector3( -75,   6,  -130),

  // ═══ Hohe Acht – highest point on the track ═════════════════════
  new THREE.Vector3( -85,  12,  -105),
  new THREE.Vector3( -90,  14,   -80),  // summit ~14 m up
  new THREE.Vector3( -85,  13,   -55),

  // ═══ Brünnchen – fast flowing downhill ══════════════════════════
  new THREE.Vector3( -75,  10,   -25),
  new THREE.Vector3( -70,   8,     5),
  new THREE.Vector3( -80,   6,    35),

  // ═══ Pflanzgarten – jumps and abrupt elevation ══════════════════
  new THREE.Vector3( -85,   9,    65),   // crest
  new THREE.Vector3( -80,   4,    90),   // dip
  new THREE.Vector3( -75,   7,   110),   // crest again

  // ═══ Schwalbenschwanz (Swallow's Tail) – tight double-apex ═════
  new THREE.Vector3( -60,   5,   135),
  new THREE.Vector3( -40,   3,   155),
  new THREE.Vector3( -55,   2,   175),

  // ═══ Galgenkopf – final sweeping return ═════════════════════════
  new THREE.Vector3( -35,   1,   195),
  new THREE.Vector3( -15,   0,   205),
];

export const TRACK_CURVE = new THREE.CatmullRomCurve3(TRACK_CONTROL_POINTS, true, 'centripetal');
export const TRACK_WIDTH = 16;
export const TOTAL_LAPS = 2;
export const NUM_CHECKPOINTS = 8;

// --- Pre-sampled track points for fast nearest-point queries ---

const TRACK_SAMPLES = 1000;
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

/** Returns the road surface elevation (Y) at the nearest track point to pos. */
export function getTrackElevation(pos: THREE.Vector3): number {
  const info = getNearestTrackInfo(pos);
  // Only return elevation if reasonably close to the track
  if (info.distance < TRACK_WIDTH) {
    return info.point.y;
  }
  return 0;
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
  position.y += 0.5;

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
  const segments = 400;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = (i % (segments + 1)) / segments;
    const point = TRACK_CURVE.getPointAt(t);
    const tangent = TRACK_CURVE.getTangentAt(t);
    // Flatten tangent for lateral perpendicular (so road stays horizontal across width)
    const flatTan = new THREE.Vector3(tangent.x, 0, tangent.z).normalize();
    const perp = new THREE.Vector3(-flatTan.z, 0, flatTan.x);

    const left = point.clone().add(perp.clone().multiplyScalar(TRACK_WIDTH / 2));
    const right = point.clone().sub(perp.clone().multiplyScalar(TRACK_WIDTH / 2));

    positions.push(left.x, point.y + 0.05, left.z);
    positions.push(right.x, point.y + 0.05, right.z);

    uvs.push(0, (i / segments) * 40);
    uvs.push(1, (i / segments) * 40);
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
  const segments = 400;
  const offset = side === 'left' ? TRACK_WIDTH / 2 : -TRACK_WIDTH / 2;
  const points: THREE.Vector3[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = (i % (segments + 1)) / segments;
    const point = TRACK_CURVE.getPointAt(t);
    const tangent = TRACK_CURVE.getTangentAt(t);
    const flatTan = new THREE.Vector3(tangent.x, 0, tangent.z).normalize();
    const perp = new THREE.Vector3(-flatTan.z, 0, flatTan.x);
    const p = point.clone().add(perp.multiplyScalar(offset));
    p.y = point.y + 0.08;
    points.push(p);
  }

  return points;
}

// --- Curb geometry (red/white striped barriers) ---

export function createCurbGeometry(side: 'left' | 'right'): THREE.BufferGeometry {
  const segments = 400;
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
    const flatTan = new THREE.Vector3(tangent.x, 0, tangent.z).normalize();
    const perp = new THREE.Vector3(-flatTan.z, 0, flatTan.x);

    const inner = point.clone().add(perp.clone().multiplyScalar(baseOffset));
    const outer = point.clone().add(perp.clone().multiplyScalar(outerOffset));

    const y = point.y + 0.06;
    positions.push(inner.x, y, inner.z);
    positions.push(outer.x, y, outer.z);

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
