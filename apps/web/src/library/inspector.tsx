import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPageRead, type PageReadState } from '@workprint/api-client';
import { savedReferenceContentSchema, savedScriptContentSchema, savedStoryboardContentSchema, type Version } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { useScopedRead } from '../api/use-scoped-read.js';
import { useOwnedImage } from '../api/use-owned-image.js';
import { PrivateClip } from '../media/viewer.js';
import { Button, TextField } from '../ui/controls.js';
import type { LibrarySelection } from './selection.js';
import { bindingFor, kindLabel } from './content.js';
import './inspector.css';

const idle = (): PageReadState<Version> => ({ kind: 'idle', loadingMore: false, moreError: null, addedIds: [] });
const idleState = idle();
const getIdle = () => idleState, subscribeIdle = () => () => {};
type Props = { connection: BrowserClient; scope: ReadScope | null; version: Version; selection: LibrarySelection; close(): void };
export function LibraryInspector({ connection, scope, version, selection, close }: Props) {
  const client = connection.kind === 'configured' ? connection.client : null;
  const [requested, setRequested] = useState(() => selection.inspected(version)), [historyOpen, setHistoryOpen] = useState(false), [role, setRole] = useState(() => selection.roleFor(version.artifactId));
  const readExact = useMemo(() => client ? (signal: AbortSignal) => client.version({ params: { id: requested.id }, query: {}, body: {} }, { signal }) : null, [client, requested.id]);
  const read = useScopedRead(scope, readExact);
  const exact = read.kind === 'settled' && read.result.ok && read.result.value.id === requested.id && read.result.value.artifactId === version.artifactId && read.result.value.kind === version.kind ? read.result.value : null;
  const pages = useMemo(() => client && historyOpen ? createPageRead<Version>((cursor, signal) => client.artifactVersions({ params: { id: version.artifactId }, query: cursor ? { cursor } : {}, body: {} }, { signal })) : null, [client, historyOpen, version.artifactId]);
  const history = useSyncExternalStore(pages?.subscribe ?? subscribeIdle, pages?.getSnapshot ?? getIdle);
  useEffect(() => { if (pages) { void pages.start(); return pages.dispose; } }, [pages]);
  const binding = useMemo(() => ({ ...bindingFor(requested), ...(bindingFor(requested).purpose === 'reference' && role.trim() ? { role: role.trim() } : {}) }), [requested, role]);
  // A New video gets its id on its first accepted send; a fresh command then targets that id.
  const command = useMemo(() => selection.exactUse(requested, binding), [selection, requested, binding, scope?.conversationId]);
  const state = useSyncExternalStore(command.subscribe, command.getSnapshot);
  const locked = state.phase === 'pending' || state.phase === 'unknown';
  useEffect(() => () => command.stop(), [command]);
  const use = async () => {
    if (!exact || !scope?.conversationId) return;
    const result = await (state.phase === 'unknown' ? command.retry() : command.submit());
    if (result) selection.used(result, exact);
  };
  return <div className="wp-library-inspector" data-displayed-version-id={requested.id}>
    <p className="wp-library-meta">{kindLabel[requested.kind]} · Version {requested.revision} · {requested.builtIn ? 'Read-only source' : 'Read-only inspection'}</p>
    {exact ? <InspectionContent connection={connection} scope={scope} version={exact} /> : <p role="status">{read.kind === 'loading' ? 'Loading this exact version…' : 'This exact version could not be loaded. Nothing was changed.'}</p>}
    <section className="wp-library-section"><details onToggle={event => setHistoryOpen(event.currentTarget.open)}><summary>Version history</summary>
      {history.kind === 'settled' && history.result.ok ? <><div className="wp-library-history">{history.result.value.items.filter(item => item.artifactId === version.artifactId && item.kind === version.kind).map(item => <Button key={item.id} variant="secondary" isDisabled={locked} onPress={() => { selection.inspect(item); setRequested(item); }}>Version {item.revision}</Button>)}</div>{history.omittedItems ? <p>Showing loaded versions {history.omittedItems + 1}–{history.omittedItems + history.result.value.items.length}. <Button variant="quiet" isDisabled={locked || history.loadingMore} onPress={() => void pages?.returnToFirstPage()}>Back to first page</Button></p> : null}{history.result.value.nextCursor && <Button variant="quiet" isDisabled={locked || history.loadingMore} onPress={() => void pages?.loadMore()}>Load earlier versions</Button>}{history.moreError && <p role="status">More versions could not be loaded. Existing choices are unchanged.</p>}</> : historyOpen && <p role="status">{history.kind === 'settled' ? 'Version history could not be loaded.' : 'Loading version history…'}</p>}
      <p className="wp-library-meta">Inspecting a version does not use or approve it.</p></details></section>
    {binding.purpose === 'reference' && <TextField label="Reference role" value={role} onChange={value => { selection.setRole(version.artifactId, value); setRole(value); }} isDisabled={locked || state.phase === 'used'} maxLength={200} />}
    <div className="wp-library-inspector-actions"><p>Use records this exact version and role in this conversation only.</p><Button variant="secondary" onPress={close}>Back to Library</Button><Button isDisabled={!exact || !client || !scope?.conversationId || state.phase === 'pending' || state.phase === 'used'} onPress={() => void use()}>{state.phase === 'unknown' ? 'Retry use' : 'Use this version'}</Button></div>
    {state.phase === 'unknown' && <p role="status">This use could not be confirmed. Retry checks the same exact version and role. Closing does not undo a completed use.</p>}
    {state.phase === 'rejected' && <p role="status">This version was not used. Your existing choices are unchanged.</p>}
    {state.phase === 'used' && <p role="status">This exact version is now used in this conversation.</p>}
  </div>;
}
function InspectionContent({ connection, scope, version }: { connection: BrowserClient; scope: ReadScope | null; version: Version }) {
  if (version.kind === 'video') return <section><PrivateClip connection={connection} scope={scope} version={version} /><p>{version.media.width} × {version.media.height} · {version.media.contentType} · {version.media.durationMs} ms · {version.media.hasAudio ? 'Audio present' : 'No audio'}</p><p className="wp-library-meta">Playing or downloading does not use this version or choose it for a Shot.</p></section>;
  if (version.kind === 'image') return <MediaInspection connection={connection} version={version} />;
  if (version.kind === 'reference') {
    const parsed = savedReferenceContentSchema.safeParse(version.content);
    return parsed.success ? <><p>{parsed.data.subject.description}</p><section className="wp-library-section"><h3>Continuity</h3>{parsed.data.subject.continuityNotes.map((note, index) => <p key={index}>{note}</p>)}</section><section className="wp-library-section"><h3>Images and coverage</h3><p>{parsed.data.references.length ? `${parsed.data.references.length} exact image associations supplied.` : 'No images are supplied.'}</p>{parsed.data.references.map(reference => <p key={reference.versionId}>{reference.view} · {reference.notes.join(' · ')}</p>)}<p className="wp-library-meta">Required views and inherited coverage are not declared. Reusing this text does not create a complete visual reference.</p></section></> : <p>Reference content is not supported for inspection.</p>;
  }
  if (version.kind === 'script') {
    const parsed = savedScriptContentSchema.safeParse(version.content);
    return parsed.success ? <>{parsed.data.scenes.map((scene, index) => <section key={index}><h3>{scene.heading.setting} · {scene.heading.location} · {scene.heading.time}</h3>{scene.script.map((entry, index) => <p key={index}>{'action' in entry ? entry.action : `${entry.dialogue.character}: ${entry.dialogue.text}`}</p>)}</section>)}</> : <p>Script content is not supported for inspection.</p>;
  }
  const parsed = savedStoryboardContentSchema.safeParse('content' in version ? version.content : null);
  return parsed.success ? <>{parsed.data.shots.map(shot => <section className="wp-library-section" key={shot.shotId}><h3>Shot {shot.order + 1}</h3><p>{shot.intent}</p>{shot.panels.map(panel => <p key={panel.panelId}>Panel {shot.order + 1}.{panel.order + 1} · {panel.description}</p>)}</section>)}<p className="wp-library-meta">Planning inspection does not approve a Panel image or choose a Shot video.</p></> : <p>Storyboard content is not supported for inspection.</p>;
}
function MediaInspection({ connection, version }: { connection: BrowserClient; version: Extract<Version, { kind: 'image' | 'video' }> }) {
  const preview = useOwnedImage(connection, version);
  return <section><div className="wp-library-preview">{preview.phase === 'ready' && preview.url ? <img src={preview.url} alt="Saved image" onError={preview.fail} /> : <p role="status">{preview.phase === 'loading' ? 'Loading private preview…' : 'Private preview could not be loaded.'}</p>}</div><p>{version.media.width} × {version.media.height} · {version.media.contentType}</p>{preview.phase !== 'loading' && preview.phase !== 'ready' && <Button variant="secondary" onPress={preview.retry}>Try again</Button>}<p className="wp-library-meta">Viewing an image does not approve it as a reference.</p></section>;
}
