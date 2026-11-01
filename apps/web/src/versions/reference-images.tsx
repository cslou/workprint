import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { createPageRead } from '@workprint/api-client';
import type { Version } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import { useOwnedImage } from '../api/use-owned-image.js';
import { Button } from '../ui/controls.js';
import { ViewerDialog } from '../ui/overlays.js';
import type { ReferenceDraft } from './reference-target.js';

type Props = { connection: BrowserClient; draft: ReferenceDraft; locked: boolean; onChange(draft: ReferenceDraft): void };
export function ReferenceImages({ connection, draft, locked, onChange }: Props) {
  return <section className="wp-reference-images"><h3>Associated images</h3>{draft.references.map(reference => <div className="wp-reference-image-row" key={reference.versionId}><span>{reference.view} · Exact image association</span><Button variant="secondary" isDisabled={locked} aria-label={`Remove ${reference.view}`} onPress={() => onChange({ ...draft, references: draft.references.filter(item => item.versionId !== reference.versionId) })}>Remove</Button></div>)}
    <ViewerDialog title="Add image from Library" trigger={<AriaButton className="wp-button" isDisabled={locked || draft.references.length >= 100}>Add image from Library</AriaButton>}>{close => <ImageChoices connection={connection} chosen={draft.references.map(item => item.versionId)} onChoose={version => { onChange({ ...draft, references: [...draft.references, { versionId: version.id, view: 'Unspecified view', notes: [] }] }); close(); }} />}</ViewerDialog>
    <p className="wp-version-feedback">Only exact inspected images are associated. Required views and inherited coverage are not declared.</p></section>;
}
function ImageChoices({ connection, chosen, onChoose }: { connection: BrowserClient; chosen: string[]; onChoose(version: Version): void }) {
  const client = connection.kind === 'configured' ? connection.client : null;
  const pages = useMemo(() => client ? createPageRead<import('@workprint/contracts').OperationResponse<'library'>['items'][number]>((cursor, signal) => client.library({ params: {}, query: { kind: 'image', ...(cursor ? { cursor } : {}) }, body: {} }, { signal })) : null, [client]);
  const [selected, setSelected] = useState<Version | null>(null);
  const history = useSyncExternalStore(pages?.subscribe ?? (() => () => {}), pages?.getSnapshot ?? (() => null));
  useEffect(() => { if (pages) { void pages.start(); return pages.dispose; } }, [pages]);
  if (selected) return <InspectImage connection={connection} version={selected} onChoose={() => onChoose(selected)} back={() => setSelected(null)} />;
  return <div>{history?.kind === 'settled' && history.result.ok ? <>{history.result.value.items.map(item => <div className="wp-reference-image-row" key={item.id}><span>Image · Version {item.latestVersion.revision}</span><Button variant="secondary" isDisabled={chosen.includes(item.latestVersion.id)} onPress={() => setSelected(item.latestVersion)}>Inspect image</Button></div>)}{history.result.value.items.length === 0 && <p>No images saved.</p>}{history.omittedItems ? <p>Showing loaded images {history.omittedItems + 1}–{history.omittedItems + history.result.value.items.length}. <Button variant="quiet" onPress={() => void pages?.returnToFirstPage()}>Back to first page</Button></p> : null}{history.result.value.nextCursor && <Button variant="quiet" isDisabled={history.loadingMore} onPress={() => void pages?.loadMore()}>Load more</Button>}{history.moreError && <p role="status">More images could not be loaded. Existing choices are unchanged.</p>}</> : <p role="status">{history?.kind === 'settled' ? 'Images could not be loaded. Existing choices are unchanged.' : 'Loading saved images…'}</p>}</div>;
}
function InspectImage({ connection, version, onChoose, back }: { connection: BrowserClient; version: Version; onChoose(): void; back(): void }) {
  const preview = useOwnedImage(connection, version);
  return <div><p>Image · Version {version.revision}</p>{preview.phase === 'ready' && preview.url ? <img className="wp-reference-image-preview" src={preview.url} alt="Exact saved image" onError={preview.fail} /> : <p role="status">{preview.phase === 'loading' ? 'Loading this exact image…' : 'Image could not be loaded.'}</p>}<p>Associating this image does not declare complete reference coverage.</p><div className="wp-version-edit-actions"><Button variant="secondary" onPress={back}>Back to images</Button><Button isDisabled={preview.phase !== 'ready'} onPress={onChoose}>Add this exact image</Button></div></div>;
}
