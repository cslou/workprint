import { useEffect, useRef, useState } from 'react';
import type { ExportRecord } from './reads.js';
import { useExports } from './reads.js';
import { ExportDetails, ExportFacts, ExportUnavailable, currentness, type ExportContext } from './record.js';
import { Button } from '../ui/controls.js';
import { ViewerDialog } from '../ui/overlays.js';
import { EmptyState } from '../ui/panel.js';
import { StatusPill } from '../ui/status.js';
import './exports.css';

/** Labelled, read-only absent producer prerequisites, supplied only by isolated compositions. */
export type ExportPrerequisites = readonly ExportRecord[];
type Props = ExportContext & { selectionRevision: number; prerequisites?: ExportPrerequisites };
export function Exports(props: Props) {
  return <ScopedExports key={JSON.stringify([props.scope?.accountId, props.scope?.conversationId])} {...props} />;
}
function ScopedExports(props: Props) {
  const [pending, setPending] = useState(false), [attempted, setAttempted] = useState(false);
  const [record, setRecord] = useState<ExportRecord | null>(null);
  const busy = useRef(false), active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const submit = async () => {
    if (busy.current || props.connection.kind !== 'configured' || !props.scope?.conversationId) return;
    busy.current = true; setPending(true); setAttempted(true); setRecord(null);
    try {
      const result = await props.connection.client.createExport({ params: { id: props.scope.conversationId }, query: {}, body: { operationId: crypto.randomUUID(), selectionRevision: props.selectionRevision } });
      if (active.current && result.ok) setRecord(result.value.export);
    } catch {
      // A thrown transport/token-provider failure has the same unavailable UI;
      // no response means there is no record to display.
      if (active.current) setRecord(null);
    } finally { busy.current = false; if (active.current) setPending(false); }
  };
  return <div className="wp-export-entry" aria-label="Chosen source versions">
    <p>Chosen source versions</p><div className="wp-export-actions">
      <ViewerDialog title="Export" trigger={<Button isDisabled={pending || props.connection.kind !== 'configured' || !props.scope?.conversationId} onPress={() => void submit()}>Export</Button>}>
        {pending ? <EmptyState>Requesting export…</EmptyState> : record ? <ExportFacts {...props} record={record} /> : attempted ? <ExportUnavailable surface="Export" /> : null}
      </ViewerDialog>
      <ViewerDialog title="Export history" trigger={<Button variant="secondary">Export history</Button>}><ExportHistory {...props} /></ViewerDialog>
    </div>
  </div>;
}
export function ExportHistory(props: ExportContext & { prerequisites?: ExportPrerequisites }) {
  const read = useExports(props.connection.kind === 'configured' ? props.connection.client : null, props.scope);
  const records = read.kind === 'settled' && read.result.ok ? read.result.value : props.prerequisites ?? [];
  return <div className="wp-export-history">
    {records.map((record, index) => <div className="wp-export-card" key={record.id}>
      <b>Export</b><StatusPill state={record.status} /><p>{currentness(record)}</p>
      <div><ViewerDialog title="Export details" trigger={<Button variant="secondary" aria-label={`Export details, export ${index + 1} of ${records.length}`}>Export details</Button>}><ExportDetails {...props} id={record.id} {...(props.prerequisites?.includes(record) ? { prerequisite: record } : {})} /></ViewerDialog></div>
    </div>)}
    {read.kind === 'loading' ? <EmptyState>Loading export history…</EmptyState> : read.kind !== 'settled' || !read.result.ok ? <ExportUnavailable surface="History" /> : records.length === 0 ? <EmptyState>No exports yet.</EmptyState> : null}
  </div>;
}
