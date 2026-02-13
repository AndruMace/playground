import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import {
  createRoadGeometry,
  createEdgePoints,
  createCurbGeometry,
  TRACK_CURVE,
  TRACK_WIDTH,
} from './trackPath';

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
      position: [point.x, 0.07, point.z] as [number, number, number],
      rotation,
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
          position: [pos.x, 0.07, pos.z],
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
          for (let i = 0; i <= 200; i++) {
            pts.push(TRACK_CURVE.getPointAt(i / 200).setY(0.07));
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
    </group>
  );
}
