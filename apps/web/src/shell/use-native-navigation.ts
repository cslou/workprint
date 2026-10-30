import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ClientError, NativeThread, NativeThreads, NativeMessages } from '@workprint/api-client';
import type { BrowserClient } from '../api/client.js';

type Message = NativeMessages['messages'][number];
export type HistoryState = { id: string; thread: NativeThread | null; messages: Message[]; kind: 'loading' | 'ready' | 'error' | 'unavailable'; page: number; hasMore: boolean; earlier: 'idle' | 'loading' | 'error' };
export type RecentsState = { value: NativeThreads | null; pending: boolean; failed: boolean; target: number };
export type CreateState = 'idle' | 'pending' | 'rejected' | 'unknown';
const failureKind = (error: ClientError) => error.code === 'not_found' ? 'unavailable' as const : 'error' as const;

/** Ephemeral presentation only. Native storage is the sole conversation/history authority. */
export function useNativeNavigation(connection: BrowserClient, accountId: string | null, signIn: () => void) {
  const [history, setHistory] = useState<HistoryState | null>(null);
  const [recents, setRecents] = useState<RecentsState>({ value: null, pending: false, failed: false, target: 0 });
  const [quick, setQuick] = useState<NativeThread[] | null>(null);
  const [createState, setCreateState] = useState<CreateState>('idle');
  const [dialog, setDialog] = useState<'recents' | 'new' | null>(null);
  const active = useRef(true), selection = useRef(0), intent = useRef(0), listing = useRef(0), creating = useRef(false);
  const requests = useRef(new Set<AbortController>());
  const client = connection.kind === 'configured' ? connection.client.native : null;
  const controller = () => { const value = new AbortController(); requests.current.add(value); return value; };
  const current = (revision: number) => active.current && selection.current === revision;
  useLayoutEffect(() => { active.current = true; return () => { active.current = false; selection.current++; for (const value of requests.current) value.abort(); requests.current.clear(); }; }, []);
  const remember = (id: string) => { const url = new URL(location.href); url.searchParams.set('conversation', id); window.history.replaceState(null, '', url); };
  const open = async (id: string, candidate: NativeThread | null = null) => {
    if (!client || !accountId) { signIn(); return; }
    intent.current++;
    const revision = ++selection.current, request = controller();
    setDialog(null); setHistory({ id, thread: candidate, messages: [], kind: 'loading', page: 0, hasMore: false, earlier: 'idle' }); remember(id);
    try {
      const [thread, messages] = await Promise.all([client.loadConversation({ id, resourceId: accountId }, { signal: request.signal }), client.loadMessages({ id, resourceId: accountId, page: 0, perPage: 20 }, { signal: request.signal })]);
      if (!current(revision)) return;
      if (!thread.ok || !messages.ok) {
        const error = !thread.ok ? thread.error : !messages.ok ? messages.error : null;
        const kind = error ? failureKind(error) : 'error';
        setHistory({ id, thread: kind === 'unavailable' ? null : thread.ok ? thread.value : candidate, messages: [], kind, page: 0, hasMore: false, earlier: 'idle' }); return;
      }
      setHistory({ id, thread: thread.value, messages: [...messages.value.messages].reverse(), kind: 'ready', page: 0, hasMore: messages.value.hasMore, earlier: 'idle' });
    } finally { requests.current.delete(request); }
  };
  useEffect(() => {
    const id = new URL(location.href).searchParams.get('conversation');
    if (id && accountId && /^[0-9a-f-]{36}$/i.test(id)) void open(id);
    // Account composition re-keys this owner; restore is a read, never a create.
  }, []);
  const list = async (page = 0) => {
    if (!client || !accountId) { signIn(); return; }
    const revision = ++listing.current, request = controller();
    setRecents(previous => ({ ...previous, pending: true, failed: false, target: page }));
    try {
      const result = await client.listConversations({ resourceId: accountId, page, perPage: 6 }, { signal: request.signal });
      if (!active.current || listing.current !== revision) return;
      if (result.ok && page === 0) setQuick(result.value.threads);
      setRecents(previous => result.ok ? { value: result.value, pending: false, failed: false, target: page } : { ...previous, pending: false, failed: true, target: page });
    } finally { requests.current.delete(request); }
  };
  const openRecents = () => { if (!client || !accountId) { signIn(); return; } intent.current++; setDialog('recents'); void list(); };
  const create = async () => {
    if (!client || !accountId) { signIn(); return; }
    if (creating.current) return;
    creating.current = true; const revision = selection.current, presentation = ++intent.current, request = controller(); setCreateState('pending'); setDialog('new');
    try {
      const result = await client.createConversation({ resourceId: accountId }, { signal: request.signal });
      if (!current(revision) || intent.current !== presentation) return;
      if (!result.ok) { setCreateState(['invalid_input', 'unauthenticated', 'forbidden', 'not_found', 'not_implemented'].includes(result.error.code) ? 'rejected' : 'unknown'); return; }
      selection.current++; setCreateState('idle'); setDialog(null); remember(result.value.id);
      setHistory({ id: result.value.id, thread: result.value, messages: [], kind: 'ready', page: 0, hasMore: false, earlier: 'idle' });
      setQuick(previous => [result.value, ...(previous ?? []).filter(thread => thread.id !== result.value.id)].slice(0, 6));
      listing.current++; setRecents({ value: null, pending: false, failed: false, target: 0 });
    } finally { creating.current = false; requests.current.delete(request); if (active.current) setCreateState(value => value === 'pending' ? 'idle' : value); }
  };
  const earlier = async () => {
    if (!client || !accountId || !history || history.kind !== 'ready' || history.earlier === 'loading' || !history.hasMore) return;
    const revision = selection.current, id = history.id, nextPage = history.page + 1, request = controller();
    setHistory(previous => previous && ({ ...previous, earlier: 'loading' }));
    try {
      const result = await client.loadMessages({ id, resourceId: accountId, page: nextPage, perPage: 20 }, { signal: request.signal });
      if (!current(revision)) return;
      setHistory(previous => {
        if (!previous || previous.id !== id) return previous;
        if (!result.ok) return { ...previous, earlier: 'error' };
        const ids = new Set(previous.messages.map(message => message.id));
        return { ...previous, messages: [...result.value.messages].reverse().filter(message => !ids.has(message.id)).concat(previous.messages), page: nextPage, hasMore: result.value.hasMore, earlier: 'idle' };
      });
    } finally { requests.current.delete(request); }
  };
  return { history, recents, quick, createState, dialog, create, list, open, earlier, openRecents, dismiss() { if (dialog === 'new') intent.current++; setDialog(null); } };
}
export type NativeNavigationState = ReturnType<typeof useNativeNavigation>;
