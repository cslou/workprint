import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import type { OperationResponse, Version } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { useOwnedImage } from '../api/use-owned-image.js';
import { EmptyState, WorkspaceEmpty } from '../ui/panel.js';
import { formatClipTime, PlayMark, SingleClipViewer } from '../media/viewer.js';
import { Feedback, StatusPill } from '../ui/status.js';
import { useNearViewport } from '../ui/use-near-viewport.js';
import { VersionReview, type ReviewSelection } from '../versions/review.js';
import { VersionUse } from '../versions/use.js';
import { useExactVersion } from '../versions/reads.js';
import { orderedStoryboard } from '../workspace/projection.js';
import { GeneratedVideos } from './generated-videos.js';
import { GenerationRequests } from './requests.js';
import './videos.css';

/** Exact public version projections and optional image facts, isolated and labelled by the caller. */
export type VideoPrerequisites = Readonly<{ versions: readonly Version[]; images?: readonly Readonly<{ versionId: string; revision: number; src: string; alt: string }>[] }>;
export type VideosSnapshot = Readonly<{ selectionRevision: number; workspace: OperationResponse<'workspace'>; versions: readonly Version[] }>;
type Props = { connection: BrowserClient; scope: ReadScope | null; workspace: OperationResponse<'workspace'>; prerequisites?: VideoPrerequisites; renderActions?: (snapshot: VideosSnapshot) => ReactNode; onUsed?: (result: OperationResponse<'useVersion'>, version: Version) => void };
export function Videos(props: Props) {
  return <ScopedVideos key={JSON.stringify([props.scope?.accountId, props.scope?.conversationId])} {...props} />;
}
function ScopedVideos(props: Props) {
  const [choices, setChoices] = useState(new Map<string, OperationResponse<'useVersion'>>());
  const [loaded, setLoaded] = useState(new Map<string, Version>());
  const observe = useCallback((version: Version) => setLoaded(previous => {
    if (previous.get(version.id) === version) return previous;
    const next = new Map(previous); next.set(version.id, version); return next;
  }), []);
  const choose = (shotId: string, value: OperationResponse<'useVersion'>) => setChoices(previous => {
    const known = previous.get(shotId);
    if (known && known.selectionRevision >= value.selectionRevision) return previous;
    const next = new Map(previous); next.set(shotId, value); return next;
  });
  const rows = orderedStoryboard(props.workspace.storyboard.shots);
  const seen = new Set<string>();
  // Exact candidates come from settled requests and from owned videos already bound to the Shot.
  const candidates = rows?.flatMap(({ shot, number }) => [...props.workspace.videos.filter(request => request.purpose === 'shot_video' && request.target.shotId === shot.shotId && request.resultVersionId).map(request => request.resultVersionId!),
    ...(shot.candidateVideoVersions ?? []).filter(version => version.kind === 'video').map(version => version.id)].flatMap(id => {
    const key = JSON.stringify([shot.shotId, id]);
    if (seen.has(key)) return []; seen.add(key);
    return [{ id, shotId: shot.shotId, number, title: shot.intent ?? `Shot ${number}`, selected: shot.chosenVideoVersionId }];
  })) ?? [];
  const selectionRevision = Math.max(props.workspace.selectionRevision, ...[...choices.values()].map(value => value.selectionRevision));
  return <div className="wp-videos">{props.renderActions?.({ selectionRevision, workspace: props.workspace, versions: [...loaded.values()] })}<GeneratedVideos connection={props.connection} scope={props.scope} workspace={props.workspace} />{candidates.length ? candidates.map(row => <VideoCandidate key={JSON.stringify([row.shotId, row.id])} {...props} row={row} choice={choices.get(row.shotId) ?? null} onLoaded={observe} onUsed={(value, version) => { choose(row.shotId, value); props.onUsed?.(value, version); }} />) : props.workspace.generatedVideos?.length ? null : <WorkspaceEmpty tab="videos" />}<GenerationRequests connection={props.connection} scope={props.scope} workspace={props.workspace} /></div>;
}
function VideoCandidate({ connection, scope, workspace, prerequisites, row, choice, onUsed, onLoaded }: Props & { row: { id: string; shotId: string; number: number; title: string; selected: string | null }; choice: OperationResponse<'useVersion'> | null; onUsed(value: OperationResponse<'useVersion'>, version: Version): void; onLoaded(version: Version): void }) {
  const read = useExactVersion(connection.kind === 'configured' ? connection.client : null, scope, row.id);
  const observed = read.kind === 'settled' && read.result.ok ? read.result.value : null;
  const prerequisite = prerequisites?.versions.find(version => version.id === row.id && version.kind === 'video');
  const version = observed?.id === row.id && observed.kind === 'video' ? observed : prerequisite;
  useEffect(() => { if (version) onLoaded(version); }, [version, onLoaded]);
  if (!version || version.kind !== 'video') return <EmptyState><Feedback>{read.kind === 'settled' && !read.result.ok && read.result.error.code === 'unauthenticated' ? 'Sign-in required to load this video.' : read.kind === 'settled' && !read.result.ok && read.result.error.code === 'not_implemented' ? 'Loading this video is not available yet.' : 'This video could not be loaded. Nothing was changed.'}</Feedback></EmptyState>;
  const selected = choice && choice.selectionRevision > workspace.selectionRevision ? choice : null;
  return <div className="wp-video-row" data-shot-id={row.shotId}>
    <VersionReview connection={connection} scope={scope} version={version} currentUse={selected?.use ?? null} selectedVersionId={row.selected} selectionRevision={selected?.selectionRevision ?? workspace.selectionRevision} onUsed={value => onUsed(value, version)} binding={{ purpose: 'shot_video', shotId: row.shotId }} {...(prerequisites ? { historyPrerequisite: prerequisites.versions } : {})}>{(visible, _editable, selection) => {
      const image = prerequisites?.images?.find(image => image.versionId === visible.id && image.revision === visible.revision);
      return <><div className="wp-video-head"><span className="wp-video-number">{row.number}</span><b className="wp-video-title">{row.title}</b>{(selection.currentUse?.versionId ?? row.selected) === visible.id && <StatusPill state="chosen" />}</div><ShotClip connection={connection} scope={scope} version={visible} shotId={row.shotId} number={row.number} selected={row.selected} selection={selection} {...(image ? { image } : {})} /><VersionUse connection={connection} scope={scope} version={visible} binding={{ purpose: 'shot_video', shotId: row.shotId }} currentUse={selection.currentUse} selectedVersionId={row.selected} selectionRevision={selection.selectionRevision} onUsed={selection.onUsed} /></>;
    }}</VersionReview>
  </div>;
}

