import { useRef, useMemo, useState, useEffect, useCallback, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import * as THREE from 'three';
import { Track } from './Track';
import { getNearestTrackInfo, TRACK_WIDTH } from './trackPath';
import { PlayerController, RAMP } from './PlayerController';
import type { AimScreen } from './PlayerController';
import { RemoteCar } from './RemoteCar';
import type { PlayerState, RemotePlayer, GamePhase } from '../types';

// ── Shared mouse-delta type ───────────────────────────────────────────

export interface FrameMouse {
  dx: number;
  dy: number;
  fireDown: boolean;
}

// ── Pointer-lock + mouse-delta tracker (runs inside Canvas) ──────────

function MouseInput({
  frameMouseRef,
  phase,
  onLockChange,
}: {
  frameMouseRef: React.MutableRefObject<FrameMouse>;
  phase: GamePhase;
  onLockChange: (locked: boolean) => void;
}) {
  const { gl } = useThree();
  const accumRef = useRef({ dx: 0, dy: 0, fireDown: false });
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const canvas = gl.domElement;

    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement === canvas) {
        accumRef.current.dx += e.movementX;
        accumRef.current.dy += e.movementY;
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement === canvas && e.button === 0) {
        accumRef.current.fireDown = true;
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        accumRef.current.fireDown = false;
      }
    };

    const onClick = () => {
      if (
        phaseRef.current === 'playing' &&
        document.pointerLockElement !== canvas
      ) {
        canvas.requestPointerLock();
      }
    };

    const onLock = () => {
      const locked = document.pointerLockElement === canvas;
      if (!locked) accumRef.current.fireDown = false;
      onLockChange(locked);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('click', onClick);
    document.addEventListener('pointerlockchange', onLock);

    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('click', onClick);
      document.removeEventListener('pointerlockchange', onLock);
    };
  }, [gl, onLockChange]);

  // Release pointer lock when leaving 'playing'
  useEffect(() => {
    if (phase !== 'playing' && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [phase]);

  // Snapshot accumulated deltas each frame (runs first via priority -100)
  useFrame(() => {
    frameMouseRef.current.dx = accumRef.current.dx;
    frameMouseRef.current.dy = accumRef.current.dy;
    frameMouseRef.current.fireDown = accumRef.current.fireDown;
    accumRef.current.dx = 0;
    accumRef.current.dy = 0;
  }, -100);

  return null;
}

// ── Camera controller ─────────────────────────────────────────────────

const ORBIT_SENS = 0.003;
const PITCH_MIN = 0.1;
const PITCH_MAX = 1.35;

function CameraController({
  phase,
  stateRef,
  mouseRef,
  orbitYawRef,
}: {
  phase: GamePhase;
  stateRef: React.MutableRefObject<PlayerState>;
  mouseRef: React.MutableRefObject<FrameMouse>;
  orbitYawRef: React.MutableRefObject<number>;
}) {
  const { camera } = useThree();
  const smoothPos = useRef(new THREE.Vector3(0, 100, 140));
  const smoothTarget = useRef(new THREE.Vector3(0, 0, 0));
  const menuAngle = useRef(0);

  // Vertical orbit (local – not shared)
  const orbitPitch = useRef(0.45);

  useFrame((_, delta) => {
    const { dx, dy } = mouseRef.current;
    let tgtPos: THREE.Vector3;
    let tgtLook: THREE.Vector3;

    if (phase !== 'playing') {
      // ── Menu / finished: slow orbit ──
      menuAngle.current += delta * 0.15;
      tgtPos = new THREE.Vector3(
        Math.cos(menuAngle.current) * 130,
        70,
        Math.sin(menuAngle.current) * 130,
      );
      tgtLook = new THREE.Vector3(0, 0, 0);
    } else {
      const s = stateRef.current;
      const center = new THREE.Vector3(...s.position);
      const heading = s.rotation;

      if (s.mode === 'flying') {
        // ── Fixed chase cam (mouse drives the plane, not the camera) ──
        const dist = 35;
        const h = 12 + Math.max(0, s.altitude * 0.08);
        tgtPos = center
          .clone()
          .add(
            new THREE.Vector3(
              -Math.sin(heading) * dist,
              h,
              -Math.cos(heading) * dist,
            ),
          );
        tgtLook = center.clone().add(new THREE.Vector3(0, 2, 0));

        // Ease orbit angles back to defaults for when player exits plane
        orbitYawRef.current *= 1 - 3 * delta;
        orbitPitch.current += (0.4 - orbitPitch.current) * 3 * delta;
      } else {
        // ── Orbital camera for walking / driving ──
        orbitYawRef.current -= dx * ORBIT_SENS;
        orbitPitch.current = Math.max(
          PITCH_MIN,
          Math.min(PITCH_MAX, orbitPitch.current + dy * ORBIT_SENS),
        );

        // Gently spring yaw back behind the player/vehicle when no mouse input
        if (Math.abs(dx) < 1) {
          const springRate = s.mode === 'driving' ? 2.5 : 1.0;
          orbitYawRef.current *= 1 - springRate * delta;
        }

        // Keep yaw in [−π, π] to prevent camera "unwrap" spinning
        if (orbitYawRef.current > Math.PI) orbitYawRef.current -= Math.PI * 2;
        if (orbitYawRef.current < -Math.PI) orbitYawRef.current += Math.PI * 2;

        const dist = s.mode === 'walking' ? 8 : 18;
        const azimuth = heading + orbitYawRef.current;
        const cp = Math.cos(orbitPitch.current);
        const sp = Math.sin(orbitPitch.current);

        tgtPos = new THREE.Vector3(
          center.x - Math.sin(azimuth) * cp * dist,
          center.y + sp * dist,
          center.z - Math.cos(azimuth) * cp * dist,
        );
        tgtLook = center
          .clone()
          .add(new THREE.Vector3(0, s.mode === 'walking' ? 1.5 : 2, 0));
      }
    }

    const pl = 1 - Math.exp(-4 * delta);
    const ll = 1 - Math.exp(-6 * delta);
    smoothPos.current.lerp(tgtPos, pl);
    smoothTarget.current.lerp(tgtLook, ll);
    camera.position.copy(smoothPos.current);
    camera.lookAt(smoothTarget.current);
  });

  return null;
}

// ── Ramp ──────────────────────────────────────────────────────────────

function RampArea() {
  const rampGeo = useMemo(() => {
    const hw = RAMP.width / 2;
    const hl = RAMP.length / 2;
    const h = RAMP.height;

    // 6 unique vertices — slope rises from -Z (ground) toward +Z (peak)
    const BL: [number, number, number] = [-hw, 0, -hl];
    const BR: [number, number, number] = [ hw, 0, -hl];
    const FL: [number, number, number] = [-hw, 0,  hl];
    const FR: [number, number, number] = [ hw, 0,  hl];
    const TL: [number, number, number] = [-hw, h,  hl];
    const TR: [number, number, number] = [ hw, h,  hl];

    // Correct winding: outward-facing normals (CCW when viewed from outside)
    const tris: [number, number, number][] = [
      // Slope surface (normal faces up-ish, toward viewer above the slope)
      BL, TR, BR,
      BL, TL, TR,
      // Bottom face (normal faces down)
      BL, BR, FR,
      BL, FR, FL,
      // Front face / drop-off (normal faces +Z)
      FL, TR, TL,
      FL, FR, TR,
      // Left side (normal faces -X)
      BL, FL, TL,
      // Right side (normal faces +X)
      BR, TR, FR,
      // Back face (normal faces -Z)
      BL, BR, BR, // degenerate — back is flush with ground
    ];

    const positions = new Float32Array(tris.length * 3);
    for (let i = 0; i < tris.length; i++) {
      positions[i * 3]     = tris[i][0];
      positions[i * 3 + 1] = tris[i][1];
      positions[i * 3 + 2] = tris[i][2];
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <group>
      {/* Road pad — connects the main track to the ramp area */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[RAMP.x, 0.005, (70 + RAMP.z + RAMP.length / 2 + 2) / 2]}
        receiveShadow
      >
        <planeGeometry
          args={[
            RAMP.width + 8,
            RAMP.z + RAMP.length / 2 + 2 - 70 + 10,
          ]}
        />
        <meshStandardMaterial color="#555558" roughness={0.92} />
      </mesh>

      {/* Flat pad around the ramp for landing */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[RAMP.x, 0.005, RAMP.z + RAMP.length / 2 + 15]}
        receiveShadow
      >
        <planeGeometry args={[RAMP.width + 16, 28]} />
        <meshStandardMaterial color="#555558" roughness={0.92} />
      </mesh>

      {/* Ramp mesh */}
      <mesh
        geometry={rampGeo}
        position={[RAMP.x, 0, RAMP.z]}
        rotation={[0, RAMP.rotation, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#888890" roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ── Trees ─────────────────────────────────────────────────────────────

function Trees() {
  const trees = useMemo(() => {
    const result: { pos: [number, number, number]; s: number }[] = [];
    const rng = (seed: number) => {
      let x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    };
    const minClearance = TRACK_WIDTH * 1.5; // keep trees well away from track edges
    const tmpV = new THREE.Vector3();
    for (let i = 0; i < 400; i++) {
      const angle = rng(i * 17.3) * Math.PI * 2;
      const radius = 130 + rng(i * 31.7) * 220;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      // Skip trees that are too close to any part of the track
      tmpV.set(x, 0, z);
      const info = getNearestTrackInfo(tmpV);
      if (info.distance < minClearance) continue;
      const scale = 0.7 + rng(i * 47.1) * 0.6;
      if (result.length >= 200) break;
      result.push({ pos: [x, 0, z], s: scale });
    }
    return result;
  }, []);

  return (
    <group>
      {trees.map((tree, i) => (
        <group key={i} position={tree.pos}>
          <mesh position={[0, tree.s * 0.8, 0]}>
            <cylinderGeometry
              args={[0.15 * tree.s, 0.25 * tree.s, tree.s * 1.6, 6]}
            />
            <meshStandardMaterial color="#5c3a1a" />
          </mesh>
          <mesh position={[0, tree.s * 2.5, 0]}>
            <coneGeometry args={[1.8 * tree.s, 4 * tree.s, 6]} />
            <meshStandardMaterial color="#1a6b1a" />
          </mesh>
          <mesh position={[0, tree.s * 3.8, 0]}>
            <coneGeometry args={[1.3 * tree.s, 3 * tree.s, 6]} />
            <meshStandardMaterial color="#228b22" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ── Aim reticle (DOM, positioned via rAF reading aimRef) ─────────────

function AimReticle({ aimRef }: { aimRef: React.MutableRefObject<AimScreen> }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let rafId: number;
    const update = () => {
      const el = svgRef.current;
      if (el) {
        const a = aimRef.current;
        if (a.visible) {
          el.style.display = 'block';
          el.style.left = `${a.x * 100}%`;
          el.style.top = `${a.y * 100}%`;
        } else {
          el.style.display = 'none';
        }
      }
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [aimRef]);

  return (
    <svg ref={svgRef} className="weapon-reticle" viewBox="0 0 80 80" width="80" height="80" style={{ display: 'none' }}>
      {/* Outer circle */}
      <circle cx="40" cy="40" r="28" fill="none" stroke="rgba(255,180,40,0.35)" strokeWidth="1" />
      {/* Inner circle */}
      <circle cx="40" cy="40" r="10" fill="none" stroke="rgba(255,180,40,0.5)" strokeWidth="1.2" />
      {/* Center dot */}
      <circle cx="40" cy="40" r="2" fill="rgba(255,200,60,0.9)" />
      {/* Cross lines */}
      <line x1="40" y1="2" x2="40" y2="28" stroke="rgba(255,180,40,0.45)" strokeWidth="1.2" />
      <line x1="40" y1="52" x2="40" y2="78" stroke="rgba(255,180,40,0.45)" strokeWidth="1.2" />
      <line x1="2" y1="40" x2="28" y2="40" stroke="rgba(255,180,40,0.45)" strokeWidth="1.2" />
      <line x1="52" y1="40" x2="78" y2="40" stroke="rgba(255,180,40,0.45)" strokeWidth="1.2" />
      {/* Tick marks */}
      <line x1="40" y1="12" x2="40" y2="16" stroke="rgba(255,180,40,0.6)" strokeWidth="1.5" />
      <line x1="40" y1="64" x2="40" y2="68" stroke="rgba(255,180,40,0.6)" strokeWidth="1.5" />
      <line x1="12" y1="40" x2="16" y2="40" stroke="rgba(255,180,40,0.6)" strokeWidth="1.5" />
      <line x1="64" y1="40" x2="68" y2="40" stroke="rgba(255,180,40,0.6)" strokeWidth="1.5" />
    </svg>
  );
}

// ── Main scene ────────────────────────────────────────────────────────

interface SceneProps {
  phase: GamePhase;
  playerColor: string;
  stateRef: React.MutableRefObject<PlayerState>;
  remotePlayers: RemotePlayer[];
  onStateUpdate: (state: PlayerState) => void;
  onLapComplete: (lapTime: number) => void;
  onRaceFinish: (bestLapTime: number) => void;
}

export function GameScene({
  phase,
  playerColor,
  stateRef,
  remotePlayers,
  onStateUpdate,
  onLapComplete,
  onRaceFinish,
}: SceneProps) {
  const frameMouseRef = useRef<FrameMouse>({ dx: 0, dy: 0, fireDown: false });
  const aimRef = useRef<AimScreen>({ x: 0.5, y: 0.5, visible: false });
  const orbitYawRef = useRef(0);
  const [pointerLocked, setPointerLocked] = useState(false);
  const handleLockChange = useCallback((locked: boolean) => setPointerLocked(locked), []);

  // Vehicle IDs currently taken by remote players (so local scene can hide them)
  const takenVehicleIds = useMemo(
    () => new Set(remotePlayers.map((p) => p.vehicleId).filter(Boolean) as string[]),
    [remotePlayers],
  );

  return (
    <>
      <Canvas
        camera={{ fov: 60, near: 0.1, far: 1000, position: [0, 100, 140] }}
        shadows
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <Suspense fallback={null}>
          {/* Mouse / pointer-lock manager */}
          <MouseInput
            frameMouseRef={frameMouseRef}
            phase={phase}
            onLockChange={handleLockChange}
          />

          {/* Lighting */}
          <ambientLight intensity={0.4} />
          <directionalLight
            position={[80, 100, 40]}
            intensity={1.2}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-far={600}
            shadow-camera-left={-300}
            shadow-camera-right={300}
            shadow-camera-top={300}
            shadow-camera-bottom={-300}
          />
          <hemisphereLight args={['#87ceeb', '#2d5a1e', 0.3]} />

          {/* Sky */}
          <Sky
            sunPosition={[100, 60, 80]}
            turbidity={3}
            rayleigh={0.5}
            mieCoefficient={0.005}
            mieDirectionalG={0.8}
          />

          {/* Ground */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -0.02, 0]}
            receiveShadow
          >
            <planeGeometry args={[1600, 1600]} />
            <meshStandardMaterial color="#2d6b1e" roughness={0.95} />
          </mesh>

          {/* Track */}
          <Track />

          {/* Ramp area */}
          <RampArea />

          {/* Trees */}
          <Trees />

          {/* Player controller (character + vehicles) */}
          {phase === 'playing' && (
            <PlayerController
              playerColor={playerColor}
              stateRef={stateRef}
              mouseRef={frameMouseRef}
              aimRef={aimRef}
              orbitYawRef={orbitYawRef}
              takenVehicleIds={takenVehicleIds}
              remotePlayers={remotePlayers}
              onStateUpdate={onStateUpdate}
              onLapComplete={onLapComplete}
              onRaceFinish={onRaceFinish}
            />
          )}

          {/* Remote players */}
          {remotePlayers.map((player) => (
            <RemoteCar key={player.id} player={player} />
          ))}

          {/* Camera controller */}
          <CameraController
            phase={phase}
            stateRef={stateRef}
            mouseRef={frameMouseRef}
            orbitYawRef={orbitYawRef}
          />
        </Suspense>
      </Canvas>

      {/* Aim reticle (positioned via rAF for smooth 60fps tracking) */}
      <AimReticle aimRef={aimRef} />

      {/* Pointer-lock hint (outside Canvas, overlaid on top) */}
      {phase === 'playing' && !pointerLocked && (
        <div className="pointer-lock-hint">Click to capture mouse</div>
      )}
    </>
  );
}
