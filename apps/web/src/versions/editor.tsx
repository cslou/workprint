import { useEffect, useRef, useState } from 'react';
import type { Version } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { PanelSection } from '../ui/panel.js';
import { VersionTextSection, saveFeedback } from './text-section.js';

export type VersionEditorProps = { connection: BrowserClient; scope: ReadScope | null; version: Version; field: string; label: string; readOnly?: boolean };
type ContentVersion = Extract<Version, { content: unknown }>;

/** The caller supplies an explicit field mapping; opaque domain JSON is never guessed. */
export function VersionEditor(props: VersionEditorProps) {
  const { version, field, scope } = props;
  if (!('content' in version) || !Object.hasOwn(version.content, field) || typeof version.content[field] !== 'string') return null;
  if (props.readOnly) return <PanelSection title={props.label}><div className="wp-version-editor" data-version-id={version.id} data-version-revision={version.revision}><p className="wp-version-display">{String(version.content[field])}</p></div></PanelSection>;
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
  return <VersionTextSection versionId={visible.id} revision={visible.revision} label={label} value={String(visible.content[field])} editing={editing} text={text} pending={pending} canSave={!!client && !!scope?.conversationId} feedback={feedback} onBegin={begin} onCancel={cancel} onSave={() => void save()} onChange={setText} />;
}
