import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface AirplaneModelProps {
  color?: string;
  /** When true the propeller spins */
  active?: boolean;
}

export function AirplaneModel({
  color = '#4488cc',
  active = false,
}: AirplaneModelProps) {
  const propRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (propRef.current) {
      propRef.current.rotation.z += (active ? 30 : 0.4) * delta;
    }
  });

  return (
    <group>
      {/* ---- Fuselage ---- */}
      <mesh castShadow>
        <boxGeometry args={[1.3, 1.1, 5.5]} />
        <meshStandardMaterial color={color} metalness={0.4} roughness={0.5} />
      </mesh>

      {/* Nose cone */}
      <mesh position={[0, 0, 3.1]} castShadow>
        <coneGeometry args={[0.55, 1, 8]} />
        <meshStandardMaterial color={color} metalness={0.4} roughness={0.5} />
      </mesh>

      {/* Cockpit windshield */}
      <mesh position={[0, 0.5, 1.4]} rotation={[0.25, 0, 0]} castShadow>
        <boxGeometry args={[0.9, 0.45, 1.1]} />
        <meshStandardMaterial
          color="#88ccff"
          metalness={0.8}
          roughness={0.1}
          transparent
          opacity={0.55}
        />
      </mesh>

      {/* ---- Main wings ---- */}
      <mesh position={[0, -0.1, 0]} castShadow>
        <boxGeometry args={[10, 0.1, 1.8]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.6} />
      </mesh>
      {/* Wing tips (red) */}
      <mesh position={[-5.1, -0.1, 0]} castShadow>
        <boxGeometry args={[0.3, 0.12, 0.8]} />
        <meshStandardMaterial color="#cc3333" />
      </mesh>
      <mesh position={[5.1, -0.1, 0]} castShadow>
        <boxGeometry args={[0.3, 0.12, 0.8]} />
        <meshStandardMaterial color="#cc3333" />
      </mesh>

      {/* ---- Tail section ---- */}
      {/* Vertical stabiliser */}
      <mesh position={[0, 0.8, -2.6]} castShadow>
        <boxGeometry args={[0.08, 1.4, 1]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.6} />
      </mesh>
      {/* Horizontal stabiliser */}
      <mesh position={[0, 1.2, -2.6]} castShadow>
        <boxGeometry args={[3, 0.07, 0.7]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.6} />
      </mesh>

      {/* ---- Propeller hub ---- */}
      <group ref={propRef} position={[0, 0, 3.6]}>
        {/* Blade 1 */}
        <mesh>
          <boxGeometry args={[2.2, 0.14, 0.08]} />
          <meshStandardMaterial color="#555" metalness={0.6} />
        </mesh>
        {/* Blade 2 */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[2.2, 0.14, 0.08]} />
          <meshStandardMaterial color="#555" metalness={0.6} />
        </mesh>
      </group>

      {/* ---- Landing gear ---- */}
      {/* Front wheel */}
      <mesh position={[0, -0.75, 1.5]}>
        <cylinderGeometry args={[0.15, 0.15, 0.12, 8]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      <mesh position={[0, -0.45, 1.5]}>
        <boxGeometry args={[0.06, 0.6, 0.06]} />
        <meshStandardMaterial color="#888" />
      </mesh>
      {/* Rear wheels */}
      {([-0.6, 0.6] as const).map((x) => (
        <group key={x}>
          <mesh position={[x, -0.75, -0.8]}>
            <cylinderGeometry args={[0.18, 0.18, 0.14, 8]} />
            <meshStandardMaterial color="#222" />
          </mesh>
          <mesh position={[x, -0.45, -0.8]}>
            <boxGeometry args={[0.06, 0.6, 0.06]} />
            <meshStandardMaterial color="#888" />
          </mesh>
        </group>
      ))}

      {/* Stripe decoration */}
      <mesh position={[0, 0.56, -0.5]}>
        <boxGeometry args={[1.32, 0.02, 3]} />
        <meshStandardMaterial color="white" />
      </mesh>
    </group>
  );
}
