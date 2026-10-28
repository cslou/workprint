import { PanelSection } from '../ui/panel.js';
import { Button } from '../ui/controls.js';
import './editor.css';

export const saveFeedback = (code: string) => code === 'unauthenticated' ? 'Sign-in required to save. Your unsaved text is retained.' : code === 'not_implemented' ? 'Saving is not available yet. Your unsaved text is retained.' : 'Changes were not saved. Your unsaved text is retained.';
export type VersionTextSectionProps = { versionId: string; revision: number; label: string; value: string; editing: boolean; text: string; pending: boolean; canSave: boolean; feedback: string | null; onBegin(): void; onCancel(): void; onSave(): void; onChange(value: string): void };
/** Shared presentation only: exact-version command authority stays with the caller. */
export function VersionTextSection({ versionId, revision, label, value, editing, text, pending, canSave, feedback, onBegin, onCancel, onSave, onChange }: VersionTextSectionProps) {
  return <PanelSection title={label} action={!editing && <span className="wp-version-pencil"><Button variant="icon" aria-label={`Edit ${label}`} onPress={onBegin}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg></Button></span>}>
    <div className="wp-version-editor" data-version-id={versionId} data-version-revision={revision}>
      {editing ? <><textarea className="wp-version-field" rows={6} aria-label={label} value={text} onChange={event => onChange(event.target.value)} /><div className="wp-version-edit-actions"><Button variant="secondary" isDisabled={pending} onPress={onCancel}>Cancel</Button><Button isDisabled={pending || !canSave} onPress={onSave}>Save</Button></div>{feedback && <p className="wp-version-feedback" role="status">{feedback}</p>}</> : <p className="wp-version-display">{value}</p>}
    </div>
  </PanelSection>;
}
