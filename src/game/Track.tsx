import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import {
  createRoadGeometry,
  createEdgePoints,
  createCurbGeometry,
  getCheckpointTs,
  TRACK_CURVE,
  TRACK_WIDTH,
} from './trackPath';

function CheckpointMarkers() {
  const markers = useMemo(() => {
    const cpTs = getCheckpointTs();
    return cpTs.map((t, idx) => {
      const point = TRACK_CURVE.getPointAt(t);
      const tangent = TRACK_CURVE.getTangentAt(t);
      const flatTan = new THREE.Vector3(tangent.x, 0, tangent.z).normalize();
      const perp = new THREE.Vector3(-flatTan.z, 0, flatTan.x);
      const rotation = Math.atan2(flatTan.x, flatTan.z);

      // Stripe across the road
      const stripePos: [number, number, number] = [
        point.x,
        point.y + 0.08,
        point.z,
      ];

      // Two posts on each side of the road
      const postHeight = 5;
      const leftPost: [number, number, number] = [
        point.x + perp.x * (TRACK_WIDTH / 2 + 0.5),
        point.y + postHeight / 2,
        point.z + perp.z * (TRACK_WIDTH / 2 + 0.5),
      ];
      const rightPost: [number, number, number] = [
        point.x - perp.x * (TRACK_WIDTH / 2 + 0.5),
        point.y + postHeight / 2,
        point.z - perp.z * (TRACK_WIDTH / 2 + 0.5),
      ];

      // Banner across the top
      const bannerPos: [number, number, number] = [
        point.x,
        point.y + postHeight,
        point.z,
      ];

      return { stripePos, leftPost, rightPost, bannerPos, rotation, postHeight, idx };
    });
  }, []);

  return (
    <group>
      {markers.map((m) => (
        <group key={m.idx}>
          {/* Road stripe */}
          <mesh position={m.stripePos} rotation={[0, m.rotation, 0]}>
            <boxGeometry args={[TRACK_WIDTH, 0.04, 1.2]} />
            <meshStandardMaterial
              color="#ffaa00"
              emissive="#ffaa00"
              emissiveIntensity={0.3}
              transparent
              opacity={0.7}
            />
          </mesh>

          {/* Left post */}
          <mesh position={m.leftPost}>
            <cylinderGeometry args={[0.2, 0.2, m.postHeight, 8]} />
            <meshStandardMaterial color="#ff6600" />
          </mesh>

          {/* Right post */}
          <mesh position={m.rightPost}>
            <cylinderGeometry args={[0.2, 0.2, m.postHeight, 8]} />
            <meshStandardMaterial color="#ff6600" />
          </mesh>

          {/* Banner across the top */}
          <mesh position={m.bannerPos} rotation={[0, m.rotation, 0]}>
            <boxGeometry args={[TRACK_WIDTH + 1, 0.8, 0.15]} />
            <meshStandardMaterial
              color="#ff6600"
              emissive="#ff6600"
              emissiveIntensity={0.2}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Track() {
  const roadGeometry = useMemo(() => createRoadGeometry(), []);
  const leftEdge = useMemo(() => createEdgePoints('left'), []);
  const rightEdge = useMemo(() => createEdgePoints('right'), []);
  const leftCurb = useMemo(() => createCurbGeometry('left'), []);
  const rightCurb = useMemo(() => createCurbGeometry('right'), []);

  // Start/finish line position and rotation
  const startLine = useMemo(() => {
    const point = TRACK_CURVE.getPointAt(0);
    const tangent = TRACK_CURVE.getTangentAt(0);
    const rotation = Math.atan2(tangent.x, tangent.z);
    return {
      position: [point.x, point.y + 0.07, point.z] as [number, number, number],
      rotation,
      y: point.y,
    };
  }, []);

  // Checkered start/finish line
  const checkerBoxes = useMemo(() => {
    const boxes: { position: [number, number, number]; color: string }[] = [];
    const tangent = TRACK_CURVE.getTangentAt(0);
    const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const point = TRACK_CURVE.getPointAt(0);
    const numSquares = 10;
    const squareSize = TRACK_WIDTH / numSquares;

    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < numSquares; col++) {
        const lateralOffset = (col - numSquares / 2 + 0.5) * squareSize;
        const forwardOffset = (row - 0.5) * squareSize;
        const pos = point
          .clone()
          .add(perp.clone().multiplyScalar(lateralOffset))
          .add(tangent.clone().multiplyScalar(forwardOffset));
        const isWhite = (row + col) % 2 === 0;
        boxes.push({
          position: [pos.x, startLine.y + 0.07, pos.z],
          color: isWhite ? '#ffffff' : '#111111',
        });
      }
    }
    return { boxes, squareSize, rotation: startLine.rotation };
  }, [startLine.rotation]);

  return (
    <group>
      {/* Road surface */}
      <mesh geometry={roadGeometry} receiveShadow>
        <meshStandardMaterial color="#3a3a3a" roughness={0.85} />
      </mesh>

      {/* Curbs */}
      <mesh geometry={leftCurb}>
        <meshStandardMaterial vertexColors roughness={0.7} />
      </mesh>
      <mesh geometry={rightCurb}>
        <meshStandardMaterial vertexColors roughness={0.7} />
      </mesh>

      {/* Edge lines */}
      <Line points={leftEdge} color="white" lineWidth={2} />
      <Line points={rightEdge} color="white" lineWidth={2} />

      {/* Center dashed line */}
      <Line
        points={useMemo(() => {
          const pts: THREE.Vector3[] = [];
          for (let i = 0; i <= 400; i++) {
            const p = TRACK_CURVE.getPointAt(i / 400);
            p.y += 0.07;
            pts.push(p);
          }
          return pts;
        }, [])}
        color="#666666"
        lineWidth={1}
        dashed
        dashSize={2}
        gapSize={2}
      />

      {/* Checkered start/finish */}
      {checkerBoxes.boxes.map((box, i) => (
        <mesh
          key={i}
          position={box.position}
          rotation={[0, checkerBoxes.rotation, 0]}
        >
          <boxGeometry
            args={[checkerBoxes.squareSize * 0.95, 0.01, checkerBoxes.squareSize * 0.95]}
          />
          <meshStandardMaterial color={box.color} />
        </mesh>
      ))}

      {/* Checkpoint markers */}
      <CheckpointMarkers />
    </group>
  );
}
