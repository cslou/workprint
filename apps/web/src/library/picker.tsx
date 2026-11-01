import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { OperationResponse } from '@workprint/contracts';
import { Button as AriaButton } from 'react-aria-components';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { createLibrarySelection, type LibrarySelection } from './selection.js';
import { Button, TextField } from '../ui/controls.js';
import { ViewerDialog } from '../ui/overlays.js';
import type { LibraryFilter } from './library.js';
import { bindingFor, libraryDisplay } from './content.js';
import { LibraryInspector } from './inspector.js';
import './picker.css';

export type LibraryDisplayFact = Readonly<{ name: string; description?: string; image?: Readonly<{ src: string; alt: string }> } & ({ category: string; tileLabel: string } | { category?: never; tileLabel?: string })>;
/** Labelled read-only display facts keyed by the exact latest version identity. Never product state. */
export type LibraryPrerequisites = Readonly<{ display?: Readonly<Record<string, LibraryDisplayFact>> }>;

const kindLabel = { script: 'Script', reference: 'Reference', storyboard: 'Storyboard', image: 'Image', video: 'Video' } as const;
const own = (record: Readonly<Record<string, LibraryDisplayFact>> | undefined, key: string) => record !== undefined && Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;

type Item = OperationResponse<'library'>['items'][number];
type Display = Readonly<{ name: string; sub: string; category?: string; image?: Readonly<{ src: string; alt: string }> }>;
const displayFor = (item: Item, facts: Readonly<Record<string, LibraryDisplayFact>> | undefined): Display => {
  const fact = own(facts, item.latestVersion.id);
  if (!fact) return facts ? { name: kindLabel[item.kind], sub: `Version ${item.latestVersion.revision}` } : libraryDisplay(item.latestVersion);
  return { name: fact.name, sub: fact.tileLabel ?? fact.description ?? kindLabel[item.kind], ...(fact.category === undefined ? {} : { category: fact.category }), ...(fact.image === undefined ? {} : { image: fact.image }) };
};

/** Local-only picker: categories, search and pressed state never carry a request. */
type PickerProps = { connection: BrowserClient; scope: ReadScope | null; library: OperationResponse<'library'>; prerequisites?: LibraryPrerequisites; pagination?: ReactNode; windowOffset?: number; selection?: LibrarySelection; filter?: LibraryFilter };
export function LibraryPicker(props: PickerProps) {
  return <ScopedPicker key={JSON.stringify([props.scope?.accountId, props.scope?.conversationId])} {...props} />;
}
function ScopedPicker({ connection, scope, library, prerequisites, pagination, windowOffset = 0, selection, filter }: PickerProps) {
  const facts = prerequisites?.display;
  const items = library.items.map((item) => ({ item, display: displayFor(item, facts) }));
  const categories = [...new Set(items.flatMap(({ display }) => display.category === undefined ? [] : [display.category]))];
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const latest = useRef(connection); latest.current = connection;
  const [ownedSelection] = useState(() => selection ? null : createLibrarySelection({ getClient: () => latest.current.kind === 'configured' ? latest.current.client : null, ...(scope?.conversationId ? { conversationId: scope.conversationId } : {}) }));
  const session = selection ?? ownedSelection!;
  const { choices: selectedItems, phase, feedback } = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const selected = selectedItems, busy = phase === 'pending', locked = busy || phase === 'unknown';
  useEffect(() => () => { if (selection) session.stop(); else session.dispose(); }, [session, selection]);
  const term = query.trim().toLowerCase();
  const visible = items.filter(({ display }) => (category === null || display.category === category) && (term === '' || display.name.toLowerCase().includes(term)));
  const toggle = (id: string, display?: Display) => {
    const index = items.findIndex(({ item }) => item.latestVersion.id === id), version = items[index]?.item.latestVersion;
    session.toggle(id, display && version ? { id, display, version, binding: facts ? { purpose: 'reference' } : bindingFor(version), order: windowOffset + index } : undefined);
  };
  return <div className="wp-picker">
    <div className="wp-picker-bar" role="group" aria-label="Categories">
      {!facts && filter && ([undefined, 'script', 'reference', 'storyboard', 'image', 'video'] as const).map(kind => <button key={kind ?? 'all'} type="button" className={`wp-picker-pill${filter.kind === kind ? ' on' : ''}`} aria-pressed={filter.kind === kind} onClick={() => filter.onKind(kind)}>{kind === undefined ? 'All' : { script: 'Scripts', reference: 'References', storyboard: 'Storyboards', image: 'Images', video: 'Videos' }[kind]}</button>)}
      {categories.length > 0 && [null, ...categories].map((value) => <button key={value ?? 'all'} type="button" className={`wp-picker-pill${category === value ? ' on' : ''}`} aria-pressed={category === value} onClick={() => { setCategory(value); }}>{value ?? 'All'}</button>)}
      <TextField label="Search Library" hideLabel variant="search" placeholder="Search" value={query} onChange={(value) => { setQuery(value); }} />
    </div>
    {!facts && <p className="wp-picker-search-note">Search only looks at loaded names.</p>}
    <div className="wp-picker-body">
      {visible.length === 0 ? <div className="wp-picker-empty" role="status"><b>No matching items</b><span>Search only looks at the names shown here.</span></div> : <div className="wp-picker-grid">{visible.map(({ item, display }) => {
        const id = item.latestVersion.id;
        const pressed = selected.some(item => item.id === id);
        const tile = <button type="button" data-page-id={item.id} disabled={locked || (!pressed && selected.length >= 1000)} className={`wp-picker-tile${pressed ? ' on' : ''}`} aria-pressed={pressed} onClick={() => toggle(id, display)}>
          <span className={`wp-picker-media${display.image === undefined ? ' empty' : ''}`}>{display.image !== undefined && <img src={display.image.src} alt={display.image.alt} />}<span className="wp-picker-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10" /></svg></span></span>
          <span className="wp-picker-label">{display.name}</span><span className="wp-picker-sub">{display.sub}</span>{!facts && <span className="wp-picker-select">Select</span>}
        </button>;
        return <div className="wp-picker-item" key={item.id}>{tile}{!facts && <ViewerDialog title={display.name} trigger={<AriaButton className="wp-picker-inspect" aria-label={`Inspect ${display.name}`}>Inspect</AriaButton>}>{close => <LibraryInspector connection={connection} scope={scope} version={item.latestVersion} selection={session} close={close} />}</ViewerDialog>}</div>;
      })}</div>}
      {pagination}
    </div>
    <div className="wp-picker-tray"><span className="wp-picker-count">{selectedItems.length === 0 ? 'Nothing selected yet' : `${selectedItems.length} selected`}</span>{selectedItems.map(({ id, display }) => <span key={id} className="wp-picker-chip">{display.name}<button type="button" disabled={locked} aria-label={`Remove ${display.name}`} onClick={() => toggle(id)}>×</button></span>)}<Button isDisabled={busy || selectedItems.length === 0 || connection.kind !== 'configured' || !scope?.conversationId} onPress={() => void session.attach()}>{phase === 'unknown' ? 'Retry attach' : selectedItems.length === 0 ? 'Attach' : `Attach (${selectedItems.length})`}</Button></div>
    {feedback && <p className="wp-picker-feedback" role="status">{feedback}</p>}
  </div>;
}
