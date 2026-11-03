import { useState } from 'react';
import { shotDurations } from '@workprint/contracts';
import { Button } from '../ui/controls.js';
import { lengthOutOfRange, lengthText, shotLengthSeconds } from './storyboard-edit.js';
import { useShotEdit, type ShotEditProps } from './use-shot-edit.js';

/** A Shot's length in "View storyboard". A person's change is a storyboard edit of that Shot's length alone. */
export function ShotLength(props: ShotEditProps) {
  const edit = useShotEdit(props);
  const [text, setText] = useState('');
  const { shot } = edit;
  if (!shot) return null;
  const save = async () => {
    const value = shotLengthSeconds(text);
    if (value === null) { edit.setFeedback(lengthOutOfRange); return; }
    // The server refuses an edit that changes nothing, so an unchanged length just closes.
    if (value === shot.durationS) { edit.close(); return; }
    await edit.submit({ durationS: value });
  };
  return <div className="wp-shot-length" ref={edit.root}>
    {edit.editing ? <div className="wp-version-editor">
      <label className="wp-shot-length-field">Length in seconds<input className="wp-version-field" type="number" inputMode="numeric" min={shotDurations.min} max={shotDurations.max} step={1} value={text} readOnly={edit.pending} onChange={event => setText(event.target.value)} /></label>
      <div className="wp-version-edit-actions"><Button variant="secondary" isDisabled={edit.pending} onPress={edit.close}>Cancel</Button><Button isPending={edit.pending} onPress={() => void save()}>Save</Button></div>
      {edit.feedback && <p className="wp-version-feedback" role="status">{edit.feedback}</p>}
    </div> : <>
      <span className="wp-shot-length-text">{lengthText(shot.durationS)}</span>
      {edit.editable && <Button variant="quiet" aria-label="Edit Shot length" onPress={() => { setText(shot.durationS === undefined ? '' : String(shot.durationS)); edit.open(); }}>Edit</Button>}
    </>}
  </div>;
}
