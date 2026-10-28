import { useEffect, useRef, useState } from 'react';
import type { OperationResponse } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { WorkspaceEmpty } from '../ui/panel.js';
import { VersionTextSection, saveFeedback } from '../versions/text-section.js';

type Workspace = OperationResponse<'workspace'>;
export type PlanningTarget = { kind: 'shot'; shotId: string } | { kind: 'panel'; shotId: string; panelId: string };
type Props = { connection: BrowserClient; scope: ReadScope | null; workspace: Workspace; target: PlanningTarget; onEdited(result: OperationResponse<'editStoryboard'>): void };
/** Typed planning only. Opaque version content, camera/lens and media are never interpreted. */
export function PlanningEditor(props: Props) {
  const version = props.workspace.storyboard.work?.version;
  return <BoundPlanningEditor key={JSON.stringify([props.scope?.accountId, props.scope?.conversationId, version?.id, version?.revision, props.target])} {...props} />;
}
function BoundPlanningEditor({ connection, scope, workspace, target, onEdited }: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const active = useRef(true), busy = useRef(false);
  const latestRevision = useRef(workspace.selectionRevision); latestRevision.current = workspace.selectionRevision;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const shots = workspace.storyboard.shots;
  const ids = new Set<string>();
  const valid = new Set(shots.map(shot => shot.order)).size === shots.length && shots.every(shot => {
    if (ids.has(shot.shotId)) return false; ids.add(shot.shotId);
    const panels = new Set<string>();
    return new Set(shot.panels.map(panel => panel.order)).size === shot.panels.length && shot.panels.every(panel => { if (panels.has(panel.panelId)) return false; panels.add(panel.panelId); return true; });
  });
  const base = workspace.storyboard.work?.version;
  const shot = valid ? shots.find(shot => shot.shotId === target.shotId) : undefined;
  const panel = target.kind === 'panel' ? shot?.panels.find(panel => panel.panelId === target.panelId) : undefined;
  if (!base || base.kind !== 'storyboard' || !shot || (target.kind === 'panel' && !panel)) return <WorkspaceEmpty tab="storyboard" />;
  const value = target.kind === 'shot' ? shot.intent ?? '' : panel!.description;
  const label = target.kind === 'shot' ? 'Shot intent' : 'Panel description';
  const save = async () => {
    if (connection.kind !== 'configured' || !scope?.conversationId || busy.current) return;
    const submitted = shots.map(item => ({ shotId: item.shotId, order: item.order, ...(item.intent === undefined ? {} : { intent: item.intent }), ...(target.kind === 'shot' && item.shotId === target.shotId ? { intent: text } : {}), panels: item.panels.map(value => ({ panelId: value.panelId, order: value.order, description: target.kind === 'panel' && item.shotId === target.shotId && value.panelId === target.panelId ? text : value.description, references: [...value.references] })) }));
    busy.current = true; setPending(true); setFeedback(null);
    try {
      const result = await connection.client.editStoryboard({ params: { id: scope.conversationId }, query: {}, body: { operationId: crypto.randomUUID(), baseVersionId: base.id, shots: submitted } });
      if (!active.current) return;
      if (!result.ok) { setFeedback(saveFeedback(result.error.code)); return; }
      const next = result.value;
      if (next.selectionRevision < latestRevision.current) return;
      if (next.version.kind !== 'storyboard' || next.version.artifactId !== base.artifactId || next.version.id === base.id || next.version.revision <= base.revision) { setFeedback(saveFeedback('invalid_response')); return; }
      // The composition owner supplies the next public projection; no opaque JSON is guessed.
      onEdited(next);
    } catch { if (active.current) setFeedback(saveFeedback('transport_failure')); }
    finally { busy.current = false; if (active.current) setPending(false); }
  };
  return <VersionTextSection versionId={base.id} revision={base.revision} label={label} value={value} editing={editing} text={text} pending={pending} canSave={connection.kind === 'configured' && !!scope?.conversationId} feedback={feedback} onBegin={() => { setText(value); setFeedback(null); setEditing(true); }} onCancel={() => { setText(''); setFeedback(null); setEditing(false); }} onSave={() => void save()} onChange={setText} />;
}