/**
 * A Shot video's poster, read once near view, as the button that plays it, then its version and length. A display
 * composition's supplied image stands in for the poster; a poster that can't be read leaves the clip playable and says so.
 */
function ShotClip({ connection, scope, version, shotId, number, selected, selection, image }: { connection: BrowserClient; scope: ReadScope | null; version: Version; shotId: string; number: number; selected: string | null; selection: ReviewSelection; image?: { src: string; alt: string } }) {
  const [box, near] = useNearViewport<HTMLElement>();
  const poster = useOwnedImage(connection, near && !image ? version : null);
  const failed = !image && (poster.phase === 'error' || poster.phase === 'expired');
  const src = image?.src ?? (poster.phase === 'ready' ? poster.url : null);
  const length = version.kind === 'video' && version.media.durationMs !== undefined ? formatClipTime(version.media.durationMs) : null;
  return <>
    <SingleClipViewer connection={connection} scope={scope} version={version} caption={`Shot ${number} · Version ${version.revision}`} binding={{ purpose: 'shot_video', shotId }} currentUse={selection.currentUse} selectedVersionId={selected} selectionRevision={selection.selectionRevision} onUsed={selection.onUsed}
      trigger={<AriaButton ref={box} className="wp-video-thumbnail wp-video-poster" aria-label={`View Shot ${number} version ${version.revision}`}>{src ? <img src={src} alt="" onError={poster.fail} /> : null}<PlayMark /></AriaButton>} />
    <span className="wp-video-metadata">{[`Version ${version.revision}`, length, failed ? 'The poster couldn’t be shown' : null].filter(Boolean).join(' · ')}</span>
  </>;
}
