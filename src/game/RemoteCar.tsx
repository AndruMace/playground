import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import { CarModel } from './CarModel';
import { AirplaneModel } from './AirplaneModel';
import { CharacterModel } from './CharacterModel';
import type { RemotePlayer } from '../types';

const FLY_BANK_ANGLE = 0.45;

interface RemoteCarProps {
  player: RemotePlayer;
}

export function RemoteCar({ player }: RemoteCarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const planeInnerRef = useRef<THREE.Group>(null);
  const isMovingRef = useRef(false);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const target = new THREE.Vector3(...player.position);
    const lerp = 1 - Math.exp(-10 * delta);

    // Smooth position interpolation
    groupRef.current.position.lerp(target, lerp);

    // Smooth yaw interpolation
    const current = groupRef.current.rotation.y;
    let diff = player.rotation - current;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    groupRef.current.rotation.y = current + diff * lerp;

    // Pitch + bank for flying mode
    if (planeInnerRef.current && player.mode === 'flying') {
      planeInnerRef.current.rotation.order = 'YXZ';
      // Smooth pitch
      const targetPitch = player.pitch * 1.3;
      planeInnerRef.current.rotation.x +=
        (targetPitch - planeInnerRef.current.rotation.x) * Math.min(1, 6 * delta);
      // Smooth bank
      const targetBank = -player.bank * FLY_BANK_ANGLE;
      planeInnerRef.current.rotation.z +=
        (targetBank - planeInnerRef.current.rotation.z) * Math.min(1, 6 * delta);
    }

    // Update moving state for walk animation
    isMovingRef.current = Math.abs(player.speed) > 0.5;
  });

  const nameTagY = player.mode === 'flying' ? 3.5 : player.mode === 'driving' ? 3 : 2.5;

  return (
    <group ref={groupRef}>
      {/* Render model based on current mode */}
      {player.mode === 'walking' && (
        <CharacterModel isMovingRef={isMovingRef} color={player.color} />
      )}
      {player.mode === 'driving' && (
        <CarModel color={player.color} />
      )}
      {player.mode === 'flying' && (
        <group ref={planeInnerRef}>
          <AirplaneModel color={player.color} active />
        </group>
      )}

      {/* Name tag floating above */}
      <Text
        position={[0, nameTagY, 0]}
        fontSize={0.8}
        color="white"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.05}
        outlineColor="#000000"
      >
        {player.name}
      </Text>
    </group>
  );
}
