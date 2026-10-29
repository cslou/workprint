import { useState } from 'react';
import type { ReactNode } from 'react';
import type { OperationResponse, Version } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { Button } from '../ui/controls.js';
import { VersionUse, type VersionUseProps } from './use.js';
import { useExactVersion, useVersionHistory } from './reads.js';
import { HistoryControls } from './history-controls.js';
import './review.css';

type Use = OperationResponse<'useVersion'>['use'];
export type ReviewSelection = { currentUse: Use | null; selectionRevision: number; onUsed(value: OperationResponse<'useVersion'>): void };
export type VersionReviewProps = { connection: BrowserClient; scope: ReadScope | null; version: Version; currentUse: Use | null; selectionRevision: number; selectedVersionId?: string | null; binding: VersionUseProps['binding']; historyPrerequisite?: readonly Version[]; onUsed?: (value: OperationResponse<'useVersion'>) => void; children: (version: Version, editable: boolean, selection: ReviewSelection) => ReactNode };
export function VersionReview(props: VersionReviewProps) {
  return <ScopedReview key={JSON.stringify([props.scope?.accountId, props.scope?.conversationId, props.version.artifactId])} {...props} />;
}
function ScopedReview({ connection, scope, version, binding, currentUse, selectionRevision, selectedVersionId, historyPrerequisite = [], onUsed: notifyUsed, children }: VersionReviewProps) {
  const [selected, setSelected] = useState<Version | null>(null);
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState<{ basis: string; value: OperationResponse<'useVersion'> } | null>(null);
  const basis = JSON.stringify([currentUse, selectedVersionId]);
  const requested = selected ?? version;
  const client = connection.kind === 'configured' ? connection.client : null;
  const read = useExactVersion(client, scope, requested.id);
  const candidate = read.kind === 'settled' && read.result.ok ? read.result.value : null;
  const visible = candidate && candidate.id === requested.id && candidate.artifactId === requested.artifactId && candidate.kind === requested.kind && candidate.revision === requested.revision ? candidate : requested;
  const history = useVersionHistory(client, scope, version.artifactId, open);
  const supplied = history.kind === 'settled' && history.result.ok ? history.result.value.items : historyPrerequisite;
  const ids = new Set<string>();
  const revisions = new Set<number>();
  const relevant = supplied.filter((item) => item.artifactId === version.artifactId && item.kind === version.kind && item.id !== version.id);
  const valid = supplied.every(item => item.artifactId === version.artifactId && item.kind === version.kind) && relevant.every((item) => { if (ids.has(item.id) || revisions.has(item.revision)) return false; ids.add(item.id); revisions.add(item.revision); return true; });
  const rows = valid ? [...relevant].sort((a, b) => b.revision - a.revision) : [];
  const complete = history.kind === 'settled' && history.result.ok ? history.result.value.nextCursor === null : historyPrerequisite.length > 0;
  const selection = used && (used.value.selectionRevision > selectionRevision || (used.value.selectionRevision === selectionRevision && used.basis === basis)) ? used.value : { use: currentUse, selectionRevision };
  const onUsed = (value: OperationResponse<'useVersion'>) => {
    setUsed(previous => previous && previous.value.selectionRevision > value.selectionRevision ? previous : { basis, value });
    notifyUsed?.(value);
  };
  const context: ReviewSelection = { currentUse: selection.use, selectionRevision: selection.selectionRevision, onUsed };
  return <div className="wp-version-review" data-displayed-version-id={visible.id} data-paged-history={historyPrerequisite.length === 0 || undefined}>
    {selected && <div className="wp-version-reading"><span>Viewing version {visible.revision}</span><Button variant="quiet" onPress={() => setSelected(null)}>Back to current version</Button></div>}
    <div className="wp-version-body" hidden={!!selected} inert={!!selected}>{children(selected ? version : visible, true, context)}</div>
    {selected && <div className="wp-version-body">{children(visible, false, context)}</div>}
    <details className="wp-version-history" onToggle={(event) => { const expanded = event.currentTarget.open; setOpen(expanded); if (!expanded) setSelected(null); }}><summary>Version history{rows.length > 0 && complete && rows.every(item => item.revision < version.revision) ? ` · ${rows.length} earlier` : ''}</summary>
      {rows.map((item) => <div className="wp-version-history-row" key={item.id}><Button variant="quiet" data-history-id={item.id} aria-label={`View version ${item.revision}`} onPress={() => setSelected(item)}>Version {item.revision}</Button><VersionUse connection={connection} scope={scope} version={item} binding={binding} currentUse={selection.use} selectionRevision={selection.selectionRevision} selectedVersionId={selection.use?.versionId ?? selectedVersionId ?? null} onUsed={onUsed} /></div>)}
      {open && historyPrerequisite.length === 0 && <HistoryControls read={history} invalid={!valid} />}
    </details>
  </div>;
}
