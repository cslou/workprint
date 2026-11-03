import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { orderedStoryboard } from '../workspace/projection.js';
import { savedStoryboardContentSchema, type OperationResponse } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { WorkspaceEmpty } from '../ui/panel.js';
import { ManualVersionEditor } from '../versions/manual-editor.js';
import { VersionTextSection, saveFeedback } from '../versions/text-section.js';
import { editedShots, submitStoryboardEdit } from './storyboard-edit.js';

type Workspace = OperationResponse<'workspace'>;
export type PlanningTarget = { kind: 'shot'; shotId: string } | { kind: 'panel'; shotId: string; panelId: string };
export type PlanningDraft = { editing: boolean; text: string; feedback: string | null; pending: boolean };
export const emptyPlanningDraft: PlanningDraft = { editing: false, text: '', feedback: null, pending: false };
type Props = { connection: BrowserClient; scope: ReadScope | null; workspace: Workspace; target: PlanningTarget; onSaved?: (result: OperationResponse<'saveVersion'>) => void; draft?: { value: PlanningDraft; onChange: Dispatch<SetStateAction<PlanningDraft>> }; onEdited(result: OperationResponse<'editStoryboard'>): void | Promise<void> };
/** Typed planning only. Opaque version content, camera/lens and media are never interpreted. */
export function PlanningEditor(props: Props) {
  const version = props.workspace.storyboard.work?.version;
  if (version?.kind === 'storyboard' && savedStoryboardContentSchema.safeParse(version.content).success) return <ManualVersionEditor connection={props.connection} scope={props.scope} version={version} target={props.target} label={props.target.kind === 'shot' ? 'Shot intent' : 'Panel description'} pencilPadding="native" currentUse={props.workspace.storyboard.work?.use ?? null} {...(props.onSaved ? { onSaved: props.onSaved } : {})} />;
  return <BoundPlanningEditor key={JSON.stringify([props.scope?.accountId, props.scope?.conversationId, version?.id, version?.revision, props.target])} {...props} />;
}
function BoundPlanningEditor({ connection, scope, workspace, target, draft, onEdited }: Props) {
  const [local, setLocal] = useState(emptyPlanningDraft);
  const { editing, text, feedback, pending } = draft?.value ?? local;
  const update = draft?.onChange ?? setLocal;
  const setEditing = (editing: boolean) => update(previous => ({ ...previous, editing }));
  const setText = (text: string) => update(previous => ({ ...previous, text }));
  const setFeedback = (feedback: string | null) => update(previous => ({ ...previous, feedback }));
  const setPending = (pending: boolean) => update(previous => ({ ...previous, pending }));
  const active = useRef(true), busy = useRef(false);
  const latestRevision = useRef(workspace.selectionRevision); latestRevision.current = workspace.selectionRevision;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const shots = workspace.storyboard.shots;
  const valid = orderedStoryboard(shots) !== null;
  const base = workspace.storyboard.work?.version;
  const shot = valid ? shots.find(shot => shot.shotId === target.shotId) : undefined;
  const panel = target.kind === 'panel' ? shot?.panels.find(panel => panel.panelId === target.panelId) : undefined;
  if (!base || base.kind !== 'storyboard' || !shot || (target.kind === 'panel' && !panel)) return <WorkspaceEmpty tab="storyboard" />;
  const value = target.kind === 'shot' ? shot.intent ?? '' : panel!.description;
  const label = target.kind === 'shot' ? 'Shot intent' : 'Panel description';
  const save = async () => {
    if (connection.kind !== 'configured' || !scope?.conversationId || busy.current || pending) return;
    busy.current = true; setPending(true); setFeedback(null);
    try {
      const change = target.kind === 'shot' ? { shotId: target.shotId, intent: text } : { shotId: target.shotId, panel: { panelId: target.panelId, description: text } };
      const outcome = await submitStoryboardEdit(connection.client, scope.conversationId, base, editedShots(shots, change), () => latestRevision.current);
      if (!active.current || outcome.kind === 'superseded') return;
      if (outcome.kind === 'refused') { setFeedback(saveFeedback(outcome.code)); return; }
      // The composition owner supplies the next public projection; no opaque JSON is guessed.
      await onEdited(outcome.value);
    } catch { if (active.current) setFeedback(saveFeedback('transport_failure')); }
    finally { busy.current = false; if (active.current || draft) setPending(false); }
  };
  return <VersionTextSection pencilPadding="native" versionId={base.id} revision={base.revision} label={label} value={value} editing={editing} text={text} pending={pending} canSave={connection.kind === 'configured' && !!scope?.conversationId} feedback={feedback} onBegin={() => { setText(value); setFeedback(null); setEditing(true); }} onCancel={() => { setText(''); setFeedback(null); setEditing(false); }} onSave={() => void save()} onChange={setText} />;
}
