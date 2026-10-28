import type { OperationResponse, Version } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { EmptyState, WorkspaceEmpty } from '../ui/panel.js';
import { Feedback, StatusPill } from '../ui/status.js';
import { VersionReview } from '../versions/review.js';
import { VersionUse } from '../versions/use.js';
import { useExactVersion } from '../versions/reads.js';
import { orderedStoryboard } from '../workspace/projection.js';
import { GenerationRequests } from './requests.js';
import './videos.css';

/** Exact public version projections and optional image facts, isolated and labelled by the caller. */
export type VideoPrerequisites = Readonly<{ versions: readonly Version[]; images?: readonly Readonly<{ versionId: string; revision: number; src: string; alt: string }>[] }>;
type Props = { connection: BrowserClient; scope: ReadScope | null; workspace: OperationResponse<'workspace'>; prerequisites?: VideoPrerequisites };
export function Videos(props: Props) {
  const rows = orderedStoryboard(props.workspace.storyboard.shots);
  const seen = new Set<string>();
  const candidates = rows?.flatMap(({ shot, number }) => props.workspace.videos.filter(request => request.purpose === 'shot_video' && request.target.shotId === shot.shotId && request.resultVersionId).flatMap(request => {
    const id = request.resultVersionId!;
    const key = JSON.stringify([shot.shotId, id]);
    if (seen.has(key)) return []; seen.add(key);
    return [{ id, shotId: shot.shotId, number, title: shot.intent ?? `Shot ${number}`, selected: shot.chosenVideoVersionId }];
  })) ?? [];
  return <div className="wp-videos">{candidates.length ? candidates.map(row => <VideoCandidate key={JSON.stringify([row.shotId, row.id])} {...props} row={row} />) : <WorkspaceEmpty tab="videos" />}<GenerationRequests connection={props.connection} scope={props.scope} workspace={props.workspace} /></div>;
}
function VideoCandidate({ connection, scope, workspace, prerequisites, row }: Props & { row: { id: string; shotId: string; number: number; title: string; selected: string | null } }) {
  const read = useExactVersion(connection.kind === 'configured' ? connection.client : null, scope, row.id);
  const observed = read.kind === 'settled' && read.result.ok ? read.result.value : null;
  const prerequisite = prerequisites?.versions.find(version => version.id === row.id && version.kind === 'video');
  const version = observed?.id === row.id && observed.kind === 'video' ? observed : prerequisite;
  if (!version || version.kind !== 'video') return <EmptyState><Feedback>{read.kind === 'settled' && !read.result.ok && read.result.error.code === 'unauthenticated' ? 'Sign-in required to load this video.' : read.kind === 'settled' && !read.result.ok && read.result.error.code === 'not_implemented' ? 'Loading this video is not available yet.' : 'This video could not be loaded. Nothing was changed.'}</Feedback></EmptyState>;
  return <section className="wp-video-row" data-shot-id={row.shotId}>
    <VersionReview connection={connection} scope={scope} version={version} currentUse={null} selectedVersionId={row.selected} selectionRevision={workspace.selectionRevision} binding={{ purpose: 'shot_video', shotId: row.shotId }} {...(prerequisites ? { historyPrerequisite: prerequisites.versions } : {})}>{(visible, _editable, selection) => {
      const image = prerequisites?.images?.find(image => image.versionId === visible.id && image.revision === visible.revision);
      return <><div className="wp-video-head"><span className="wp-video-number">{row.number}</span><b className="wp-video-title">{row.title}</b>{(selection.currentUse?.versionId ?? row.selected) === visible.id && <StatusPill state="chosen" />}</div>{image && <img className="wp-video-thumbnail" src={image.src} alt={image.alt} />}<p className="wp-video-metadata">Version {visible.revision}{visible.kind === 'video' && visible.media.durationMs !== undefined ? ` · ${(visible.media.durationMs / 1000).toFixed(1)} s` : ''}</p><VersionUse connection={connection} scope={scope} version={visible} binding={{ purpose: 'shot_video', shotId: row.shotId }} currentUse={selection.currentUse} selectedVersionId={row.selected} selectionRevision={selection.selectionRevision} onUsed={selection.onUsed} /></>;
    }}</VersionReview>
  </section>;
}
