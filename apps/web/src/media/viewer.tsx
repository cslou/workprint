import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import type { OperationResponse, Version } from '@workprint/contracts';
import { createSingleClipPlayer } from '@workprint/player';
import type { PlayerSnapshot, PlayerSource } from '@workprint/player';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { ViewerDialog } from '../ui/overlays.js';
import { VersionUse } from '../versions/use.js';
import { useVersionMedia } from './reads.js';
import './media.css';

type Use = OperationResponse<'useVersion'>['use'];
type Props = {
  connection: BrowserClient;
  scope: ReadScope | null;
  version: Version;
  caption: string;
  trigger: ReactElement;
  binding: { purpose: 'shot_video'; shotId: string };
  currentUse: Use | null;
  selectedVersionId: string | null;
  selectionRevision: number;
  onUsed(value: OperationResponse<'useVersion'>): void;
};
const copy = {
  loading: 'Loading this video…',
  unauthenticated: 'Sign-in required to load this video.',
  not_implemented: 'Loading this video is not available yet.',
  failed: 'This video could not be loaded. Nothing was changed.',
} as const;
const failureCopy = (code: string) => code === 'unauthenticated' ? copy.unauthenticated : code === 'not_implemented' ? copy.not_implemented : copy.failed;
const idleSnapshot: PlayerSnapshot = { status: 'idle', sourceId: null, positionMs: 0, durationMs: null, failure: null };
const format = (ms: number) => { const total = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`; };

/** One shared exact-version viewer. It never fetches access or selects by viewing. */
export function SingleClipViewer(props: Props) {
  return <ViewerDialog trigger={props.trigger} title={`Version ${props.version.revision}`} size="wide">
    <ClipViewer {...props} />
  </ViewerDialog>;
}
function ClipViewer({ connection, scope, version, caption, binding, currentUse, selectedVersionId, selectionRevision, onUsed }: Props) {
  const media = useVersionMedia(connection.kind === 'configured' ? connection.client : null, scope, version.id, true);
  const settled = media.state.kind === 'settled' ? media.state.result : null;
  const source = settled?.ok && !media.expired ? settled.value : null;
  return <div className="wp-clip-version" data-displayed-version-id={version.id}>
    {source ? <ClipPlayer source={{ sourceId: version.id, url: source.url, ...(source.poster === undefined ? {} : { posterUrl: source.poster }), ...(source.measured.durationMs === undefined ? {} : { durationMs: source.measured.durationMs }) }} /> : <ClipEmpty>{media.state.kind === 'loading' ? copy.loading : media.expired ? copy.failed : settled && !settled.ok ? failureCopy(settled.error.code) : copy.failed}</ClipEmpty>}
    <p>{caption}</p>
    <VersionUse connection={connection} scope={scope} version={version} binding={binding} currentUse={currentUse} selectedVersionId={selectedVersionId} selectionRevision={selectionRevision} presentation="viewer" onUsed={onUsed} />
  </div>;
}
function ClipEmpty({ children }: { children: ReactNode }) {
  return <div className="wp-clip-surface" data-ready="false"><p className="wp-clip-note" role="status">{children}</p></div>;
}
function ClipPlayer({ source }: { source: PlayerSource }) {
  const media = useRef<HTMLVideoElement>(null);
  const player = useRef<ReturnType<typeof createSingleClipPlayer> | null>(null);
  const [snapshot, setSnapshot] = useState<PlayerSnapshot>(idleSnapshot);
  const key = JSON.stringify([source.sourceId, source.url, source.posterUrl ?? null, source.durationMs ?? null]);
  useEffect(() => {
    const element = media.current;
    if (!element) return;
    const instance = createSingleClipPlayer(element);
    player.current = instance;
    const unsubscribe = instance.subscribe(setSnapshot);
    instance.setSource(source);
    return () => { unsubscribe(); instance.dispose(); player.current = null; };
    // The source identity is the only resubscription key.
  }, [key]);
  const ready = snapshot.status === 'ready' || snapshot.status === 'playing' || snapshot.status === 'paused' || snapshot.status === 'ended';
  const duration = snapshot.durationMs ?? 0;
  const position = Math.min(snapshot.positionMs, duration || snapshot.positionMs);
  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const playing = snapshot.status === 'playing';
  useEffect(() => { if (snapshot.status === 'failed') player.current?.dispose(); }, [snapshot.status]);
  return <div className="wp-clip-surface" data-ready={ready ? 'true' : 'false'} data-player-status={snapshot.status}>
    <video ref={media} className="wp-clip-media" playsInline preload="metadata" aria-label="Video" />
    {ready ? <>
      <button type="button" className="wp-clip-toggle" aria-label={playing ? 'Pause' : 'Play'} onClick={() => { if (!player.current) return; if (playing) player.current.pause(); else player.current.play(); }}>
        {playing ? <svg className="wp-clip-pause-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg> : <svg className="wp-clip-play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7Z" /></svg>}
      </button>
      <span className="wp-clip-bar" aria-hidden="true"><i style={{ width: `${progress}%` }} /></span>
      <input type="range" className="wp-clip-seek" aria-label="Seek" min={0} max={Math.max(duration, 1)} step={50} value={position} disabled={duration <= 0} onChange={(event) => player.current?.seek(Number(event.currentTarget.value))} style={{ '--wp-clip-progress': `${progress}%` } as CSSProperties} />
      <span className="wp-clip-time">{format(position)} / {format(duration)}</span>
    </> : <p className="wp-clip-note" role="status">{snapshot.status === 'failed' ? copy.failed : copy.loading}</p>}
  </div>;
}
