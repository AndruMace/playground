import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface CharacterModelProps {
  /** Ref that is read each frame; truthy = animate walk cycle */
  isMovingRef: React.MutableRefObject<boolean>;
  color?: string;
}

export function CharacterModel({ isMovingRef, color = '#3498db' }: CharacterModelProps) {
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const moving = isMovingRef.current;
    const swing = moving ? Math.sin(state.clock.elapsedTime * 10) * 0.6 : 0;

    if (leftLegRef.current) leftLegRef.current.rotation.x = swing;
    if (rightLegRef.current) rightLegRef.current.rotation.x = -swing;
    if (leftArmRef.current) leftArmRef.current.rotation.x = -swing * 0.8;
    if (rightArmRef.current) rightArmRef.current.rotation.x = swing * 0.8;
  });

  return (
    <group>
      {/* Head */}
      <mesh position={[0, 1.65, 0]} castShadow>
        <sphereGeometry args={[0.2, 10, 10]} />
        <meshStandardMaterial color="#f0c8a0" />
      </mesh>

      {/* Body / torso */}
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[0.5, 0.55, 0.28]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* ---- Legs (pivot at hip) ---- */}
      <group ref={leftLegRef} position={[-0.13, 0.9, 0]}>
        <mesh position={[0, -0.33, 0]} castShadow>
          <boxGeometry args={[0.16, 0.66, 0.18]} />
          <meshStandardMaterial color="#2c3e50" />
        </mesh>
        {/* Shoe */}
        <mesh position={[0, -0.68, 0.04]} castShadow>
          <boxGeometry args={[0.17, 0.08, 0.24]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
      </group>

      <group ref={rightLegRef} position={[0.13, 0.9, 0]}>
        <mesh position={[0, -0.33, 0]} castShadow>
          <boxGeometry args={[0.16, 0.66, 0.18]} />
          <meshStandardMaterial color="#2c3e50" />
        </mesh>
        <mesh position={[0, -0.68, 0.04]} castShadow>
          <boxGeometry args={[0.17, 0.08, 0.24]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
      </group>

      {/* ---- Arms (pivot at shoulder) ---- */}
      <group ref={leftArmRef} position={[-0.34, 1.38, 0]}>
        <mesh position={[0, -0.24, 0]} castShadow>
          <boxGeometry args={[0.13, 0.48, 0.14]} />
          <meshStandardMaterial color={color} />
        </mesh>
        {/* Hand */}
        <mesh position={[0, -0.52, 0]} castShadow>
          <sphereGeometry args={[0.06, 6, 6]} />
          <meshStandardMaterial color="#f0c8a0" />
        </mesh>
      </group>

      <group ref={rightArmRef} position={[0.34, 1.38, 0]}>
        <mesh position={[0, -0.24, 0]} castShadow>
          <boxGeometry args={[0.13, 0.48, 0.14]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[0, -0.52, 0]} castShadow>
          <sphereGeometry args={[0.06, 6, 6]} />
          <meshStandardMaterial color="#f0c8a0" />
        </mesh>
      </group>
    </group>
  );
}
