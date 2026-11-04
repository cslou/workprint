import { useEffect, useRef, useState } from 'react';
import type { OperationResponse } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import { useDraftGuard } from '../api/draft-guard.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { saveFeedback } from '../versions/text-section.js';
import { orderedStoryboard } from '../workspace/projection.js';
import { editedShots, storyboardEditable, submitStoryboardEdit, type ShotChange } from './storyboard-edit.js';

type Workspace = OperationResponse<'workspace'>;
export type ShotEditProps = { connection: BrowserClient; scope: ReadScope | null; workspace: Workspace; shotId: string; onEdited(result: OperationResponse<'editStoryboard'>): void | Promise<void> };

/**
 * One Shot field's editor in "View storyboard": whether it is open, saving or showing feedback, and `submit`, which
 * sends a storyboard edit of that one change (every other Shot field is kept by the server). Closing returns focus to
 * the field's Edit control, so focus stays inside the open board. A built-in storyboard is shown but not edited.
 */
export function useShotEdit({ connection, scope, workspace, shotId, onEdited }: ShotEditProps) {
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useDraftGuard(editing);
  const active = useRef(true), busy = useRef(false);
  const latestRevision = useRef(workspace.selectionRevision); latestRevision.current = workspace.selectionRevision;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const root = useRef<HTMLDivElement>(null), refocus = useRef(false);
  useEffect(() => { if (!editing && refocus.current) { refocus.current = false; root.current?.querySelector<HTMLButtonElement>('button')?.focus(); } }, [editing]);
  const base = workspace.storyboard.work?.version;
  const shots = orderedStoryboard(workspace.storyboard.shots) ? workspace.storyboard.shots : [];
  const shot = shots.find(item => item.shotId === shotId);
  const open = () => { setFeedback(null); setEditing(true); };
  const close = () => { refocus.current = true; setFeedback(null); setEditing(false); };
  const submit = async (change: Omit<ShotChange, 'shotId'>) => {
    if (!storyboardEditable(base, connection, scope) || connection.kind !== 'configured' || !scope?.conversationId || busy.current) return;
    busy.current = true; setPending(true); setFeedback(null);
    try {
      const outcome = await submitStoryboardEdit(connection.client, scope.conversationId, base, editedShots(shots, { ...change, shotId }), () => latestRevision.current);
      if (!active.current) return;
      if (outcome.kind === 'refused') { setFeedback(saveFeedback(outcome.code)); return; }
      // An answer older than the board already shown is dropped, but the change was saved, so the editor closes.
      if (outcome.kind === 'edited') await onEdited(outcome.value);
      if (active.current) close();
    } catch { if (active.current) setFeedback(saveFeedback('transport_failure')); }
    finally { busy.current = false; if (active.current) setPending(false); }
  };
  return { shot, editable: storyboardEditable(base, connection, scope), editing, pending, feedback, setFeedback, open, close, submit, root };
}
