import { useEffect, useRef, useState } from 'react';
import { readPrivateVideo } from '@workprint/api-client';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import type { OperationResponse, Version } from '@workprint/contracts';
import { createSingleClipPlayer } from '@workprint/player';
import type { PlayerSnapshot, PlayerSource } from '@workprint/player';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { ViewerDialog } from '../ui/overlays.js';
import { Button } from '../ui/controls.js';
import { VersionUse } from '../versions/use.js';
import { useVersionMedia } from './reads.js';
import './media.css';

type Use = OperationResponse<'useVersion'>['use'];
/** Using the version for a Shot, offered under the clip. */
type UseProps = {
  binding: { purpose: 'shot_video'; shotId: string };
  currentUse: Use | null;
  selectedVersionId: string | null;
  selectionRevision: number;
  onUsed(value: OperationResponse<'useVersion'>): void;
};
/** Without the use props, the viewer only plays the clip: a generated video has no Shot to use it for yet. */
type Props = {
  connection: BrowserClient;
  scope: ReadScope | null;
  version: Version;
  caption: string;
  trigger: ReactElement;
} & (UseProps | { [Key in keyof UseProps]?: undefined });
const copy = {
  loading: 'Loading this video…',
  unauthenticated: 'Sign-in required to load this video.',
  not_implemented: 'Loading this video is not available yet.',
  failed: 'This video could not be loaded. Nothing was changed.',
  downloading: 'Downloading this exact version…',
  downloadFailed: 'This video could not be downloaded. Nothing was changed.',
} as const;
const failureCopy = (code: string) => code === 'unauthenticated' ? copy.unauthenticated : code === 'not_implemented' ? copy.not_implemented : copy.failed;
const idleSnapshot: PlayerSnapshot = { status: 'idle', sourceId: null, positionMs: 0, durationMs: null, failure: null };
/** A clip time as the player shows it, for example `0:04`. */
export const formatClipTime = (ms: number) => { const total = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`; };

/** One shared exact-version viewer. It never fetches access or selects by viewing. */
export function SingleClipViewer(props: Props) {
  return <ViewerDialog trigger={props.trigger} title={`Version ${props.version.revision}`} size="wide">
    <ClipViewer {...props} />
  </ViewerDialog>;
}
function ClipViewer(props: Props) {
  const { connection, scope, version, caption } = props;
  return <div className="wp-clip-version" data-displayed-version-id={version.id}>
    <PrivateClip connection={connection} scope={scope} version={version} />
    <p>{caption}</p>
    {props.binding ? <VersionUse connection={connection} scope={scope} version={version} binding={props.binding} currentUse={props.currentUse} selectedVersionId={props.selectedVersionId} selectionRevision={props.selectionRevision} presentation="viewer" onUsed={props.onUsed} /> : null}
  </div>;
}
/**
 * Private playback and download of one exact video version through its owned media access.
 * Viewing, playing and downloading never use, choose or export the version.
 */
export function PrivateClip({ connection, scope, version }: { connection: BrowserClient; scope: ReadScope | null; version: Version }) {
  const media = useVersionMedia(connection.kind === 'configured' ? connection.client : null, scope, version.id, true);
  const settled = media.state.kind === 'settled' ? media.state.result : null;
  // Access must describe this exact version's verified media, as for owned image previews.
  const measured = media.source?.measured, expected = 'media' in version ? version.media : null;
  const matches = !!measured && !!expected && measured.width === expected.width && measured.height === expected.height && measured.durationMs === expected.durationMs && measured.hasAudio === expected.hasAudio;
  const source = matches ? media.source : null;
  return <>
    {source ? <ClipPlayer source={{ sourceId: version.id, url: source.url, ...(source.poster === undefined ? {} : { posterUrl: source.poster }), ...(source.measured.durationMs === undefined ? {} : { durationMs: source.measured.durationMs }) }} /> : <ClipEmpty>{media.state.kind === 'loading' ? copy.loading : media.expired ? copy.failed : settled && !settled.ok ? failureCopy(settled.error.code) : copy.failed}</ClipEmpty>}
    {source && version.kind === 'video' ? <ClipDownload key={JSON.stringify([version.id, scope?.accountId ?? null, scope?.conversationId ?? null])} url={source.url} version={version} /> : null}
  </>;
}
const extension: Readonly<Record<string, string>> = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
/** Saves the exact version's bytes from the currently held access; it never requests export or new access. */
function ClipDownload({ url, version }: { url: string; version: Extract<Version, { kind: 'image' | 'video' }> }) {
  const [phase, setPhase] = useState<'idle' | 'pending' | 'failed'>('idle');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const download = async () => {
    const current = controller.current = new AbortController();
    setPhase('pending');
    const result = await readPrivateVideo(url, current.signal, version.media);
    if (current.signal.aborted) return;
    controller.current = null;
    if (!result.ok) { setPhase('failed'); return; }
    const object = URL.createObjectURL(result.value);
    const anchor = document.createElement('a');
    anchor.href = object;
    anchor.download = `version-${version.revision}.${extension[version.media.contentType] ?? 'video'}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(object), 0);
    setPhase('idle');
  };
  return <div className="wp-clip-actions">
    <Button variant="secondary" isDisabled={phase === 'pending'} onPress={() => void download()}>Download</Button>
    {phase !== 'idle' && <p role="status">{phase === 'pending' ? copy.downloading : copy.downloadFailed}</p>}
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
    return () => { unsubscribe(); instance.dispose(); player.current = null; };
  }, []);
  // A reacquired URL for the same exact version keeps the player, so position and play state carry over.
  useEffect(() => { player.current?.setSource(source); }, [key]);
  const ready = snapshot.status === 'ready' || snapshot.status === 'playing' || snapshot.status === 'paused' || snapshot.status === 'ended';
  const duration = snapshot.durationMs ?? 0;
  const position = Math.min(snapshot.positionMs, duration || snapshot.positionMs);
  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const playing = snapshot.status === 'playing';
  return <div className="wp-clip-surface" data-ready={ready ? 'true' : 'false'} data-player-status={snapshot.status}>
    <video ref={media} className="wp-clip-media" playsInline preload="metadata" aria-label="Video" />
    {ready ? <>
      <button type="button" className="wp-clip-toggle" aria-label={playing ? 'Pause' : 'Play'} onClick={() => { if (!player.current) return; if (playing) player.current.pause(); else player.current.play(); }}>
        {playing ? <svg className="wp-clip-pause-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg> : <PlayIcon />}
      </button>
      <span className="wp-clip-bar" aria-hidden="true"><i style={{ width: `${progress}%` }} /></span>
      <input type="range" className="wp-clip-seek" aria-label="Seek" min={0} max={Math.max(duration, 1)} step={50} value={position} disabled={duration <= 0} onChange={(event) => player.current?.seek(Number(event.currentTarget.value))} style={{ '--wp-clip-progress': `${progress}%` } as CSSProperties} />
      <span className="wp-clip-time">{formatClipTime(position)} / {formatClipTime(duration)}</span>
    </> : <p className="wp-clip-note" role="status">{snapshot.status === 'failed' ? copy.failed : copy.loading}</p>}
  </div>;
}

const PlayIcon = () => <svg className="wp-clip-play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7Z" /></svg>;
/** The player's play control as a mark, smaller, over a poster that opens the player. */
export const PlayMark = () => <span className="wp-clip-toggle wp-clip-mark" aria-hidden="true"><PlayIcon /></span>;
