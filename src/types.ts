export type VehicleMode = 'walking' | 'driving' | 'flying';

export interface PlayerState {
  mode: VehicleMode;
  position: [number, number, number];
  rotation: number;
  speed: number;
  altitude: number;
  // Racing (driving mode)
  lap: number;
  lapTime: number;
  bestLapTime: number | null;
  totalTime: number;
  checkpoints: boolean[];
  // Driving boost (0-100)
  boost: number;
  // Interaction prompt
  nearbyVehicle: string | null;
  nearbyVehicleLabel: string | null;
  // Multiplayer sync
  vehicleId: string | null;
  pitch: number;
  bank: number;
}

export interface RemotePlayer {
  id: string;
  name: string;
  color: string;
  position: [number, number, number];
  rotation: number;
  speed: number;
  mode: VehicleMode;
  vehicleId: string | null;
  pitch: number;
  bank: number;
}

export interface LeaderboardEntry {
  name: string;
  time: number;
  date: string;
}

export type GamePhase = 'menu' | 'playing' | 'finished';
