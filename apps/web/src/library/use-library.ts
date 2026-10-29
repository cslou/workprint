import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { OperationRequest, OperationResponse } from '@workprint/contracts';
import { createPageRead, type ApiClient, type PageReadState } from '@workprint/api-client';
import type { ReadScope } from '../api/use-scoped-read.js';

type Item = OperationResponse<'library'>['items'][number];
const idle: PageReadState<Item> = { kind: 'idle', loadingMore: false, moreError: null, addedIds: [] };
const getIdle = () => idle;
const subscribeIdle = () => () => {};
const inactive = async () => {};
export function useLibrary(client: ApiClient | null, scope: ReadScope | null, query: OperationRequest<'library'>['query'] = {}) {
  const { kind, cursor: initialCursor, limit } = query;
  const active = !!scope;
  const pages = useMemo(() => client && active ? createPageRead<Item>((cursor, signal) => {
    const next = cursor ?? initialCursor;
    return client.library({ params: {}, query: { ...(kind === undefined ? {} : { kind }), ...(limit === undefined ? {} : { limit }), ...(next === undefined ? {} : { cursor: next }) }, body: {} }, { signal });
  }) : null, [client, active, scope?.accountId, scope?.conversationId, kind, initialCursor, limit]);
  const snapshot = useSyncExternalStore(pages?.subscribe ?? subscribeIdle, pages?.getSnapshot ?? getIdle);
  useEffect(() => { if (!pages) return; void pages.start(); return pages.dispose; }, [pages]);
  return { ...snapshot, retry: pages?.start ?? inactive, loadMore: pages?.loadMore ?? inactive };
}
