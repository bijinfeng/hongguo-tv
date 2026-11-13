/** One playback session. A resolved URL alone must never create a history entry. */
export function progressSession(
  persist: (position: number, duration: number, completed: boolean) => void,
) {
  let played = false;
  let position = 0;
  let duration = 0;
  let completed = false;
  let lastSaved = '';
  let lastCheckpoint = 0;
  const save = () => {
    if (!played) return;
    const fingerprint = `${position}:${duration}:${completed}`;
    if (fingerprint === lastSaved) return;
    lastSaved = fingerprint;
    persist(position, duration, completed);
  };
  return {
    update(time: number, total: number, playing: boolean) {
      if (!Number.isFinite(time) || !Number.isFinite(total) || time < 0 || total < 0) return;
      position = time;
      duration = total;
      if (playing && time > 0) played = true;
      if (played && Math.abs(time - lastCheckpoint) >= 10) {
        lastCheckpoint = time;
        save();
      }
    },
    save,
    retry() {
      lastSaved = '';
      save();
    },
    end() {
      completed = true;
      save();
    },
  };
}
