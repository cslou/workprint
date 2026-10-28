import { useEffect, useRef, useState } from 'react';
import type { OperationResponse } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { useVersion } from '../api/use-version.js';
import { Button, TextField } from '../ui/controls.js';
import './picker.css';

export type LibraryDisplayFact = Readonly<{ name: string; description?: string; image?: Readonly<{ src: string; alt: string }> } & ({ category: string; tileLabel: string } | { category?: never; tileLabel?: string })>;
/** Labelled read-only display facts keyed by the exact latest version identity. Never product state. */
export type LibraryPrerequisites = Readonly<{ display?: Readonly<Record<string, LibraryDisplayFact>> }>;

const kindLabel = { script: 'Script', reference: 'Reference', storyboard: 'Storyboard', image: 'Image', video: 'Video' } as const;
const attachFeedback = {
  unavailable: 'Attaching from your Library is not available yet. Nothing was attached.',
  unauthenticated: 'Sign-in required to attach from your Library. Nothing was attached.',
  error: 'Nothing was attached. Your existing attachments are unchanged.',
} as const;
const attachFailure = (code: string) => code === 'unauthenticated' ? attachFeedback.unauthenticated : code === 'not_implemented' ? attachFeedback.unavailable : attachFeedback.error;
const own = (record: Readonly<Record<string, LibraryDisplayFact>> | undefined, key: string) => record !== undefined && Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;

type Item = OperationResponse<'library'>['items'][number];
type Display = Readonly<{ name: string; sub: string; category?: string; image?: Readonly<{ src: string; alt: string }> }>;
const displayFor = (item: Item, facts: Readonly<Record<string, LibraryDisplayFact>> | undefined): Display => {
  const fact = own(facts, item.latestVersion.id);
  if (!fact) return { name: kindLabel[item.kind], sub: `Version ${item.latestVersion.revision}` };
  return { name: fact.name, sub: fact.tileLabel ?? fact.description ?? kindLabel[item.kind], ...(fact.category === undefined ? {} : { category: fact.category }), ...(fact.image === undefined ? {} : { image: fact.image }) };
};

/** Local-only picker: categories, search and pressed state never carry a request. */
type PickerProps = { connection: BrowserClient; scope: ReadScope | null; library: OperationResponse<'library'>; prerequisites?: LibraryPrerequisites };
export function LibraryPicker(props: PickerProps) {
  return <ScopedPicker key={JSON.stringify([props.scope?.accountId, props.scope?.conversationId])} {...props} />;
}
function ScopedPicker({ connection, scope, library, prerequisites }: PickerProps) {
  const facts = prerequisites?.display;
  const items = library.items.map((item) => ({ item, display: displayFor(item, facts) }));
  const categories = [...new Set(items.flatMap(({ display }) => display.category === undefined ? [] : [display.category]))];
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; abort.current?.abort(); }; }, []);
  const selectedItems = items.filter(({ item }) => selected.includes(item.latestVersion.id));
  const term = query.trim().toLowerCase();
  const visible = items.filter(({ display }) => (category === null || display.category === category) && (term === '' || display.name.toLowerCase().includes(term)));
  const toggle = (id: string) => {
    if (pending.current) return;
    setFeedback(null);
    setSelected((previous) => previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]);
  };
  const attach = async () => {
    if (pending.current || selectedItems.length === 0 || connection.kind !== 'configured' || !scope?.conversationId) return;
    pending.current = true;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true); setFeedback(null);
    let attached = 0;
    let failure: string | null = null;
    try {
      for (const { item } of selectedItems) {
        const result = await useVersion(connection.client, { conversationId: scope.conversationId, versionId: item.latestVersion.id, binding: { purpose: 'reference' } }, { signal: controller.signal });
        if (!active.current || controller.signal.aborted) return;
        if (!result.ok) { failure = attachFailure(result.error.code); break; }
        attached += 1;
      }
      const sent = selectedItems.slice(0, attached).map(({ item }) => item.latestVersion.id);
      setSelected((previous) => previous.filter((id) => !sent.includes(id)));
      if (failure === null) return;
      if (attached > 0) {
        setFeedback(`Attached ${attached} of ${selectedItems.length}. The rest were not attached.`);
        return;
      }
      setFeedback(failure);
    } finally { pending.current = false; if (active.current) setBusy(false); }
  };
  return <div className="wp-picker">
    <div className="wp-picker-bar" role="group" aria-label="Categories">
      {categories.length > 0 && [null, ...categories].map((value) => <button key={value ?? 'all'} type="button" className={`wp-picker-pill${category === value ? ' on' : ''}`} aria-pressed={category === value} onClick={() => { setCategory(value); setFeedback(null); }}>{value ?? 'All'}</button>)}
      <TextField label="Search Library" hideLabel variant="search" placeholder="Search" value={query} onChange={(value) => { setQuery(value); setFeedback(null); }} />
    </div>
    <div className="wp-picker-body">
      {visible.length === 0 ? <div className="wp-picker-empty" role="status"><b>No matching items</b><span>Search only looks at the names shown here.</span></div> : <div className="wp-picker-grid">{visible.map(({ item, display }) => {
        const id = item.latestVersion.id;
        const pressed = selected.includes(id);
        return <button key={item.id} type="button" disabled={busy} className={`wp-picker-tile${pressed ? ' on' : ''}`} aria-pressed={pressed} onClick={() => toggle(id)}>
          <span className={`wp-picker-media${display.image === undefined ? ' empty' : ''}`}>{display.image !== undefined && <img src={display.image.src} alt={display.image.alt} />}<span className="wp-picker-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10" /></svg></span></span>
          <span className="wp-picker-label">{display.name}</span><span className="wp-picker-sub">{display.sub}</span>
        </button>;
      })}</div>}
    </div>
    <div className="wp-picker-tray"><span className="wp-picker-count">{selectedItems.length === 0 ? 'Nothing selected yet' : `${selectedItems.length} selected`}</span>{selectedItems.map(({ item, display }) => <span key={item.id} className="wp-picker-chip">{display.name}<button type="button" disabled={busy} aria-label={`Remove ${display.name}`} onClick={() => toggle(item.latestVersion.id)}>×</button></span>)}<Button isDisabled={busy || selectedItems.length === 0 || connection.kind !== 'configured' || !scope?.conversationId} onPress={() => void attach()}>{selectedItems.length === 0 ? 'Attach' : `Attach (${selectedItems.length})`}</Button></div>
    {feedback && <p className="wp-picker-feedback" role="status">{feedback}</p>}
  </div>;
}
