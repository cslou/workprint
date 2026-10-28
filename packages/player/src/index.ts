/** Supplied by the owning viewer from its exact-version access seam. The player never fetches it. */
export type PlayerSource = Readonly<{
  /** Opaque exact-version identity; the player only echoes it and never resolves it. */
  sourceId: string;
  url: string;
  posterUrl?: string;
  durationMs?: number;
}>;

export type PlayerStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'failed';

export type PlayerSnapshot =
  | Readonly<{ status: 'idle'; sourceId: null; positionMs: 0; durationMs: null; failure: null }>
  | Readonly<{ status: 'loading' | 'ready' | 'playing' | 'paused' | 'ended'; sourceId: string; positionMs: number; durationMs: number | null; failure: null }>
  | Readonly<{ status: 'failed'; sourceId: string; positionMs: 0; durationMs: null; failure: 'source' }>;

/** One supplied-source player. The web owns the element, markup, access and selection. */
export interface SingleClipPlayer {
  /** Replace or clear the supplied source. Events from an earlier source are discarded. */
  setSource(source: PlayerSource | null): void;
  play(): void;
  pause(): void;
  seek(positionMs: number): void;
  current(): PlayerSnapshot;
  /** Emits the current snapshot immediately, then on every change. Returns an unsubscribe. */
  subscribe(listener: (snapshot: PlayerSnapshot) => void): () => void;
  /** Pause, remove listeners, clear src/poster and load() the element empty. Later calls are ignored. */
  dispose(): void;
}

const idle: PlayerSnapshot = { status: 'idle', sourceId: null, positionMs: 0, durationMs: null, failure: null };
const mediaEvents = ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'playing', 'pause', 'ended', 'error', 'seeked'] as const;

export function createSingleClipPlayer(media: HTMLVideoElement): SingleClipPlayer {
  let source: PlayerSource | null = null;
  let snapshot: PlayerSnapshot = idle;
  let disposed = false;
  let generation = 0;
  const listeners = new Set<(value: PlayerSnapshot) => void>();

  const emit = () => { for (const listener of [...listeners]) listener(snapshot); };
  const publish = (value: PlayerSnapshot) => { snapshot = value; emit(); };
  // Element events always describe its current resource; the attribute is our own supplied URL.
  const currentSource = () => source && !disposed && media.getAttribute('src') === source.url ? source : null;
  const normalizeDuration = (value: number | undefined) => value !== undefined && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
  const measuredDuration = (value: PlayerSource) => Number.isFinite(media.duration) && media.duration > 0 ? Math.round(media.duration * 1000) : normalizeDuration(value.durationMs) ?? null;
  const position = () => Math.max(0, Math.round(media.currentTime * 1000));
  const release = () => {
    try { media.pause(); } catch { /* the element may already be detached */ }
    media.removeAttribute('poster');
    media.removeAttribute('src');
    try { media.load(); } catch { /* clearing is best-effort on detached elements */ }
  };

  const observe = (event: Event) => {
    const value = currentSource();
    if (!value || snapshot.status === 'failed') return;
    switch (event.type) {
      case 'error':
        if (media.error) publish({ status: 'failed', sourceId: value.sourceId, positionMs: 0, durationMs: null, failure: 'source' });
        return;
      case 'loadedmetadata':
        publish({ status: media.paused ? 'ready' : 'playing', sourceId: value.sourceId, positionMs: position(), durationMs: measuredDuration(value), failure: null });
        return;
      case 'play':
      case 'playing':
        publish({ status: 'playing', sourceId: value.sourceId, positionMs: position(), durationMs: measuredDuration(value), failure: null });
        return;
      case 'pause':
        publish({ status: media.ended ? 'ended' : 'paused', sourceId: value.sourceId, positionMs: position(), durationMs: measuredDuration(value), failure: null });
        return;
      case 'ended':
        publish({ status: 'ended', sourceId: value.sourceId, positionMs: measuredDuration(value) ?? position(), durationMs: measuredDuration(value), failure: null });
        return;
      case 'durationchange':
      case 'timeupdate':
      case 'seeked':
        if (snapshot.status === 'idle' || snapshot.status === 'loading') return;
        publish({ status: snapshot.status === 'ended' || snapshot.status === 'ready' || snapshot.status === 'paused' ? (media.ended ? 'ended' : media.paused ? (snapshot.status === 'ready' ? 'ready' : 'paused') : 'playing') : snapshot.status, sourceId: value.sourceId, positionMs: position(), durationMs: measuredDuration(value), failure: null });
        return;
      default:
        return;
    }
  };

  for (const name of mediaEvents) media.addEventListener(name, observe);
  media.preload = 'metadata';
  media.controls = false;

  return {
    setSource(next) {
      if (disposed) return;
      generation += 1;
      source = null;
      release();
      if (!next) { publish(idle); return; }
      source = next;
      if (next.posterUrl !== undefined) media.setAttribute('poster', next.posterUrl);
      media.setAttribute('src', next.url);
      try { media.load(); } catch { /* a supplied URL that cannot load reports through the error event */ }
      publish({ status: 'loading', sourceId: next.sourceId, positionMs: 0, durationMs: normalizeDuration(next.durationMs) ?? null, failure: null });
    },
    play() {
      const value = currentSource();
      if (!value) return;
      const token = generation;
      void media.play().catch((error: unknown) => {
        if (disposed || token !== generation || !currentSource() || snapshot.status === 'failed') return;
        if (error instanceof DOMException && error.name === 'NotAllowedError') { observe(new Event('pause')); return; }
        publish({ status: 'failed', sourceId: value.sourceId, positionMs: 0, durationMs: null, failure: 'source' });
      });
    },
    pause() {
      if (!currentSource()) return;
      try { media.pause(); } catch { /* no media resource to pause */ }
    },
    seek(positionMs) {
      const value = currentSource();
      if (!value || media.readyState < 1 || !Number.isFinite(positionMs)) return;
      const known = Number.isFinite(media.duration) && media.duration > 0 ? media.duration * 1000 : normalizeDuration(value.durationMs) ?? 0;
      media.currentTime = Math.max(0, Math.min(positionMs, Math.max(0, known))) / 1000;
      if (snapshot.status === 'ended') publish({ status: media.paused ? 'paused' : 'playing', sourceId: value.sourceId, positionMs: position(), durationMs: measuredDuration(value), failure: null });
    },
    current() { return snapshot; },
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot);
      return () => { listeners.delete(listener); };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      source = null;
      release();
      for (const name of mediaEvents) media.removeEventListener(name, observe);
      listeners.clear();
      snapshot = idle;
    },
  };
}
