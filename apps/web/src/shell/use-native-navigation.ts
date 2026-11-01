import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ClientError, NativeThread, NativeThreads, NativeMessages } from '@workprint/api-client';
import type { BrowserClient } from '../api/client.js';

type Message = NativeMessages['messages'][number];
export type HistoryState = { id: string; thread: NativeThread | null; messages: Message[]; kind: 'loading' | 'ready' | 'error' | 'unavailable'; page: number; hasMore: boolean; earlier: 'idle' | 'loading' | 'error' };
export type RecentsState = { value: NativeThreads | null; pending: boolean; failed: boolean; target: number };
const failureKind = (error: ClientError) => error.code === 'not_found' ? 'unavailable' as const : 'error' as const;
const loading = (id: string, thread: NativeThread | null = null): HistoryState => ({ id, thread, messages: [], kind: 'loading', page: 0, hasMore: false, earlier: 'idle' });
const validId = (id: string | null) => id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;

/** Ephemeral presentation only. Native storage is the sole conversation/history authority. */
/** `restore` is the routed conversation, already cleared by the entry owner after an account change. */
export function useNativeNavigation(connection: BrowserClient, accountId: string | null, signIn: () => void, restore: string | null = null) {
  // A URL-restored conversation starts as loading, so the opening welcome never flashes first.
  // One captured restore id drives both the initial loading state and the restore effect.
  const [restoreId] = useState(() => connection.kind === 'configured' && accountId ? validId(restore) : null);
  const [history, setHistory] = useState<HistoryState | null>(() => restoreId ? loading(restoreId) : null);
  const [recents, setRecents] = useState<RecentsState>({ value: null, pending: false, failed: false, target: 0 });
  const [quick, setQuick] = useState<NativeThread[] | null>(null);
  const [dialog, setDialog] = useState<'recents' | null>(null);
  // Counts New video activations so the shell can focus the opening composer it lands on.
  const [started, setStarted] = useState(0);
  const active = useRef(true), selection = useRef(0), listing = useRef(0);
  const requests = useRef(new Set<AbortController>());
  const client = connection.kind === 'configured' ? connection.client.native : null;
  const controller = () => { const value = new AbortController(); requests.current.add(value); return value; };
  const current = (revision: number) => active.current && selection.current === revision;
  useLayoutEffect(() => { active.current = true; return () => { active.current = false; selection.current++; for (const value of requests.current) value.abort(); requests.current.clear(); }; }, []);
  const remember = (id: string) => { const url = new URL(location.href); url.searchParams.set('conversation', id); window.history.replaceState(null, '', url); };
  const open = async (id: string, candidate: NativeThread | null = null) => {
    if (!client || !accountId) { signIn(); return; }
    const revision = ++selection.current, request = controller();
    setDialog(null); setHistory(loading(id, candidate)); remember(id);
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
    if (restoreId) void open(restoreId);
    // Account composition re-keys this owner; restore is a read, never a create.
  }, []);
  useEffect(() => {
    // One initial Recents read per owned workspace entry; scope changes re-key this owner.
    if (client && accountId) void list();
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
  const openRecents = () => { if (!client || !accountId) { signIn(); return; } setDialog('recents'); void list(); };
  // New video is client-only: it returns to the opening composer without writing anything.
  // The native thread (whose id is the video id) is created by the first accepted send.
  const startNew = () => {
    if (!client || !accountId) { signIn(); return; }
    selection.current++; setStarted(value => value + 1);
    setDialog(null); setHistory(null);
    const url = new URL(location.href); url.searchParams.delete('conversation'); window.history.replaceState(null, '', url);
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
  return { history, recents, quick, dialog, started, startNew, list, open, earlier, openRecents, dismiss() { setDialog(null); } };
}
export type NativeNavigationState = ReturnType<typeof useNativeNavigation>;
