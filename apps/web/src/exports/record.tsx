import type { OperationResponse, Version } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { Button } from '../ui/controls.js';
import { ViewerDialog } from '../ui/overlays.js';
import { EmptyState } from '../ui/panel.js';
import { StatusPill } from '../ui/status.js';
import { useVersionMedia } from '../media/reads.js';
import { orderedStoryboard } from '../workspace/projection.js';
import { useExport, type ExportRecord } from './reads.js';

export type ExportContext = { connection: BrowserClient; scope: ReadScope | null; workspace: OperationResponse<'workspace'>; versions: readonly Version[] };
export function ExportUnavailable({ surface }: { surface: 'Export' | 'History' | 'Detail' | 'Download' }) {
  const lines = {
    Export: ['Export is not available yet.', 'No export was queued and no file was created.'],
    History: ['Export history is not available yet.', 'No export records were loaded.'],
    Detail: ['Export details are not available yet.', 'No export record was loaded.'],
    Download: ['Download is not available yet.', 'No file was downloaded.'],
  } as const;
  return <EmptyState><div role="status" className="wp-export-unavailable"><p>{lines[surface][0]}</p><p>{lines[surface][1]}</p></div></EmptyState>;
}
export const currentness = (record: ExportRecord) => record.current ? 'Uses your current chosen versions.' : 'Uses earlier chosen versions.';
function sourceLabel(context: ExportContext, shotId: string, versionId: string) {
  const shot = orderedStoryboard(context.workspace.storyboard.shots)?.find(row => Object.hasOwn(row.shot, 'shotId') && row.shot.shotId === shotId);
  const inList = context.workspace.videos.some(request => request.purpose === 'shot_video' && Object.hasOwn(request.target, 'shotId') && request.target.shotId === shotId && Object.hasOwn(request, 'resultVersionId') && request.resultVersionId === versionId);
  const version = context.versions.find(value => Object.hasOwn(value, 'id') && value.id === versionId && value.kind === 'video' && Object.hasOwn(value, 'revision'));
  return shot && inList && version ? `Shot ${shot.number} · Version ${version.revision}` : 'Not in the current Videos list';
}
export function ExportDetails(props: ExportContext & { id: string; prerequisite?: ExportRecord }) {
  const read = useExport(props.connection.kind === 'configured' ? props.connection.client : null, props.scope, props.id);
  const observed = read.kind === 'settled' && read.result.ok ? read.result.value : null;
  const record = observed?.id === props.id ? observed : observed ? null : props.prerequisite?.id === props.id ? props.prerequisite : null;
  return <>{record && <ExportFacts {...props} record={record} />}{read.kind === 'loading' ? <EmptyState>Loading export details…</EmptyState> : !record || (read.kind === 'settled' && !read.result.ok) ? <ExportUnavailable surface="Detail" /> : null}</>;
}
export function ExportFacts(props: ExportContext & { record: ExportRecord }) {
  const { record } = props;
  const sources = [...record.sources].sort((a, b) => a.order - b.order);
  return <div className="wp-export-facts">
    <div><StatusPill state={record.status} /><p className="wp-export-hint">{currentness(record)}</p></div>
    <section><div className="wp-export-label">Shots in this export</div><ol>{sources.map((source, index) => <li key={index}>{sourceLabel(props, source.shotId, source.versionId)}</li>)}</ol></section>
    {!record.compatibility.compatible && <section><div className="wp-export-label">Can't be combined</div>{record.compatibility.issues.map((issue, index) => {
      const matches = sources.filter(value => value.versionId === issue.versionId);
      const source = matches.length === 1 ? matches[0] : null;
      return <p key={index}>{source ? sourceLabel(props, source.shotId, issue.versionId) : 'Not in the current Videos list'} — {issue.message}</p>;
    })}</section>}
    {record.failureReason !== undefined && <section><div className="wp-export-label">Why it failed</div><p>{record.failureReason}</p></section>}
    {record.outputVersionId !== undefined && <ViewerDialog title="Download" trigger={<Button variant="secondary">Download</Button>}><ExportDownload connection={props.connection} scope={props.scope} versionId={record.outputVersionId} /></ViewerDialog>}
  </div>;
}
export function ExportDownload({ connection, scope, versionId }: Pick<ExportContext, 'connection' | 'scope'> & { versionId: string }) {
  const media = useVersionMedia(connection.kind === 'configured' ? connection.client : null, scope, versionId, true);
  const result = media.state.kind === 'settled' ? media.state.result : null;
  const source = result?.ok && !media.expired ? result.value : null;
  const protocol = source ? new URL(source.url).protocol : null;
  if (source && (protocol === 'https:' || protocol === 'http:')) return <a href={source.url} download>Download</a>;
  return media.state.kind === 'loading' ? <EmptyState>Loading download…</EmptyState> : <ExportUnavailable surface="Download" />;
}
