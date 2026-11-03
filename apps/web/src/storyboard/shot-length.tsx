import { useEffect, useRef, useState } from 'react';
import { shotDurations, type OperationResponse } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import { useDraftGuard } from '../api/draft-guard.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { Button } from '../ui/controls.js';
import { saveFeedback } from '../versions/text-section.js';
import { orderedStoryboard } from '../workspace/projection.js';

type Workspace = OperationResponse<'workspace'>;
type Props = { connection: BrowserClient; scope: ReadScope | null; workspace: Workspace; shotId: string; onEdited(result: OperationResponse<'editStoryboard'>): void | Promise<void> };

/** The Shot's length line, "Length · 6 s" or "Length · not set". */
export const lengthText = (durationS: number | undefined) => `Length · ${durationS === undefined ? 'not set' : `${durationS} s`}`;
const outOfRange = `Enter a whole number of seconds from ${shotDurations.min} to ${shotDurations.max}.`;

/** The seconds a person typed, when they are a whole number in the Shot length range. */
function seconds(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const value = Number(text.trim());
  return value >= shotDurations.min && value <= shotDurations.max ? value : null;
}

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
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const base = workspace.storyboard.work?.version;
  const shots = orderedStoryboard(workspace.storyboard.shots) ? workspace.storyboard.shots : [];
  const shot = shots.find(item => item.shotId === shotId);
  if (!shot) return null;
  const editable = base?.kind === 'storyboard' && 'content' in base && !base.builtIn && connection.kind === 'configured' && !!scope?.conversationId;
  const save = async () => {
    if (connection.kind !== 'configured' || !scope?.conversationId || !base || busy.current) return;
    const value = seconds(text);
    if (value === null) { setFeedback(outOfRange); return; }
    const submitted = shots.map(item => ({ shotId: item.shotId, order: item.order, ...(item.intent === undefined ? {} : { intent: item.intent }), ...(item.shotId === shotId ? { durationS: value } : {}),
      panels: item.panels.map(panel => ({ panelId: panel.panelId, order: panel.order, description: panel.description, references: [...panel.references] })) }));
    busy.current = true; setPending(true); setFeedback(null);
    try {
      const result = await connection.client.editStoryboard({ params: { id: scope.conversationId }, query: {}, body: { operationId: crypto.randomUUID(), baseVersionId: base.id, shots: submitted } });
      if (!active.current) return;
      if (!result.ok) { setFeedback(saveFeedback(result.error.code)); return; }
      await onEdited(result.value);
      if (active.current) { setEditing(false); setText(''); }
    } catch { if (active.current) setFeedback(saveFeedback('transport_failure')); }
    finally { busy.current = false; if (active.current) setPending(false); }
  };
  return <div className="wp-shot-length">
    {editing ? <div className="wp-version-editor">
      <label className="wp-shot-length-field">Length in seconds<input className="wp-version-field" type="number" inputMode="numeric" min={shotDurations.min} max={shotDurations.max} step={1} value={text} readOnly={pending} onChange={event => setText(event.target.value)} /></label>
      <div className="wp-version-edit-actions"><Button variant="secondary" isDisabled={pending} onPress={() => { setText(''); setFeedback(null); setEditing(false); }}>Cancel</Button><Button isPending={pending} onPress={() => void save()}>Save</Button></div>
      {feedback && <p className="wp-version-feedback" role="status">{feedback}</p>}
    </div> : <>
      <span className="wp-shot-length-text">{lengthText(shot.durationS)}</span>
      {editable && <Button variant="quiet" aria-label="Edit Shot length" onPress={() => { setText(shot.durationS === undefined ? '' : String(shot.durationS)); setFeedback(null); setEditing(true); }}>Edit</Button>}
    </>}
  </div>;
}
