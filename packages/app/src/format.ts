/** Playback seconds, shared by cards, history and controls. Unknown is distinct from zero. */
export function playbackTime(value?: number): string {
  if (value === undefined || !Number.isFinite(value) || value < 0) return '--:--';
  const seconds = Math.floor(value);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const tail = `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return hours ? `${hours}:${tail}` : tail;
}
