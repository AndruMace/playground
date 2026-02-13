import { formatTime } from '../utils';
import type { LeaderboardEntry } from '../types';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  highlightName?: string;
}

export function Leaderboard({ entries, highlightName }: LeaderboardProps) {
  return (
    <div className="leaderboard">
      <h2>GLOBAL LEADERBOARD</h2>

      <div className="leaderboard-header">
        <span>#</span>
        <span>RACER</span>
        <span>BEST LAP</span>
      </div>

      <div className="leaderboard-entries">
        {entries.length === 0 && (
          <p className="no-entries">No entries yet. Be the first!</p>
        )}
        {entries.slice(0, 20).map((entry, i) => (
          <div
            key={`${entry.name}-${entry.time}-${i}`}
            className={`leaderboard-entry ${
              highlightName && entry.name === highlightName ? 'highlight' : ''
            }`}
          >
            <span className="rank">{i + 1}</span>
            <span className="entry-name">{entry.name}</span>
            <span className="entry-time">{formatTime(entry.time)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
