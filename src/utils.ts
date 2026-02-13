export function formatTime(ms: number): string {
  if (ms <= 0) return '0:00.00';
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const centis = Math.floor((ms % 1000) / 10);
  return `${mins}:${secs.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
}

export const CAR_COLORS = [
  { name: 'Red', hex: '#e63946' },
  { name: 'Blue', hex: '#457b9d' },
  { name: 'Orange', hex: '#f4a261' },
  { name: 'Teal', hex: '#2a9d8f' },
  { name: 'Yellow', hex: '#e9c46a' },
  { name: 'Purple', hex: '#7b2d8e' },
] as const;
