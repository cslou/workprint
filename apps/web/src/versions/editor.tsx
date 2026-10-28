import { useEffect, useRef, useState } from 'react';
import type { Version } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { PanelSection } from '../ui/panel.js';
import { Button } from '../ui/controls.js';
import './editor.css';

export type VersionEditorProps = { connection: BrowserClient; scope: ReadScope | null; version: Version; field: string; label: string };
type ContentVersion = Extract<Version, { content: unknown }>;
const saveFeedback = (code: string) => code === 'unauthenticated' ? 'Sign-in required to save. Your unsaved text is retained.' : code === 'not_implemented' ? 'Saving is not available yet. Your unsaved text is retained.' : 'Changes were not saved. Your unsaved text is retained.';

/** The caller supplies an explicit field mapping; opaque domain JSON is never guessed. */
export function VersionEditor(props: VersionEditorProps) {
  const { version, field, scope } = props;
  if (!('content' in version) || !Object.hasOwn(version.content, field) || typeof version.content[field] !== 'string') return null;
  return <BoundEditor key={JSON.stringify([scope?.accountId, scope?.conversationId, version.id, version.revision, field])} {...props} version={version} />;
}
function BoundEditor({ connection, scope, version, field, label }: VersionEditorProps & { version: ContentVersion }) {
  const [saved, setSaved] = useState<ContentVersion | null>(null);
  const visible = saved ?? version;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const client = connection.kind === 'configured' ? connection.client : null;
  const begin = () => { setText(String(visible.content[field])); setFeedback(null); setEditing(true); };
  const cancel = () => { setText(''); setFeedback(null); setEditing(false); };
  const save = async () => {
    const conversationId = scope?.conversationId;
    if (!client || !conversationId || busy.current) return;
    const base = visible;
    busy.current = true; setPending(true); setFeedback(null);
    try {
      const result = await client.saveVersion({ params: { id: conversationId }, query: {}, body: { operationId: crypto.randomUUID(), artifactId: base.artifactId, kind: base.kind, baseVersionId: base.id, dependencies: [...base.dependencies], content: { ...base.content, [field]: text } } });
      if (!active.current) return;
      if (!result.ok) { setFeedback(saveFeedback(result.error.code)); return; }
      const next = result.value.version;
      if (!('content' in next) || next.kind !== base.kind || next.artifactId !== base.artifactId || next.id === base.id || next.revision <= base.revision || !Object.hasOwn(next.content, field) || typeof next.content[field] !== 'string') { setFeedback(saveFeedback('invalid_response')); return; }
      setSaved(next); setEditing(false); setText('');
    } catch { if (active.current) setFeedback(saveFeedback('transport_failure')); }
    finally { busy.current = false; if (active.current) setPending(false); }
  };
  return <PanelSection title={label} action={!editing && <span className="wp-version-pencil"><Button variant="icon" aria-label={`Edit ${label}`} onPress={begin}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg></Button></span>}>
    <div className="wp-version-editor" data-version-id={visible.id} data-version-revision={visible.revision}>
      {editing ? <><textarea className="wp-version-field" rows={6} aria-label={label} value={text} onChange={(event) => setText(event.target.value)} /><div className="wp-version-edit-actions"><Button variant="secondary" isDisabled={pending} onPress={cancel}>Cancel</Button><Button isDisabled={pending || !client || !scope?.conversationId} onPress={() => void save()}>Save</Button></div>{feedback && <p className="wp-version-feedback" role="status">{feedback}</p>}</> : <p className="wp-version-display">{String(visible.content[field])}</p>}
    </div>
  </PanelSection>;
}
