import { useState } from 'react';
import { CAR_COLORS } from '../utils';

interface MenuProps {
  onStart: (name: string, color: string) => void;
}

export function Menu({ onStart }: MenuProps) {
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState<string>(CAR_COLORS[0].hex);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onStart(name.trim() || 'Anonymous', selectedColor);
  };

  return (
    <div className="menu">
      <div className="menu-title">
        <h1>TURBO RACER</h1>
        <p className="subtitle">3D Multiplayer Racing</p>
      </div>

      <form className="menu-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name..."
          maxLength={16}
          autoFocus
        />

        <div className="color-picker">
          <span className="color-label">Choose your car:</span>
          <div className="color-options">
            {CAR_COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                className={`color-btn ${selectedColor === c.hex ? 'selected' : ''}`}
                style={{ backgroundColor: c.hex }}
                onClick={() => setSelectedColor(c.hex)}
                title={c.name}
              />
            ))}
          </div>
        </div>

        <button type="submit" className="start-btn">
          START RACE
        </button>

        <div className="controls-info">
          <span>WASD</span> or <span>Arrow Keys</span> to drive
        </div>
      </form>
    </div>
  );
}
