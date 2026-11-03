import { useState } from 'react';
import { shotPositionLength } from '@workprint/contracts';
import { Button } from '../ui/controls.js';
import { positionsEdit, positionsMissing, positionsText } from './storyboard-edit.js';
import { useShotEdit, type ShotEditProps } from './use-shot-edit.js';

/**
 * A Shot's start and end positions in "View storyboard". A person's change is a storyboard edit of that Shot's
 * positions alone; both are needed, including when adding them to an earlier Shot without any.
 */
export function ShotPositions(props: ShotEditProps) {
  const edit = useShotEdit(props);
  const [start, setStart] = useState(''), [end, setEnd] = useState('');
  const { shot } = edit;
  if (!shot) return null;
  const save = async () => {
    const typed = positionsEdit(shot.positions, start, end);
    if (typed.kind === 'missing') { edit.setFeedback(positionsMissing); return; }
    // The server refuses an edit that changes nothing, so unchanged positions just close.
    if (typed.kind === 'unchanged') { edit.close(); return; }
    await edit.submit({ positions: typed.positions });
  };
  const field = (label: string, value: string, set: (text: string) => void) =>
    <label className="wp-shot-positions-field">{label}<textarea className="wp-version-field" rows={2} maxLength={shotPositionLength} value={value} readOnly={edit.pending} onChange={event => set(event.target.value)} /></label>;
  return <div className="wp-shot-positions" ref={edit.root}>
    {edit.editing ? <div className="wp-version-editor">
      {field('Starts', start, setStart)}
      {field('Ends', end, setEnd)}
      <div className="wp-version-edit-actions"><Button variant="secondary" isDisabled={edit.pending} onPress={edit.close}>Cancel</Button><Button isPending={edit.pending} onPress={() => void save()}>Save</Button></div>
      {edit.feedback && <p className="wp-version-feedback" role="status">{edit.feedback}</p>}
    </div> : <>
      <span className="wp-shot-positions-text">{positionsText(shot.positions)}</span>
      {edit.editable && <Button variant="quiet" aria-label="Edit Shot positions" onPress={() => { setStart(shot.positions?.start ?? ''); setEnd(shot.positions?.end ?? ''); edit.open(); }}>Edit</Button>}
    </>}
  </div>;
}
