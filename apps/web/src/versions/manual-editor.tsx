import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createManualSave, type ManualSave, type ManualSaveState } from '@workprint/api-client';
import type { OperationResponse, Version } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { Button } from '../ui/controls.js';
import { PanelSection } from '../ui/panel.js';
import { savedTextTarget, type SavedTextTarget } from './targets.js';
import { useDraftGuard } from '../api/draft-guard.js';
import { VersionTextSection, saveFeedback } from './text-section.js';
import { readReferenceDraft, referenceTarget } from './reference-target.js';
import { ReferenceImages } from './reference-images.js';
import './manual-editor.css';

type Saved = OperationResponse<'saveVersion'>;
type Props = { connection: BrowserClient; scope: ReadScope | null; version: Version; target: SavedTextTarget; label: string; currentUse?: Saved['use'] | null; readOnly?: boolean; pencilPadding?: 'flush' | 'native'; onSaved?(result: Saved): void | boolean };
const idle = () => null;
const subscribeIdle = () => () => {};
export function ManualVersionEditor(props: Props) {
  return <BoundManualEditor key={JSON.stringify([props.scope?.accountId, props.scope?.conversationId, props.version.artifactId, props.target])} {...props} />;
}
function BoundManualEditor({ connection, scope, version, target, label, currentUse, readOnly, pencilPadding = 'native', onSaved }: Props) {
  const reference = target.kind === 'reference-description' && referenceTarget.read(version) !== null;
  const mapping = useMemo(() => reference ? referenceTarget : savedTextTarget(target), [reference, target]);
  const [controller, setController] = useState<ManualSave | null>(null);
  const [saved, setSaved] = useState<Version | null>(null);
  const active = useRef(true), root = useRef<HTMLDivElement>(null), wasEditing = useRef(false), restoreOwnedFocus = useRef(false);
  const subscribe = useCallback((notify: () => void) => {
    if (!controller) return subscribeIdle();
    return controller.subscribe(() => {
      // Capture ownership before notifying React, while the completing field still exists.
      if (!controller.getSnapshot().editing) restoreOwnedFocus.current = !!root.current?.contains(document.activeElement);
      notify();
    });
  }, [controller]);
  const state = useSyncExternalStore<ManualSaveState | null>(subscribe, controller?.getSnapshot ?? idle);
  const editing = state?.editing ?? false;
  useDraftGuard(editing, state?.phase === 'unknown' || state?.phase === 'pending');
  useLayoutEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => () => controller?.dispose(), [controller]);
  useLayoutEffect(() => {
    if (editing === wasEditing.current) return;
    wasEditing.current = editing;
    if (!editing) {
      const owned = restoreOwnedFocus.current; restoreOwnedFocus.current = false;
      if (!owned || (document.activeElement !== document.body && !root.current?.contains(document.activeElement))) return;
    }
    const node = root.current?.querySelector<HTMLElement>(editing ? 'textarea' : '.wp-version-pencil button');
    if (node && !node.closest('[hidden],[inert]')) node.focus({ preventScroll: true });
  }, [editing]);
  const visible = saved && saved.revision > version.revision ? saved : version;
  const base = editing && state ? state.base : visible;
  const raw = mapping.read(editing && state ? state.base : visible);
  const value = reference && raw !== null ? readReferenceDraft(raw).description : raw;
  const referenceDraft = reference && editing && state ? readReferenceDraft(state.text) : null;
  const client = connection.kind === 'configured' ? connection.client : null;
  if (value === null) return null;
  if (!editing && (readOnly || visible.builtIn)) return <PanelSection title={label}><p className="wp-version-display">{value}</p></PanelSection>;
  const begin = () => {
    if (!client || !scope?.conversationId) return;
    const next = createManualSave({ client, conversationId: scope.conversationId, version: visible, target: mapping, ...(currentUse?.versionId === visible.id ? { intendedUse: currentUse.binding } : {}) });
    next.begin(); setController(next);
  };
  const finish = async () => {
    if (!controller) return;
    const result = await (state?.phase === 'unknown' ? controller.retry() : controller.submit());
    if (!active.current || !result) return;
    const superseded = onSaved?.(result) === false;
    if (!superseded) setSaved(result.version);
    setController(null);
  };
  const phase = state?.phase;
  const feedback = phase === 'pending' ? 'Saving changes…'
    : phase === 'unknown' ? 'Save could not be confirmed. Retry checks the same save; Cancel does not undo a completed save. Your text is retained.'
    : phase === 'conflict' ? 'A newer version was saved. Your unsaved text is retained. Review the latest version before saving again.'
    : phase === 'review' ? 'A newer version was saved. Your unsaved text is retained.'
    : phase === 'review-loading' ? 'Loading the latest saved version. Your unsaved text is retained.'
    : phase === 'review-error' ? 'The latest version could not be loaded. Your unsaved text is retained.'
    : phase === 'blocked' ? 'The saved structure changed. Your text is retained, but it cannot be applied to this version automatically.'
    : phase === 'rejected' ? saveFeedback(state?.failure ?? 'invalid_input')
    : state?.reviewed ? `Editing from version ${base.revision}. Your text is not saved yet.` : null;
  return <div ref={root} className="wp-manual-editor"><VersionTextSection versionId={base.id} revision={base.revision} label={label} value={value} editing={editing} text={referenceDraft?.description ?? state?.text ?? ''} fields={referenceDraft ? <ReferenceImages connection={connection} draft={referenceDraft} locked={phase === 'pending' || phase === 'unknown'} onChange={draft => controller?.change(JSON.stringify(draft))} /> : undefined} pending={phase === 'pending'} textReadOnly={phase === 'pending' || phase === 'unknown'} saveLabel={phase === 'unknown' ? 'Retry save' : 'Save'} canSave={!!client && !!scope?.conversationId && (!phase || ['idle', 'rejected', 'unknown'].includes(phase))} {...(pencilPadding ? { pencilPadding } : {})} feedback={feedback} onBegin={begin} onCancel={() => { if (phase === 'pending') return; controller?.cancel(); setController(null); }} onSave={() => void finish()} onChange={text => controller?.change(referenceDraft ? JSON.stringify({ ...referenceDraft, description: text }) : text)}>
    {phase && ['conflict', 'blocked', 'review-error'].includes(phase) && <div className="wp-manual-recovery"><Button variant="quiet" onPress={() => { root.current?.querySelector('textarea')?.focus({ preventScroll: true }); void controller?.reviewLatest(); }}>{phase === 'review-error' ? 'Retry latest read' : 'Review latest version'}</Button></div>}
    {phase === 'review' && state?.latest && <section className="wp-manual-latest"><div className="wp-panel-label"><span>Latest saved version · Version {state.latest.revision}</span></div><p>{reference ? readReferenceDraft(mapping.read(state.latest)!).description : mapping.read(state.latest)}</p>{reference && <p>{readReferenceDraft(mapping.read(state.latest)!).references.length} exact image associations in the latest saved version. Your unsaved choices are retained.</p>}<p className="wp-version-feedback">Continue only keeps your text against this reviewed base. Nothing is saved or approved until you press Save.</p><div className="wp-version-edit-actions"><Button variant="quiet" onPress={() => { root.current?.querySelector('textarea')?.focus({ preventScroll: true }); controller?.backToEdit(); }}>Back to my edit</Button><Button variant="secondary" onPress={() => { root.current?.querySelector('textarea')?.focus({ preventScroll: true }); controller?.continueWithText(); }}>Continue with my text</Button></div></section>}
  </VersionTextSection></div>;
}
