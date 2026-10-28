import { useState } from 'react';
import type { ReactNode } from 'react';
import type { OperationResponse, Version } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { Button } from '../ui/controls.js';
import { VersionUse, type VersionUseProps } from './use.js';
import { useExactVersion, useVersionHistory } from './reads.js';
import './review.css';

type Use = OperationResponse<'useVersion'>['use'];
export type VersionReviewProps = { connection: BrowserClient; scope: ReadScope | null; version: Version; currentUse: Use | null; selectionRevision: number; binding: VersionUseProps['binding']; historyPrerequisite?: readonly Version[]; children: (version: Version, editable: boolean) => ReactNode };
export function VersionReview(props: VersionReviewProps) {
  return <ScopedReview key={JSON.stringify([props.scope?.accountId, props.scope?.conversationId, props.version.artifactId])} {...props} />;
}
function ScopedReview({ connection, scope, version, binding, currentUse, selectionRevision, historyPrerequisite = [], children }: VersionReviewProps) {
  const [selected, setSelected] = useState<Version | null>(null);
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState<{ basis: string; value: OperationResponse<'useVersion'> } | null>(null);
  const basis = JSON.stringify(currentUse);
  const requested = selected ?? version;
  const client = connection.kind === 'configured' ? connection.client : null;
  const read = useExactVersion(client, scope, requested.id);
  const candidate = read.kind === 'settled' && read.result.ok ? read.result.value : null;
  const visible = candidate && candidate.id === requested.id && candidate.artifactId === requested.artifactId && candidate.kind === requested.kind && candidate.revision === requested.revision ? candidate : requested;
  const history = useVersionHistory(client, scope, version.artifactId, open);
  const supplied = history.kind === 'settled' && history.result.ok ? history.result.value.items : historyPrerequisite;
  const ids = new Set<string>();
  const revisions = new Set<number>();
  const earlier = supplied.filter((item) => item.artifactId === version.artifactId && item.kind === version.kind && item.revision < version.revision && item.id !== version.id);
  const valid = earlier.every((item) => { if (ids.has(item.id) || revisions.has(item.revision)) return false; ids.add(item.id); revisions.add(item.revision); return true; });
  const rows = valid ? [...earlier].sort((a, b) => b.revision - a.revision) : [];
  const selection = used && (used.value.selectionRevision > selectionRevision || (used.value.selectionRevision === selectionRevision && used.basis === basis)) ? used.value : { use: currentUse, selectionRevision };
  return <div className="wp-version-review" data-displayed-version-id={visible.id}>
    <div className="wp-version-body" hidden={!!selected} inert={!!selected}>{children(selected ? version : visible, true)}</div>
    {selected && <div className="wp-version-body">{children(visible, false)}</div>}
    <details className="wp-version-history" onToggle={(event) => { const expanded = event.currentTarget.open; setOpen(expanded); if (!expanded) setSelected(null); }}><summary>Version history{rows.length > 0 && (history.kind !== 'settled' || !history.result.ok || history.result.value.nextCursor === null) ? ` · ${rows.length} earlier` : ''}</summary>
      {rows.map((item) => <div className="wp-version-history-row" key={item.id}><Button variant="quiet" aria-label={`View version ${item.revision}`} onPress={() => setSelected(item)}>Version {item.revision}</Button><VersionUse connection={connection} scope={scope} version={item} binding={binding} currentUse={selection.use} selectionRevision={selection.selectionRevision} onUsed={(value) => setUsed((previous) => previous && previous.value.selectionRevision > value.selectionRevision ? previous : { basis, value })} /></div>)}
    </details>
  </div>;
}
