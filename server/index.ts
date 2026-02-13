import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEADERBOARD_FILE = join(__dirname, 'leaderboard.json');

interface LeaderboardEntry {
  name: string;
  time: number;
  date: string;
}

interface PlayerInfo {
  id: string;
  name: string;
  color: string;
  position: [number, number, number];
  rotation: number;
  speed: number;
  mode: 'walking' | 'driving' | 'flying';
  vehicleId: string | null;
  pitch: number;
  bank: number;
}

function loadLeaderboard(): LeaderboardEntry[] {
  try {
    if (existsSync(LEADERBOARD_FILE)) {
      return JSON.parse(readFileSync(LEADERBOARD_FILE, 'utf-8'));
    }
  } catch {
    console.error('Failed to load leaderboard');
  }
  return [];
}

function saveLeaderboard(entries: LeaderboardEntry[]) {
  try {
    writeFileSync(LEADERBOARD_FILE, JSON.stringify(entries, null, 2));
  } catch {
    console.error('Failed to save leaderboard');
  }
}

const app = express();
app.use(express.json());

// In production, serve the Vite-built frontend
const DIST_DIR = join(__dirname, '..', 'dist');
if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
}

const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// --- Leaderboard REST API ---

app.get('/api/leaderboard', (_req, res) => {
  const entries = loadLeaderboard();
  entries.sort((a, b) => a.time - b.time);
  res.json(entries.slice(0, 50));
});

app.post('/api/leaderboard', (req, res) => {
  const { name, time } = req.body;
  if (!name || typeof time !== 'number' || time <= 0) {
    res.status(400).json({ error: 'Invalid data' });
    return;
  }
  const entries = loadLeaderboard();
  entries.push({ name: String(name).slice(0, 20), time, date: new Date().toISOString() });
  entries.sort((a, b) => a.time - b.time);
  const trimmed = entries.slice(0, 200);
  saveLeaderboard(trimmed);
  const rank = trimmed.findIndex((e) => e.time === time && e.name === name) + 1;
  res.json({ success: true, rank });
});

// --- Catch-all: serve index.html for client-side routing ---

if (existsSync(DIST_DIR)) {
  app.get('*', (_req, res) => {
    res.sendFile(join(DIST_DIR, 'index.html'));
  });
}

// --- Multiplayer Socket.io ---

const players = new Map<string, PlayerInfo>();

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('join', (data: { name: string; color: string }) => {
    const player: PlayerInfo = {
      id: socket.id,
      name: String(data.name).slice(0, 20),
      color: data.color,
      position: [0, 0, 0],
      rotation: 0,
      speed: 0,
      mode: 'walking',
      vehicleId: null,
      pitch: 0,
      bank: 0,
    };
    players.set(socket.id, player);

    // Send all existing players to the new player
    const existing = Array.from(players.values()).filter((p) => p.id !== socket.id);
    socket.emit('players', existing);

    // Tell everyone else about the new player
    socket.broadcast.emit('playerJoined', player);
  });

  socket.on(
    'update',
    (data: {
      position: [number, number, number];
      rotation: number;
      speed: number;
      mode: 'walking' | 'driving' | 'flying';
      vehicleId: string | null;
      pitch: number;
      bank: number;
    }) => {
      const player = players.get(socket.id);
      if (player) {
        player.position = data.position;
        player.rotation = data.rotation;
        player.speed = data.speed;
        player.mode = data.mode || 'walking';
        player.vehicleId = data.vehicleId ?? null;
        player.pitch = data.pitch ?? 0;
        player.bank = data.bank ?? 0;
        socket.broadcast.emit('playerUpdate', {
          id: socket.id,
          position: data.position,
          rotation: data.rotation,
          speed: data.speed,
          mode: player.mode,
          vehicleId: player.vehicleId,
          pitch: player.pitch,
          bank: player.bank,
        });
      }
    },
  );

  socket.on('disconnect', () => {
    players.delete(socket.id);
    io.emit('playerLeft', { id: socket.id });
    console.log(`Player disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🏁 Race server running on http://localhost:${PORT}`);
});
