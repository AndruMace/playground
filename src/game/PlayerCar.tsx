import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CarModel } from './CarModel';
import {
  getNearestTrackInfo,
  isOnTrack,
  getCheckpointTs,
  TOTAL_LAPS,
} from './trackPath';
import type { PlayerState } from '../types';

const CAR = {
  maxSpeed: 60,
  acceleration: 32,
  braking: 50,
  reverseMax: 15,
  friction: 0.985,
  turnSpeed: 2.2,
  grassFriction: 0.94,
  grassMaxSpeed: 18,
};

interface PlayerCarProps {
  racing: boolean;
  color: string;
  stateRef: React.MutableRefObject<PlayerState>;
  onStateUpdate: (state: PlayerState) => void;
  onLapComplete: (lapTime: number) => void;
  onRaceFinish: (bestLapTime: number) => void;
}

export function PlayerCar({
  racing,
  color,
  stateRef,
  onStateUpdate,
  onLapComplete,
  onRaceFinish,
}: PlayerCarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const keysRef = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
  });
  const lastT = useRef(0);
  const lapStartTime = useRef(0);
  const raceStartTime = useRef(0);
  const checkpointsRef = useRef<boolean[]>([]);
  const updateTimer = useRef(0);
  const hasMovedRef = useRef(false);
  const finishedRef = useRef(false);

  // Keyboard handlers
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = keysRef.current;
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          k.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          k.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          k.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          k.right = true;
          break;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const k = keysRef.current;
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          k.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          k.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          k.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          k.right = false;
          break;
      }
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  // Reset when race starts
  useEffect(() => {
    if (racing) {
      const now = performance.now();
      raceStartTime.current = now;
      lapStartTime.current = now;
      checkpointsRef.current = getCheckpointTs().map(() => false);
      hasMovedRef.current = false;
      finishedRef.current = false;
      lastT.current = 0;
    }
  }, [racing]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const state = stateRef.current;

    if (!racing) {
      // Just render at current position
      groupRef.current.position.set(...state.position);
      groupRef.current.rotation.y = state.rotation;
      return;
    }

    if (finishedRef.current) return;

    const dt = Math.min(delta, 0.05);
    const keys = keysRef.current;
    const pos3 = new THREE.Vector3(state.position[0], 0, state.position[2]);
    const onTrack = isOnTrack(pos3);

    // Surface properties
    const maxSpeed = onTrack ? CAR.maxSpeed : CAR.grassMaxSpeed;
    const friction = onTrack ? CAR.friction : CAR.grassFriction;

    // Acceleration / braking
    if (keys.forward) {
      state.speed += CAR.acceleration * dt;
    }
    if (keys.backward) {
      if (state.speed > 0) {
        state.speed -= CAR.braking * dt;
      } else {
        state.speed -= CAR.acceleration * 0.5 * dt;
      }
    }

    // Apply friction
    state.speed *= friction;

    // Clamp speed
    state.speed = Math.max(-CAR.reverseMax, Math.min(maxSpeed, state.speed));

    // Dead zone
    if (Math.abs(state.speed) < 0.15 && !keys.forward && !keys.backward) {
      state.speed = 0;
    }

    // Steering
    const turnInput = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
    const speedFactor = Math.min(Math.abs(state.speed) / 8, 1);
    const turnAmount =
      turnInput * CAR.turnSpeed * speedFactor * dt * Math.sign(state.speed || 1);
    state.rotation += turnAmount;

    // Movement
    state.position[0] += Math.sin(state.rotation) * state.speed * dt;
    state.position[2] += Math.cos(state.rotation) * state.speed * dt;

    // Update mesh
    groupRef.current.position.set(...state.position);
    groupRef.current.rotation.y = state.rotation;

    // Slight body lean when turning
    groupRef.current.rotation.z = -turnInput * speedFactor * 0.06;

    // ---- Lap tracking ----
    const nearest = getNearestTrackInfo(pos3);
    const prevT = lastT.current;
    const currT = nearest.t;

    // Mark that we've started moving
    if (!hasMovedRef.current && currT > 0.05) {
      hasMovedRef.current = true;
    }

    // Only check when we've actually moved along the track
    if (hasMovedRef.current) {
      const tDelta = currT - prevT;
      const isForwardMotion = tDelta > 0 && tDelta < 0.5;

      // Check checkpoints (forward direction only)
      if (isForwardMotion) {
        const cpTs = getCheckpointTs();
        for (let i = 0; i < cpTs.length; i++) {
          if (!checkpointsRef.current[i] && prevT < cpTs[i] && currT >= cpTs[i]) {
            checkpointsRef.current[i] = true;
          }
        }
      }

      // Lap completion: t wraps from high (~0.95+) to low (~0.05-)
      if (prevT > 0.85 && currT < 0.15) {
        const allPassed = checkpointsRef.current.every((c) => c);
        if (allPassed) {
          const now = performance.now();
          const lapTime = now - lapStartTime.current;

          state.lap++;
          if (state.bestLapTime === null || lapTime < state.bestLapTime) {
            state.bestLapTime = lapTime;
          }

          onLapComplete(lapTime);

          if (state.lap >= TOTAL_LAPS) {
            state.totalTime = now - raceStartTime.current;
            finishedRef.current = true;
            onRaceFinish(state.bestLapTime);
          }

          lapStartTime.current = now;
          checkpointsRef.current = getCheckpointTs().map(() => false);
        }
      }
    }

    lastT.current = currT;

    // Timing
    const now = performance.now();
    state.lapTime = now - lapStartTime.current;
    state.totalTime = now - raceStartTime.current;

    // Periodic HUD/network updates (~15 FPS)
    updateTimer.current += dt;
    if (updateTimer.current > 0.066) {
      updateTimer.current = 0;
      onStateUpdate({ ...state, checkpoints: [...state.checkpoints] });
    }
  });

  return (
    <group ref={groupRef}>
      <CarModel color={color} />
    </group>
  );
}
