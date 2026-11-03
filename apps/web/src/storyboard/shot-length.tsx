import { useEffect, useRef, useState } from 'react';
import { shotDurations, type OperationResponse } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import { useDraftGuard } from '../api/draft-guard.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { Button } from '../ui/controls.js';
import { saveFeedback } from '../versions/text-section.js';
import { orderedStoryboard } from '../workspace/projection.js';
import { editedShots, lengthOutOfRange, lengthText, shotLengthSeconds, storyboardEditable, submitStoryboardEdit } from './storyboard-edit.js';

type Workspace = OperationResponse<'workspace'>;
type Props = { connection: BrowserClient; scope: ReadScope | null; workspace: Workspace; shotId: string; onEdited(result: OperationResponse<'editStoryboard'>): void | Promise<void> };

/**
 * A Shot's length in "View storyboard". A person's change is a storyboard edit of that Shot's length alone: every
 * other Shot field is kept by the server. A built-in storyboard is shown but not edited.
 */
export function ShotLength({ connection, scope, workspace, shotId, onEdited }: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useDraftGuard(editing);
  const active = useRef(true), busy = useRef(false);
  const latestRevision = useRef(workspace.selectionRevision); latestRevision.current = workspace.selectionRevision;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  // Closing the editor returns focus to its Edit control, so focus stays inside the open board.
  const root = useRef<HTMLDivElement>(null), refocus = useRef(false);
  useEffect(() => { if (!editing && refocus.current) { refocus.current = false; root.current?.querySelector<HTMLButtonElement>('button')?.focus(); } }, [editing]);
  const base = workspace.storyboard.work?.version;
  const shots = orderedStoryboard(workspace.storyboard.shots) ? workspace.storyboard.shots : [];
  const shot = shots.find(item => item.shotId === shotId);
  if (!shot) return null;
  const editable = storyboardEditable(base, connection, scope);
  const close = () => { refocus.current = true; setText(''); setFeedback(null); setEditing(false); };
  const save = async () => {
    if (!storyboardEditable(base, connection, scope) || connection.kind !== 'configured' || !scope?.conversationId || busy.current) return;
    const value = shotLengthSeconds(text);
    if (value === null) { setFeedback(lengthOutOfRange); return; }
    // The server refuses an edit that changes nothing, so an unchanged length just closes.
    if (value === shot.durationS) { close(); return; }
    busy.current = true; setPending(true); setFeedback(null);
    try {
      const outcome = await submitStoryboardEdit(connection.client, scope.conversationId, base, editedShots(shots, { shotId, durationS: value }), () => latestRevision.current);
      if (!active.current) return;
      if (outcome.kind === 'refused') { setFeedback(saveFeedback(outcome.code)); return; }
      // An answer older than the board already shown is dropped, but the length was saved, so the editor closes.
      if (outcome.kind === 'edited') await onEdited(outcome.value);
      if (active.current) close();
    } catch { if (active.current) setFeedback(saveFeedback('transport_failure')); }
    finally { busy.current = false; if (active.current) setPending(false); }
  };
  return <div className="wp-shot-length" ref={root}>
    {editing ? <div className="wp-version-editor">
      <label className="wp-shot-length-field">Length in seconds<input className="wp-version-field" type="number" inputMode="numeric" min={shotDurations.min} max={shotDurations.max} step={1} value={text} readOnly={pending} onChange={event => setText(event.target.value)} /></label>
      <div className="wp-version-edit-actions"><Button variant="secondary" isDisabled={pending} onPress={close}>Cancel</Button><Button isPending={pending} onPress={() => void save()}>Save</Button></div>
      {feedback && <p className="wp-version-feedback" role="status">{feedback}</p>}
    </div> : <>
      <span className="wp-shot-length-text">{lengthText(shot.durationS)}</span>
      {editable && <Button variant="quiet" aria-label="Edit Shot length" onPress={() => { setText(shot.durationS === undefined ? '' : String(shot.durationS)); setFeedback(null); setEditing(true); }}>Edit</Button>}
    </>}
  </div>;
}
