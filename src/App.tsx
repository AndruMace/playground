import { useState, useRef, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameScene } from './game/Scene';
import { getStartPosition, TOTAL_LAPS } from './game/trackPath';
import { Menu } from './ui/Menu';
import { HUD } from './ui/HUD';
import { Leaderboard } from './ui/Leaderboard';
import { formatTime } from './utils';
import type {
  PlayerState,
  RemotePlayer,
  LeaderboardEntry,
  GamePhase,
} from './types';

function createInitialState(): PlayerState {
  const start = getStartPosition();
  return {
    mode: 'walking',
    position: [start.position.x, 0, start.position.z + 12],
    rotation: start.rotation,
    speed: 0,
    altitude: 0,
    lap: 0,
    lapTime: 0,
    bestLapTime: null,
    totalTime: 0,
    checkpoints: [],
    boost: 100,
    nearbyVehicle: null,
    nearbyVehicleLabel: null,
    vehicleId: null,
    pitch: 0,
    bank: 0,
  };
}

export default function App() {
  const [phase, setPhase] = useState<GamePhase>('menu');
  const [playerName, setPlayerName] = useState('');
  const [playerColor, setPlayerColor] = useState('#e63946');
  const [hudState, setHudState] = useState<PlayerState>(createInitialState);
  const [remotePlayers, setRemotePlayers] = useState<RemotePlayer[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [raceResult, setRaceResult] = useState<{
    bestLap: number;
    totalTime: number;
  } | null>(null);
  const [lastLapMessage, setLastLapMessage] = useState('');

  const stateRef = useRef<PlayerState>(createInitialState());
  const socketRef = useRef<Socket | null>(null);

  // ── Leaderboard ────────────────────────────────────────────────────
  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch('/api/leaderboard');
      if (res.ok) setLeaderboard(await res.json());
    } catch {
      /* server offline */
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // ── Multiplayer ────────────────────────────────────────────────────
  const [mpStatus, setMpStatus] = useState<'offline' | 'connecting' | 'online'>('offline');

  const connectMultiplayer = useCallback((name: string, color: string) => {
    try {
      setMpStatus('connecting');
      const socket = io({ timeout: 4000, reconnectionAttempts: 5 });
      socketRef.current = socket;

      socket.on('connect', () => {
        setMpStatus('online');
        socket.emit('join', { name, color });
      });

      socket.on('players', (players: RemotePlayer[]) =>
        setRemotePlayers(players),
      );
      socket.on('playerJoined', (player: RemotePlayer) =>
        setRemotePlayers((prev) => [...prev, player]),
      );
      socket.on(
        'playerUpdate',
        (data: {
          id: string;
          position: [number, number, number];
          rotation: number;
          speed: number;
          mode: 'walking' | 'driving' | 'flying';
          vehicleId: string | null;
          pitch: number;
          bank: number;
        }) =>
          setRemotePlayers((prev) =>
            prev.map((p) =>
              p.id === data.id
                ? {
                    ...p,
                    position: data.position,
                    rotation: data.rotation,
                    speed: data.speed,
                    mode: data.mode || 'walking',
                    vehicleId: data.vehicleId ?? null,
                    pitch: data.pitch ?? 0,
                    bank: data.bank ?? 0,
                  }
                : p,
            ),
          ),
      );
      socket.on('playerLeft', ({ id }: { id: string }) =>
        setRemotePlayers((prev) => prev.filter((p) => p.id !== id)),
      );
      socket.on('disconnect', () => {
        setMpStatus('offline');
      });
      socket.on('connect_error', () => {
        setMpStatus('offline');
        socket.disconnect();
        socketRef.current = null;
      });
    } catch {
      setMpStatus('offline');
    }
  }, []);

  // ── Game flow ──────────────────────────────────────────────────────

  const handleStart = useCallback(
    (name: string, color: string) => {
      setPlayerName(name);
      setPlayerColor(color);
      setRaceResult(null);
      setLastLapMessage('');

      const initial = createInitialState();
      stateRef.current = initial;
      setHudState(initial);

      connectMultiplayer(name, color);
      setPhase('playing');
    },
    [connectMultiplayer],
  );

  const handleStateUpdate = useCallback(
    (state: PlayerState) => {
      setHudState(state);

      if (socketRef.current?.connected) {
        socketRef.current.emit('update', {
          position: state.position,
          rotation: state.rotation,
          speed: state.speed,
          mode: state.mode,
          vehicleId: state.vehicleId,
          pitch: state.pitch,
          bank: state.bank,
        });
      }
    },
    [],
  );

  const handleLapComplete = useCallback((lapTime: number) => {
    setLastLapMessage(`Lap: ${formatTime(lapTime)}`);
    setTimeout(() => setLastLapMessage(''), 3000);
  }, []);

  const handleRaceFinish = useCallback(
    async (bestLapTime: number) => {
      const totalTime = stateRef.current.totalTime;
      setRaceResult({ bestLap: bestLapTime, totalTime });
      setPhase('finished');

      try {
        await fetch('/api/leaderboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: playerName, time: bestLapTime }),
        });
        fetchLeaderboard();
      } catch {
        /* offline */
      }
    },
    [playerName, fetchLeaderboard],
  );

  const handlePlayAgain = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setRemotePlayers([]);
    const initial = createInitialState();
    stateRef.current = initial;
    setHudState(initial);
    setRaceResult(null);
    setLastLapMessage('');
    setPhase('menu');
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="app">
      {/* 3D scene (always present) */}
      <GameScene
        phase={phase}
        playerColor={playerColor}
        stateRef={stateRef}
        remotePlayers={remotePlayers}
        onStateUpdate={handleStateUpdate}
        onLapComplete={handleLapComplete}
        onRaceFinish={handleRaceFinish}
      />

      {/* ── Menu overlay ──────────────────────────────────────────── */}
      {phase === 'menu' && (
        <div className="overlay">
          <Menu onStart={handleStart} />
          <Leaderboard entries={leaderboard} />
        </div>
      )}

      {/* ── In-game HUD ───────────────────────────────────────────── */}
      {phase === 'playing' && (
        <>
          <HUD state={hudState} />
          {lastLapMessage && (
            <div className="lap-message">{lastLapMessage}</div>
          )}
          {/* Multiplayer status */}
          <div className="mp-status" data-status={mpStatus}>
            <span className="mp-dot" />
            {mpStatus === 'online'
              ? `Online (${remotePlayers.length} other${remotePlayers.length !== 1 ? 's' : ''})`
              : mpStatus === 'connecting'
                ? 'Connecting...'
                : 'Server offline'}
          </div>
        </>
      )}

      {/* ── Race finished ─────────────────────────────────────────── */}
      {phase === 'finished' && raceResult && (
        <div className="overlay">
          <div className="finish-screen">
            <h1>RACE COMPLETE!</h1>
            <div className="finish-stats">
              <div className="stat">
                <span className="stat-label">Best Lap</span>
                <span className="stat-value">
                  {formatTime(raceResult.bestLap)}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Total Time</span>
                <span className="stat-value">
                  {formatTime(raceResult.totalTime)}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Laps</span>
                <span className="stat-value">{TOTAL_LAPS}</span>
              </div>
            </div>
            <button className="start-btn" onClick={handlePlayAgain}>
              PLAY AGAIN
            </button>
          </div>
          <Leaderboard entries={leaderboard} highlightName={playerName} />
        </div>
      )}
    </div>
  );
}
