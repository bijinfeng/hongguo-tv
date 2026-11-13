export type PlaybackCommand =
  | 'reveal'
  | 'preview-back'
  | 'preview-forward'
  | 'confirm'
  | 'toggle'
  | 'play'
  | 'pause'
  | 'next'
  | 'seek-back'
  | 'seek-forward';

export type PlaybackCommandSource = (receive: (command: unknown) => void) => () => void;

export function isPlaybackCommand(value: unknown): value is PlaybackCommand {
  return (
    typeof value === 'string' &&
    [
      'reveal',
      'preview-back',
      'preview-forward',
      'confirm',
      'toggle',
      'play',
      'pause',
      'next',
      'seek-back',
      'seek-forward',
    ].includes(value)
  );
}

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
    seed(time: number, total: number) {
      if (completed || !Number.isFinite(time) || !Number.isFinite(total) || time < 0 || total < 0)
        return;
      position = time;
      duration = total;
    },
    update(time: number, total: number, playing: boolean) {
      if (completed || !Number.isFinite(time) || !Number.isFinite(total) || time < 0 || total < 0)
        return;
      if (playing && time > position) played = true;
      position = time;
      duration = total;
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
    restart() {
      played = false;
      position = 0;
      completed = false;
      lastSaved = '';
      lastCheckpoint = 0;
    },
    end() {
      completed = true;
      save();
    },
  };
}

/** A single representation owner: canceled and late resources must still be released. */
export function playbackLease<T>(events: {
  pending: () => void;
  ready: (value: T, revision: number) => void;
  failed: (error: unknown) => void;
  release: (value: T) => void;
}) {
  let revision = 0;
  let disposed = false;
  let request: AbortController | undefined;
  let active: T | undefined;
  const stop = () => {
    revision++;
    request?.abort();
    request = undefined;
    if (active !== undefined) events.release(active);
    active = undefined;
  };
  return {
    async prepare(load: (signal: AbortSignal) => Promise<T>) {
      if (disposed) return;
      stop();
      const current = revision;
      const controller = new AbortController();
      request = controller;
      events.pending();
      try {
        const value = await load(controller.signal);
        if (disposed || current !== revision) {
          events.release(value);
          return;
        }
        request = undefined;
        active = value;
        events.ready(value, current);
      } catch (error) {
        if (!disposed && current === revision) {
          request = undefined;
          events.failed(error);
        }
      }
    },
    current(value: number) {
      return !disposed && revision === value && active !== undefined;
    },
    stop,
    dispose() {
      disposed = true;
      stop();
    },
  };
}
