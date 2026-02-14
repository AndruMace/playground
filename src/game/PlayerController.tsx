import { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { CharacterModel } from './CharacterModel';
import { CarModel } from './CarModel';
import { AirplaneModel } from './AirplaneModel';
import {
  getNearestTrackInfo,
  isOnTrack,
  getCheckpointTs,
  getStartPosition,
  getTrackElevation,
  TOTAL_LAPS,
  TRACK_WIDTH,
} from './trackPath';
import type { PlayerState, VehicleMode, RemotePlayer } from '../types';
import type { FrameMouse } from './Scene';

// ── Physics constants ─────────────────────────────────────────────────

const WALK = {
  speed: 8,
  runSpeed: 16,
};

const DRIVE = {
  maxSpeed: 90,
  acceleration: 40,
  braking: 55,
  reverseMax: 18,
  friction: 0.985,
  turnSpeed: 2.2,
  grassFriction: 0.978,
  grassMaxSpeed: 65,
};

const FLY = {
  maxSpeed: 120,
  acceleration: 28,
  brake: 22,
  drag: 0.992,
  turnSpeed: 1.4,
  climbRate: 25,
  gravity: 10,
  minFlySpeed: 20,
  maxAltitude: 250,
  groundY: 1.5,
  bankAngle: 0.45,
};

// ── Bullet constants ──────────────────────────────────────────────────

const MAX_BULLETS = 30;
const BULLET_SPEED = 280;
const BULLET_LIFETIME = 2.5;
const FIRE_COOLDOWN = 0.09; // ~11 rounds/sec

interface Bullet {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
}

function makeBulletPool(): Bullet[] {
  return Array.from({ length: MAX_BULLETS }, () => ({
    active: false,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    age: 0,
  }));
}

// ── Aerial targets ─────────────────────────────────────────────────

// ── Vehicle collision constants ─────────────────────────────────────

const CAR_COLLISION_RADIUS = 1.2;
const PLANE_COLLISION_RADIUS = 2.0;
const COLLISION_BOUNCE = 0.6; // how much speed transfers on impact

// ── Ramp definition ────────────────────────────────────────────────

export const RAMP = {
  // Off-track stunt area, east of the track near the start
  x: 130,
  z: 200,
  width: 14,      // side-to-side
  length: 20,     // along the slope direction
  height: 3.5,    // peak height at the far edge
  rotation: Math.PI / 2, // slope rises toward +X
};

// Max height change the car/player can step up per frame (prevents wall-climbing)
const MAX_STEP_UP = 0.6;

const TARGET_HIT_RADIUS = 4;
const TARGET_HIT_RADIUS_SQ = TARGET_HIT_RADIUS * TARGET_HIT_RADIUS;
const TARGET_RESPAWN_TIME = 3; // seconds

interface AerialTarget {
  pos: THREE.Vector3;
  alive: boolean;
  respawnTimer: number; // counts down when dead
}

function makeTargets(): AerialTarget[] {
  // Targets scattered around the sky at various heights
  return [
    { pos: new THREE.Vector3(40, 50, 60), alive: true, respawnTimer: 0 },
    { pos: new THREE.Vector3(-60, 70, 30), alive: true, respawnTimer: 0 },
    { pos: new THREE.Vector3(20, 40, -80), alive: true, respawnTimer: 0 },
    { pos: new THREE.Vector3(-30, 90, -40), alive: true, respawnTimer: 0 },
    { pos: new THREE.Vector3(80, 60, -20), alive: true, respawnTimer: 0 },
    { pos: new THREE.Vector3(-70, 55, 70), alive: true, respawnTimer: 0 },
    { pos: new THREE.Vector3(0, 80, 0), alive: true, respawnTimer: 0 },
    { pos: new THREE.Vector3(50, 45, 90), alive: true, respawnTimer: 0 },
    { pos: new THREE.Vector3(-90, 65, -60), alive: true, respawnTimer: 0 },
    { pos: new THREE.Vector3(70, 100, 50), alive: true, respawnTimer: 0 },
  ];
}

// ── Vehicle definitions ───────────────────────────────────────────────

interface VehicleState {
  id: string;
  type: 'car' | 'airplane';
  label: string;
  color: string;
  pos: THREE.Vector3;
  rot: number;
  speed: number;
  pitch: number;
}

function makeVehicles(): VehicleState[] {
  const start = getStartPosition();
  const sy = start.position.y - 0.5; // base track elevation at start
  return [
    // ── Cars ──
    {
      id: 'car-red',
      type: 'car',
      label: 'Red Racer',
      color: '#e63946',
      pos: new THREE.Vector3(start.position.x + 12, sy, start.position.z + 10),
      rot: start.rotation,
      speed: 0,
      pitch: 0,
    },
    {
      id: 'car-blue',
      type: 'car',
      label: 'Blue Bolt',
      color: '#457b9d',
      pos: new THREE.Vector3(start.position.x + 12, sy, start.position.z + 16),
      rot: start.rotation,
      speed: 0,
      pitch: 0,
    },
    {
      id: 'car-green',
      type: 'car',
      label: 'Green Machine',
      color: '#2a9d8f',
      pos: new THREE.Vector3(start.position.x + 12, sy, start.position.z + 22),
      rot: start.rotation,
      speed: 0,
      pitch: 0,
    },
    {
      id: 'car-orange',
      type: 'car',
      label: 'Orange Fury',
      color: '#e76f51',
      pos: new THREE.Vector3(start.position.x + 18, sy, start.position.z + 10),
      rot: start.rotation,
      speed: 0,
      pitch: 0,
    },
    // ── Airplanes ──
    {
      id: 'plane-blue',
      type: 'airplane',
      label: 'Sky Hawk',
      color: '#4488cc',
      pos: new THREE.Vector3(start.position.x + 25, FLY.groundY, start.position.z),
      rot: start.rotation,
      speed: 0,
      pitch: 0,
    },
    {
      id: 'plane-red',
      type: 'airplane',
      label: 'Red Baron',
      color: '#cc3333',
      pos: new THREE.Vector3(start.position.x + 25, FLY.groundY, start.position.z + 10),
      rot: start.rotation,
      speed: 0,
      pitch: 0,
    },
    {
      id: 'plane-gold',
      type: 'airplane',
      label: 'Golden Eagle',
      color: '#d4a017',
      pos: new THREE.Vector3(start.position.x + 25, FLY.groundY, start.position.z + 20),
      rot: start.rotation,
      speed: 0,
      pitch: 0,
    },
  ];
}

// ── Interaction radius ────────────────────────────────────────────────

const INTERACT_RADIUS_SQ = 6 * 6; // 6 units

// ── Aim projection type ──────────────────────────────────────────────

export interface AimScreen {
  x: number; // 0–1 fraction of viewport width
  y: number; // 0–1 fraction of viewport height
  visible: boolean;
}

// ── Component ─────────────────────────────────────────────────────────

interface Props {
  playerColor: string;
  stateRef: React.MutableRefObject<PlayerState>;
  mouseRef: React.MutableRefObject<FrameMouse>;
  aimRef: React.MutableRefObject<AimScreen>;
  orbitYawRef: React.MutableRefObject<number>;
  takenVehicleIds: Set<string>;
  remotePlayers: RemotePlayer[];
  onStateUpdate: (state: PlayerState) => void;
  onLapComplete: (lapTime: number) => void;
  onRaceFinish: (bestLapTime: number) => void;
}

export function PlayerController({
  playerColor,
  stateRef,
  mouseRef,
  aimRef,
  orbitYawRef,
  takenVehicleIds,
  remotePlayers,
  onStateUpdate,
  onLapComplete,
  onRaceFinish,
}: Props) {
  // ── Mode ────────────────────────────────────────────────────────────
  const modeRef = useRef<VehicleMode>('walking');
  const [displayMode, setDisplayMode] = useState<VehicleMode>('walking');

  // ── Character state ─────────────────────────────────────────────────
  const startPos = getStartPosition();
  const charPos = useRef(
    new THREE.Vector3(startPos.position.x, 0, startPos.position.z + 12),
  );
  const charRot = useRef(startPos.rotation);
  const isMovingRef = useRef(false);

  // ── Vehicles ────────────────────────────────────────────────────────
  const vehicles = useRef<VehicleState[]>(makeVehicles());
  const activeIdx = useRef<number | null>(null);
  const nearbyRef = useRef<string | null>(null);

  // ── Racing state ────────────────────────────────────────────────────
  const race = useRef({
    active: false,
    lap: 0,
    lapStart: 0,
    raceStart: 0,
    bestLap: null as number | null,
    checkpoints: [] as boolean[],
    started: false,
    lastT: 0,
    finished: false,
  });

  // ── Input ───────────────────────────────────────────────────────────
  const keys = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    space: false,
    shift: false,
  });
  const interactPressed = useRef(false);

  // ── 3D group refs ──────────────────────────────────────────────────
  const charGroupRef = useRef<THREE.Group>(null);
  const vehicleGroupRefs = useRef<Record<string, THREE.Group | null>>({});
  const planeBankRef = useRef(0);

  // ── Camera (for aim projection) ──────────────────────────────────────
  const { camera } = useThree();

  // ── Driving boost ──────────────────────────────────────────────────
  const boostMeter = useRef(100);

  // ── Car jump ─────────────────────────────────────────────────────
  const carVelY = useRef(0);
  const carOnGround = useRef(true);

  // ── Smooth flight angular velocities ───────────────────────────────
  const flyYawVel = useRef(0);
  const flyPitchVel = useRef(0);

  // ── Bullet system ──────────────────────────────────────────────────
  const bullets = useRef<Bullet[]>(makeBulletPool());
  const bulletMeshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const lastFireTime = useRef(0);
  const fireLeftRef = useRef(true); // alternates left/right gun
  const muzzleLeftRef = useRef<THREE.Mesh>(null);
  const muzzleRightRef = useRef<THREE.Mesh>(null);
  const muzzleTimer = useRef(0);

  // ── Aerial targets ────────────────────────────────────────────────
  const targets = useRef<AerialTarget[]>(makeTargets());
  const targetMeshRefs = useRef<(THREE.Group | null)[]>([]);

  // ── Update timer ───────────────────────────────────────────────────
  const syncTimer = useRef(0);

  // ── Keyboard ───────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = keys.current;
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
        case 'KeyE':
          interactPressed.current = true;
          break;
        case 'Space':
          k.space = true;
          e.preventDefault();
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          k.shift = true;
          break;
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = keys.current;
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
        case 'Space':
          k.space = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          k.shift = false;
          break;
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // ── Frame loop ─────────────────────────────────────────────────────

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const k = keys.current;
    const justE = interactPressed.current;
    interactPressed.current = false;

    const mode = modeRef.current;

    if (mode === 'walking') tickWalking(dt, k, justE);
    else if (mode === 'driving') tickDriving(dt, k, justE);
    else if (mode === 'flying') tickFlying(dt, k, justE);

    // ── Weapon system (flying only) ──
    if (mode === 'flying' && mouseRef.current.fireDown) {
      const now = performance.now() / 1000;
      if (now - lastFireTime.current >= FIRE_COOLDOWN) {
        lastFireTime.current = now;
        fireBullet();
      }
    }
    tickBullets(dt);
    tickMuzzleFlash(dt);
    tickTargets(dt);
    tickVehicleCollisions();

    updateVisuals(dt);
    updateAimProjection();

    // Periodic sync to React state / HUD
    syncTimer.current += dt;
    if (syncTimer.current > 0.066) {
      syncTimer.current = 0;
      syncToReact();
    }
  });

  // ── Walking ────────────────────────────────────────────────────────

  function tickWalking(
    dt: number,
    k: typeof keys.current,
    justE: boolean,
  ) {
    const running = k.shift;
    const baseSpeed = running ? WALK.runSpeed : WALK.speed;

    // Camera world-space yaw (character heading + orbit offset)
    const camYaw = charRot.current + orbitYawRef.current;

    // Build movement vector relative to camera direction
    let moveX = 0;
    let moveZ = 0;

    if (k.forward) {
      moveX += Math.sin(camYaw);
      moveZ += Math.cos(camYaw);
    }
    if (k.backward) {
      moveX -= Math.sin(camYaw) * 0.4;
      moveZ -= Math.cos(camYaw) * 0.4;
    }
    if (k.left) {
      moveX += Math.sin(camYaw + Math.PI / 2);
      moveZ += Math.cos(camYaw + Math.PI / 2);
    }
    if (k.right) {
      moveX += Math.sin(camYaw - Math.PI / 2);
      moveZ += Math.cos(camYaw - Math.PI / 2);
    }

    const moveLen = Math.sqrt(moveX * moveX + moveZ * moveZ);

    if (moveLen > 0.001) {
      // Normalise and apply speed
      const nx = (moveX / moveLen) * baseSpeed;
      const nz = (moveZ / moveLen) * baseSpeed;
      charPos.current.x += nx * dt;
      charPos.current.z += nz * dt;

      // Smoothly rotate character to face movement direction
      const targetRot = Math.atan2(moveX / moveLen, moveZ / moveLen);
      let diff = targetRot - charRot.current;
      // Normalise to [−π, π]
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      const prevRot = charRot.current;
      charRot.current += diff * Math.min(1, 12 * dt);

      // Compensate orbit yaw so the camera doesn't over-rotate
      const rotDelta = charRot.current - prevRot;
      orbitYawRef.current -= rotDelta;

      // Keep yaw in [−π, π]
      if (orbitYawRef.current > Math.PI) orbitYawRef.current -= Math.PI * 2;
      if (orbitYawRef.current < -Math.PI) orbitYawRef.current += Math.PI * 2;

      isMovingRef.current = true;
    } else {
      isMovingRef.current = false;
    }

    // Ramp surface — walk up the slope but block the wall
    const walkRampH = getGroundHeight(charPos.current.x, charPos.current.z);
    if (walkRampH - charPos.current.y > MAX_STEP_UP) {
      // Wall — push back
      charPos.current.x -= (moveLen > 0.001 ? (moveX / moveLen) : 0) * baseSpeed * dt;
      charPos.current.z -= (moveLen > 0.001 ? (moveZ / moveLen) : 0) * baseSpeed * dt;
      charPos.current.y = getGroundHeight(charPos.current.x, charPos.current.z);
    } else {
      charPos.current.y = walkRampH;
    }

    // Proximity check – pick the closest available vehicle within range
    nearbyRef.current = null;
    let bestDist = INTERACT_RADIUS_SQ;
    for (const v of vehicles.current) {
      // Skip vehicles taken by remote players
      if (takenVehicleIds.has(v.id)) continue;
      const vdx = charPos.current.x - v.pos.x;
      const vdz = charPos.current.z - v.pos.z;
      const d2 = vdx * vdx + vdz * vdz;
      if (d2 < bestDist) {
        bestDist = d2;
        nearbyRef.current = v.id;
      }
    }

    // Enter vehicle
    if (justE && nearbyRef.current) {
      const idx = vehicles.current.findIndex(
        (v) => v.id === nearbyRef.current,
      );
      if (idx >= 0) {
        const v = vehicles.current[idx];
        activeIdx.current = idx;
        const newMode: VehicleMode = v.type === 'car' ? 'driving' : 'flying';
        modeRef.current = newMode;
        setDisplayMode(newMode);
        nearbyRef.current = null;

        if (v.type === 'car') {
          const now = performance.now();
          race.current = {
            active: true,
            lap: 0,
            lapStart: now,
            raceStart: now,
            bestLap: null,
            checkpoints: getCheckpointTs().map(() => false),
            started: false,
            lastT: 0,
            finished: false,
          };
        }
      }
    }
  }

  // ── Driving ────────────────────────────────────────────────────────

  function tickDriving(
    dt: number,
    k: typeof keys.current,
    justE: boolean,
  ) {
    if (justE) {
      exitVehicle();
      return;
    }

    const v = vehicles.current[activeIdx.current!];
    const r = race.current;
    if (r.finished) return;

    // ── Boost ──
    const boosting = k.shift && boostMeter.current > 0 && k.forward;
    if (boosting) {
      boostMeter.current = Math.max(0, boostMeter.current - 30 * dt);
    } else {
      boostMeter.current = Math.min(100, boostMeter.current + 12 * dt);
    }
    const boostSpeedMult = boosting ? 1.5 : 1;
    const boostAccelMult = boosting ? 1.8 : 1;

    const pos3 = new THREE.Vector3(v.pos.x, 0, v.pos.z);
    const onRoad = isOnTrack(pos3);
    const maxSpd = (onRoad ? DRIVE.maxSpeed : DRIVE.grassMaxSpeed) * boostSpeedMult;
    const fric = onRoad ? DRIVE.friction : DRIVE.grassFriction;

    // Acceleration
    if (k.forward) v.speed += DRIVE.acceleration * boostAccelMult * dt;
    if (k.backward) {
      v.speed > 0
        ? (v.speed -= DRIVE.braking * dt)
        : (v.speed -= DRIVE.acceleration * 0.5 * dt);
    }
    v.speed *= fric;
    v.speed = Math.max(-DRIVE.reverseMax, Math.min(maxSpd, v.speed));
    if (Math.abs(v.speed) < 0.15 && !k.forward && !k.backward) v.speed = 0;

    // Steering
    const turn = (k.left ? 1 : 0) - (k.right ? 1 : 0);
    const sf = Math.min(Math.abs(v.speed) / 8, 1);
    v.rot += turn * DRIVE.turnSpeed * sf * dt * Math.sign(v.speed || 1);

    // Move
    v.pos.x += Math.sin(v.rot) * v.speed * dt;
    v.pos.z += Math.cos(v.rot) * v.speed * dt;

    // ── Vertical physics: ramp + jump + gravity ──
    const groundLevel = getGroundHeight(v.pos.x, v.pos.z);

    if (carOnGround.current) {
      const prevY = v.pos.y;
      const heightDiff = groundLevel - prevY;

      if (heightDiff > MAX_STEP_UP) {
        // Wall! Ground level jumped too high — push the car back
        v.pos.x -= Math.sin(v.rot) * v.speed * dt;
        v.pos.z -= Math.cos(v.rot) * v.speed * dt;
        v.speed *= -0.3; // bounce off the wall
      } else if (groundLevel >= prevY - 0.3) {
        // Surface is at or near us — track it (driving up slope, or flat)
        carVelY.current = heightDiff / Math.max(dt, 0.001);
        v.pos.y = groundLevel;
      } else {
        // Ground dropped away (drove off the top edge) — go airborne
        carOnGround.current = false;
      }

      // Jump
      if (k.space && carOnGround.current) {
        carVelY.current += 14;
        carOnGround.current = false;
      }
    } else {
      // Airborne — apply gravity
      carVelY.current -= 40 * dt;
      v.pos.y += carVelY.current * dt;

      if (v.pos.y <= groundLevel) {
        v.pos.y = groundLevel;
        carVelY.current = 0;
        carOnGround.current = true;
      }
    }

    // ── Lap tracking ─────────────────────────────────────────────────
    const nearest = getNearestTrackInfo(pos3);
    if (nearest.distance < TRACK_WIDTH * 1.2) {
      const prevT = r.lastT;
      const currT = nearest.t;

      if (!r.started && currT > 0.05) r.started = true;

      if (r.started) {
        const tDelta = currT - prevT;
        if (tDelta > 0 && tDelta < 0.5) {
          const cpTs = getCheckpointTs();
          for (let i = 0; i < cpTs.length; i++) {
            if (!r.checkpoints[i] && prevT < cpTs[i] && currT >= cpTs[i]) {
              r.checkpoints[i] = true;
            }
          }
        }

        if (prevT > 0.85 && currT < 0.15 && r.checkpoints.every(Boolean)) {
          const now = performance.now();
          const lapTime = now - r.lapStart;
          r.lap++;
          if (r.bestLap === null || lapTime < r.bestLap) r.bestLap = lapTime;
          onLapComplete(lapTime);

          if (r.lap >= TOTAL_LAPS) {
            r.finished = true;
            onRaceFinish(r.bestLap);
          }
          r.lapStart = now;
          r.checkpoints = getCheckpointTs().map(() => false);
        }
      }
      r.lastT = currT;
    }
  }

  // ── Flying (smooth inertial mouse controls) ────────────────────────

  function tickFlying(
    dt: number,
    k: typeof keys.current,
    justE: boolean,
  ) {
    const v = vehicles.current[activeIdx.current!];
    const mouse = mouseRef.current;

    // Exit – only when near ground
    if (justE && v.pos.y <= FLY.groundY + 1) {
      v.speed = 0;
      v.pos.y = FLY.groundY;
      v.pitch = 0;
      flyYawVel.current = 0;
      flyPitchVel.current = 0;
      exitVehicle();
      return;
    }

    // Throttle (W / S)
    if (k.forward) v.speed += FLY.acceleration * dt;
    if (k.backward) v.speed -= FLY.brake * dt;
    v.speed *= FLY.drag;
    v.speed = Math.max(0, Math.min(FLY.maxSpeed, v.speed));

    // ── Smooth yaw: mouse impulse → angular velocity → decay ──
    flyYawVel.current += -mouse.dx * 0.002;
    flyYawVel.current *= 1 - 5 * dt; // half-life ~0.14s

    // A/D supplementary yaw
    // const turn = (k.left ? 1 : 0) - (k.right ? 1 : 0);
    // flyYawVel.current += turn * FLY.turnSpeed * dt;

    // Apply yaw
    v.rot += flyYawVel.current * dt;

    // ── Smooth pitch: mouse impulse → angular velocity → decay ──
    flyPitchVel.current += mouse.dy * 0.0015;
    flyPitchVel.current *= 1 - 4 * dt; // half-life ~0.17s

    // Apply pitch
    v.pitch += flyPitchVel.current * dt;
    v.pitch = Math.max(-0.7, Math.min(0.7, v.pitch));

    // Gentle auto-level (brings pitch back to 0 over ~5s)
    v.pitch *= 1 - 0.2 * dt;

    // ── Altitude from pitch + manual controls ──
    let altDelta = 0;
    // Pitch-based climb: negative pitch = nose up = climb
    if (v.speed >= FLY.minFlySpeed * 0.5) {
      altDelta += v.speed * Math.sin(-v.pitch) * 0.5;
    }
    // Space / Shift for additional climb/descend
    if (k.space) altDelta += FLY.climbRate;
    if (k.shift) altDelta -= FLY.climbRate;
    // Gravity / stall
    if (v.pos.y > FLY.groundY + 0.5 && v.speed < FLY.minFlySpeed) {
      altDelta -= FLY.gravity;
    }

    v.pos.y = Math.max(
      FLY.groundY,
      Math.min(FLY.maxAltitude, v.pos.y + altDelta * dt),
    );

    // Movement
    v.pos.x += Math.sin(v.rot) * v.speed * dt;
    v.pos.z += Math.cos(v.rot) * v.speed * dt;

    // Bank visual (driven by yaw velocity – automatically reflects both mouse and keyboard)
    planeBankRef.current = flyYawVel.current * 2.0;
  }

  // ── Fire bullet ───────────────────────────────────────────────────

  function fireBullet() {
    const v = vehicles.current[activeIdx.current!];
    const pool = bullets.current;

    const b = pool.find((p) => !p.active);
    if (!b) return;

    // Forward direction (accounting for heading + pitch)
    const cp = Math.cos(v.pitch);
    const sp = Math.sin(v.pitch);
    const fwd = new THREE.Vector3(
      Math.sin(v.rot) * cp,
      -sp,
      Math.cos(v.rot) * cp,
    ).normalize();

    // Right direction (for wing offset)
    const right = new THREE.Vector3(Math.cos(v.rot), 0, -Math.sin(v.rot));

    // Alternate left/right gun
    const offset = fireLeftRef.current ? -2.8 : 2.8;
    fireLeftRef.current = !fireLeftRef.current;

    b.active = true;
    b.age = 0;
    b.pos.copy(v.pos);
    b.pos.addScaledVector(fwd, 3.5); // nose
    b.pos.addScaledVector(right, offset); // wing gun position

    b.vel.copy(fwd).multiplyScalar(BULLET_SPEED);
    // Add plane's velocity for realism
    b.vel.x += Math.sin(v.rot) * v.speed * 0.5;
    b.vel.z += Math.cos(v.rot) * v.speed * 0.5;

    // Muzzle flash
    muzzleTimer.current = 0.04;
    if (offset < 0) {
      if (muzzleLeftRef.current) muzzleLeftRef.current.visible = true;
    } else {
      if (muzzleRightRef.current) muzzleRightRef.current.visible = true;
    }
  }

  // ── Update bullets ────────────────────────────────────────────────

  function tickBullets(dt: number) {
    const pool = bullets.current;
    for (let i = 0; i < pool.length; i++) {
      const b = pool[i];
      const mesh = bulletMeshRefs.current[i];
      if (!b.active) {
        if (mesh) mesh.visible = false;
        continue;
      }

      b.age += dt;
      if (b.age > BULLET_LIFETIME || b.pos.y < -1) {
        b.active = false;
        if (mesh) mesh.visible = false;
        continue;
      }

      // Move + slight gravity
      b.pos.addScaledVector(b.vel, dt);
      b.vel.y -= 9.8 * dt;

      // Check bullet ↔ target collisions
      for (const t of targets.current) {
        if (!t.alive) continue;
        const dx = b.pos.x - t.pos.x;
        const dy = b.pos.y - t.pos.y;
        const dz = b.pos.z - t.pos.z;
        if (dx * dx + dy * dy + dz * dz < TARGET_HIT_RADIUS_SQ) {
          // Destroy target
          t.alive = false;
          t.respawnTimer = TARGET_RESPAWN_TIME;
          // Deactivate bullet
          b.active = false;
          if (mesh) mesh.visible = false;
          break;
        }
      }

      if (mesh && b.active) {
        mesh.visible = true;
        mesh.position.copy(b.pos);
      }
    }
  }

  // ── Target respawn & visuals ───────────────────────────────────────

  function tickTargets(dt: number) {
    for (let i = 0; i < targets.current.length; i++) {
      const t = targets.current[i];
      const grp = targetMeshRefs.current[i];

      if (!t.alive) {
        t.respawnTimer -= dt;
        if (t.respawnTimer <= 0) {
          t.alive = true;
        }
      }

      if (grp) {
        grp.visible = t.alive;
        // Gentle idle rotation
        grp.rotation.y += dt * 1.2;
      }
    }
  }

  // ── Vehicle-to-vehicle collision ─────────────────────────────────

  function tickVehicleCollisions() {
    const mode = modeRef.current;
    if (mode === 'walking') return; // no vehicle collision when walking

    if (activeIdx.current === null) return;
    const me = vehicles.current[activeIdx.current];
    const myRadius = me.type === 'car' ? CAR_COLLISION_RADIUS : PLANE_COLLISION_RADIUS;

    // Helper to resolve a collision against a position
    const resolveCollision = (
      ox: number,
      oz: number,
      otherRadius: number,
      pushOther: { x: number; z: number } | null,
    ) => {
      const minDist = myRadius + otherRadius;
      const dx = me.pos.x - ox;
      const dz = me.pos.z - oz;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < minDist && dist > 0.01) {
        const overlap = minDist - dist;
        const nx = dx / dist;
        const nz = dz / dist;

        // Push our vehicle out
        me.pos.x += nx * overlap * (pushOther ? 0.5 : 1.0);
        me.pos.z += nz * overlap * (pushOther ? 0.5 : 1.0);

        // Bounce speed
        const dot = Math.sin(me.rot) * nx + Math.cos(me.rot) * nz;
        if (dot > 0) {
          me.speed *= -COLLISION_BOUNCE;
        }

        // Push the other object if mutable
        if (pushOther) {
          pushOther.x -= nx * overlap * 0.5;
          pushOther.z -= nz * overlap * 0.5;
        }
      }
    };

    // Collide with other local (parked) vehicles
    for (let i = 0; i < vehicles.current.length; i++) {
      if (i === activeIdx.current) continue;
      const other = vehicles.current[i];
      const otherR = other.type === 'car' ? CAR_COLLISION_RADIUS : PLANE_COLLISION_RADIUS;
      resolveCollision(other.pos.x, other.pos.z, otherR, other.pos);
    }

    // Collide with remote players
    for (const rp of remotePlayers) {
      const rpRadius = rp.mode === 'flying' ? PLANE_COLLISION_RADIUS
                     : rp.mode === 'driving' ? CAR_COLLISION_RADIUS
                     : 1.0; // walking
      resolveCollision(rp.position[0], rp.position[2], rpRadius, null);
    }
  }

  // ── Ground height query (track elevation + ramp) ─────────────────

  const _tmpGroundPos = new THREE.Vector3();

  function getGroundHeight(x: number, z: number): number {
    // Track elevation
    _tmpGroundPos.set(x, 0, z);
    const trackY = getTrackElevation(_tmpGroundPos);

    // Ramp height (additive on top of whatever the base ground is)
    let rampY = 0;
    const lx = x - RAMP.x;
    const lz = z - RAMP.z;
    const cosR = Math.cos(RAMP.rotation);
    const sinR = Math.sin(RAMP.rotation);
    const rx = lx * cosR - lz * sinR;
    const rz = lx * sinR + lz * cosR;
    const halfW = RAMP.width / 2;
    const halfL = RAMP.length / 2;
    if (rx >= -halfW && rx <= halfW && rz >= -halfL && rz <= halfL) {
      const t = (rz + halfL) / RAMP.length;
      rampY = t * RAMP.height;
    }

    return Math.max(trackY, rampY);
  }

  // ── Muzzle flash timer ────────────────────────────────────────────

  function tickMuzzleFlash(dt: number) {
    if (muzzleTimer.current > 0) {
      muzzleTimer.current -= dt;
      if (muzzleTimer.current <= 0) {
        if (muzzleLeftRef.current) muzzleLeftRef.current.visible = false;
        if (muzzleRightRef.current) muzzleRightRef.current.visible = false;
      }
    }
  }

  // ── Exit vehicle ───────────────────────────────────────────────────

  function exitVehicle() {
    const v = vehicles.current[activeIdx.current!];
    // Place character beside vehicle
    const side = new THREE.Vector3(
      -Math.cos(v.rot) * 4,
      0,
      Math.sin(v.rot) * 4,
    );
    const exitX = v.pos.x + side.x;
    const exitZ = v.pos.z + side.z;
    charPos.current.set(exitX, getGroundHeight(exitX, exitZ), exitZ);
    charRot.current = v.rot;
    v.speed = 0;
    v.pos.y = getGroundHeight(v.pos.x, v.pos.z);
    activeIdx.current = null;
    race.current.active = false;
    modeRef.current = 'walking';
    setDisplayMode('walking');
    planeBankRef.current = 0;
    carVelY.current = 0;
    carOnGround.current = true;
  }

  // ── Update 3D visuals ─────────────────────────────────────────────

  function updateVisuals(dt: number) {
    // Character
    if (charGroupRef.current) {
      charGroupRef.current.position.set(
        charPos.current.x,
        charPos.current.y,
        charPos.current.z,
      );
      charGroupRef.current.rotation.y = charRot.current;
      charGroupRef.current.visible = modeRef.current === 'walking';
    }

    // All vehicles
    for (let i = 0; i < vehicles.current.length; i++) {
      const v = vehicles.current[i];
      const grp = vehicleGroupRefs.current[v.id];
      if (!grp) continue;

      grp.position.copy(v.pos);

      const isActive = activeIdx.current === i;

      if (v.type === 'car') {
        grp.rotation.y = v.rot;
        // Lean when turning
        if (modeRef.current === 'driving' && isActive) {
          const turn = (keys.current.left ? 1 : 0) - (keys.current.right ? 1 : 0);
          const sf = Math.min(Math.abs(v.speed) / 8, 1);
          grp.rotation.z = -turn * sf * 0.06;
        } else {
          grp.rotation.z = 0;
        }
      } else {
        // Airplane
        if (modeRef.current === 'flying' && isActive) {
          grp.rotation.order = 'YXZ';
          grp.rotation.y = v.rot;
          grp.rotation.x = v.pitch * 1.3;

          const targetBank = -planeBankRef.current * FLY.bankAngle;
          const currentBank = grp.rotation.z;
          grp.rotation.z =
            currentBank + (targetBank - currentBank) * Math.min(1, 6 * dt);
        } else {
          grp.rotation.order = 'XYZ';
          grp.rotation.set(0, v.rot, 0);
        }
      }
    }
  }

  // ── Aim projection (every frame → written to aimRef for DOM reticle) ─

  function updateAimProjection() {
    if (modeRef.current !== 'flying' || activeIdx.current === null) {
      aimRef.current.visible = false;
      return;
    }

    const v = vehicles.current[activeIdx.current!];
    const cp = Math.cos(v.pitch);
    const sp = Math.sin(v.pitch);
    const fwd = new THREE.Vector3(
      Math.sin(v.rot) * cp,
      -sp,
      Math.cos(v.rot) * cp,
    ).normalize();

    // Match actual bullet physics: fwd * BULLET_SPEED + plane velocity * 0.5
    const bulletVel = fwd.clone().multiplyScalar(BULLET_SPEED);
    bulletVel.x += Math.sin(v.rot) * v.speed * 0.5;
    bulletVel.z += Math.cos(v.rot) * v.speed * 0.5;

    // Predict position at T seconds (typical engagement range)
    const T = 0.35;
    const aimPoint = v.pos.clone().addScaledVector(bulletVel, T);
    aimPoint.y -= 0.5 * 9.8 * T * T; // gravity drop

    // Project to screen
    const projected = aimPoint.clone().project(camera);
    aimRef.current.x = (projected.x + 1) / 2;
    aimRef.current.y = (-projected.y + 1) / 2;
    aimRef.current.visible = true;
  }

  // ── Sync to React state for HUD ───────────────────────────────────

  function syncToReact() {
    const mode = modeRef.current;
    const r = race.current;
    let pos: [number, number, number];
    let rot: number;
    let speed: number;
    let alt = 0;

    if (mode === 'walking') {
      pos = [charPos.current.x, charPos.current.y, charPos.current.z];
      rot = charRot.current;
      speed = isMovingRef.current ? (keys.current.shift ? WALK.runSpeed : WALK.speed) : 0;
    } else {
      const v = vehicles.current[activeIdx.current!];
      pos = [v.pos.x, v.pos.y, v.pos.z];
      rot = v.rot;
      speed = v.speed;
      alt = v.pos.y;
    }

    const now = performance.now();
    const state: PlayerState = {
      mode,
      position: pos,
      rotation: rot,
      speed,
      altitude: alt,
      lap: r.active ? r.lap : 0,
      lapTime: r.active ? now - r.lapStart : 0,
      bestLapTime: r.bestLap,
      totalTime: r.active ? now - r.raceStart : 0,
      checkpoints: r.checkpoints ? [...r.checkpoints] : [],
      boost: boostMeter.current,
      nearbyVehicle: nearbyRef.current,
      nearbyVehicleLabel: nearbyRef.current
        ? (vehicles.current.find((v) => v.id === nearbyRef.current)?.label ?? null)
        : null,
      vehicleId: activeIdx.current != null ? vehicles.current[activeIdx.current].id : null,
      pitch: activeIdx.current != null ? vehicles.current[activeIdx.current].pitch : 0,
      bank: planeBankRef.current,
    };

    stateRef.current = state;
    onStateUpdate(state);
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <group>
      {/* ── Character ─────────────────────────────────────────────── */}
      <group ref={charGroupRef}>
        <CharacterModel isMovingRef={isMovingRef} color={playerColor} />
      </group>

      {/* ── Vehicles (dynamic) ────────────────────────────────────── */}
      {vehicles.current.map((v, idx) => {
        const isActive = activeIdx.current === idx;
        const isCar = v.type === 'car';
        const isPlane = v.type === 'airplane';
        const ringRadius = isCar ? 4.5 : 5;
        const labelY = isCar ? 3.2 : 3.5;

        // Hide vehicle entirely if a remote player is using it
        const takenByRemote = !isActive && takenVehicleIds.has(v.id);

        // Hide label when player is inside THIS vehicle
        const hideLabel = isCar
          ? displayMode === 'driving' && isActive
          : displayMode === 'flying' && isActive;

        return (
          <group
            key={v.id}
            ref={(el) => {
              vehicleGroupRefs.current[v.id] = el;
            }}
            visible={!takenByRemote}
          >
            {/* Model */}
            {isCar ? (
              <CarModel color={v.color} />
            ) : (
              <AirplaneModel
                color={v.color}
                active={displayMode === 'flying' && isActive}
              />
            )}

            {/* Muzzle flashes (planes only, active plane only) */}
            {isPlane && isActive && (
              <>
                <mesh ref={muzzleLeftRef} visible={false} position={[-2.8, -0.1, 2]}>
                  <sphereGeometry args={[0.35, 6, 6]} />
                  <meshBasicMaterial color="#ffcc00" toneMapped={false} />
                </mesh>
                <mesh ref={muzzleRightRef} visible={false} position={[2.8, -0.1, 2]}>
                  <sphereGeometry args={[0.35, 6, 6]} />
                  <meshBasicMaterial color="#ffcc00" toneMapped={false} />
                </mesh>
              </>
            )}

            {/* Label + interaction ring (visible when not inside this vehicle) */}
            {!hideLabel && (
              <>
                <Text
                  position={[0, labelY, 0]}
                  fontSize={0.8}
                  color="white"
                  anchorX="center"
                  anchorY="bottom"
                  outlineWidth={0.06}
                  outlineColor="#000"
                >
                  {v.label}
                </Text>
                <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[ringRadius, ringRadius + 0.5, 32]} />
                  <meshBasicMaterial
                    color={v.color}
                    transparent
                    opacity={0.25}
                    side={THREE.DoubleSide}
                  />
                </mesh>
              </>
            )}
          </group>
        );
      })}

      {/* ── Aerial targets ───────────────────────────────────────── */}
      {targets.current.map((t, i) => (
        <group
          key={`target-${i}`}
          position={[t.pos.x, t.pos.y, t.pos.z]}
          ref={(el) => {
            targetMeshRefs.current[i] = el;
          }}
        >
          <mesh>
            <sphereGeometry args={[3, 16, 16]} />
            <meshStandardMaterial
              color="#ff3333"
              emissive="#ff4444"
              emissiveIntensity={0.7}
              roughness={0.3}
              metalness={0.2}
            />
          </mesh>
        </group>
      ))}

      {/* ── Bullets ───────────────────────────────────────────────── */}
      {Array.from({ length: MAX_BULLETS }, (_, i) => (
        <mesh
          key={`bullet-${i}`}
          ref={(el) => {
            bulletMeshRefs.current[i] = el;
          }}
          visible={false}
        >
          <sphereGeometry args={[0.25, 6, 6]} />
          <meshBasicMaterial color="#ffaa00" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
