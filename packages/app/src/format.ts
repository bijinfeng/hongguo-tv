/** Playback seconds, shared by cards, history and controls. Unknown is distinct from zero. */
export function playbackTime(value?: number): string {
  if (value === undefined || !Number.isFinite(value) || value < 0) return '--:--';
  const seconds = Math.floor(value);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const tail = `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return hours ? `${hours}:${tail}` : tail;
}

/** Imported cloud progress can have a video identity without a known episode number. */
export function historyProgress(entry?: {
  episode?: number;
  position?: number;
  completed?: boolean;
}): string {
  const episode = (entry?.episode ?? 0) > 0 ? `第 ${entry!.episode} 集 · ` : '';
  return `${episode}${entry?.completed ? '本集已看完' : `看到 ${playbackTime(entry?.position)}`}`;
}

/** The source publishes China-time stamps; one formatter keeps calendar and radar consistent. */
const CHINA_OFFSET_SECONDS = 8 * 3600;

/** An instant in the source's China time, as `2026年11月14日 18:00`. */
export function chinaTimeLabel(instant: Date): string {
  const time = new Date(instant.getTime() + CHINA_OFFSET_SECONDS * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${time.getUTCFullYear()}年${time.getUTCMonth() + 1}月${time.getUTCDate()}日 ${pad(time.getUTCHours())}:${pad(time.getUTCMinutes())}`;
}

/** A UTC RFC3339 stamp from the contract, or the raw string when it cannot be parsed. */
export function utcStampLabel(value: string | null | undefined): string {
  if (!value) return '';
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? value : chinaTimeLabel(instant);
}

/** Unix seconds on a China-time clock, shared by the calendar's release labels. */
export function unixStampLabel(seconds: number): string {
  return chinaTimeLabel(new Date((seconds + CHINA_OFFSET_SECONDS) * 1000));
}
