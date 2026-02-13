import { formatTime } from '../utils';
import { TOTAL_LAPS } from '../game/trackPath';
import type { PlayerState } from '../types';

interface HUDProps {
  state: PlayerState;
}

export function HUD({ state }: HUDProps) {
  const { mode } = state;

  return (
    <div className="hud">
      {/* ── Mode badge ────────────────────────────────────────────── */}
      <div className="hud-mode">
        {mode === 'walking' && 'ON FOOT'}
        {mode === 'driving' && `LAP ${Math.min(state.lap + 1, TOTAL_LAPS)} / ${TOTAL_LAPS}`}
        {mode === 'flying' && 'FLYING'}
      </div>

      {/* ── Interaction prompts ───────────────────────────────────── */}
      {mode === 'walking' && state.nearbyVehicle && (
        <div className="interact-prompt">
          Press <kbd>E</kbd> to enter{' '}
          <strong>{state.nearbyVehicleLabel ?? state.nearbyVehicle}</strong>
        </div>
      )}

      {mode === 'walking' && !state.nearbyVehicle && (
        <div className="interact-hint">
          Walk to a <span className="hl-car">Car</span> or{' '}
          <span className="hl-plane">Airplane</span> and press{' '}
          <kbd>E</kbd> to enter
        </div>
      )}

      {(mode === 'driving' || mode === 'flying') && (
        <div className="interact-hint exit-hint">
          Press <kbd>E</kbd> to exit
          {mode === 'flying' && ' (near ground)'}
        </div>
      )}

      {/* ── Driving HUD ───────────────────────────────────────────── */}
      {mode === 'driving' && (
        <div className="hud-times">
          <div className="time-row">
            <span className="time-label">LAP</span>
            <span className="time-value">{formatTime(state.lapTime)}</span>
          </div>
          {state.bestLapTime !== null && (
            <div className="time-row best">
              <span className="time-label">BEST</span>
              <span className="time-value">{formatTime(state.bestLapTime)}</span>
            </div>
          )}
          <div className="time-row">
            <span className="time-label">TOTAL</span>
            <span className="time-value">{formatTime(state.totalTime)}</span>
          </div>
        </div>
      )}

      {/* ── Flying HUD ────────────────────────────────────────────── */}
      {mode === 'flying' && (
        <div className="hud-flight">
          <div className="flight-row">
            <span className="flight-label">ALT</span>
            <span className="flight-value">{Math.round(state.altitude)} m</span>
          </div>
          <div className="flight-controls-hint">
            <kbd>Space</kbd> Climb &nbsp; <kbd>Shift</kbd> Descend
          </div>
        </div>
      )}

      {/* ── Speedometer (driving + flying) ────────────────────────── */}
      {(mode === 'driving' || mode === 'flying') && (
        <div className={`hud-speed${mode === 'driving' && state.boost < 100 && state.speed > 60 ? ' boosting' : ''}`}>
          <span className="speed-value">
            {Math.round(Math.abs(state.speed) * 3.6)}
          </span>
          <span className="speed-unit">KM/H</span>
        </div>
      )}

      {/* ── Boost meter (driving mode) ─────────────────────────────── */}
      {mode === 'driving' && (
        <div className="hud-boost">
          <span className="boost-label">BOOST</span>
          <div className="boost-track">
            <div
              className={`boost-fill${state.boost < 100 && state.speed > 60 ? ' active' : ''}${state.boost < 15 ? ' low' : ''}`}
              style={{ width: `${state.boost}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Controls ──────────────────────────────────────────────── */}
      <div className="hud-controls">
        {mode === 'walking' && (
          <>
            <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move
            &nbsp;&middot;&nbsp;
            <kbd>Shift</kbd> run
            &nbsp;&middot;&nbsp;
            Mouse: look
          </>
        )}
        {mode === 'driving' && (
          <>
            <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> drive
            &nbsp;&middot;&nbsp;
            <kbd>Shift</kbd> boost
            &nbsp;&middot;&nbsp;
            Mouse: look
          </>
        )}
        {mode === 'flying' && (
          <>
            Mouse: steer + shoot &nbsp;
            <kbd>W</kbd><kbd>S</kbd> throttle &nbsp;
            <kbd>A</kbd><kbd>D</kbd> turn
          </>
        )}
      </div>
    </div>
  );
}
