import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createPageRead, type ApiClient, type PageReadState } from '@workprint/api-client';
import type { Version } from '@workprint/contracts';
import { useScopedRead, type ReadScope } from '../api/use-scoped-read.js';

const idle: PageReadState<Version> = { kind: 'idle', loadingMore: false, moreError: null, addedIds: [] };
const getIdle = () => idle;
const subscribeIdle = () => () => {};
const inactive = async () => {};
export function useExactVersion(client: ApiClient | null, scope: ReadScope | null, id: string) {
  const read = useMemo(() => client ? (signal: AbortSignal) => client.version({ params: { id }, query: {}, body: {} }, { signal }) : null, [client, id]);
  return useScopedRead(scope, read);
}
export function useVersionHistory(client: ApiClient | null, scope: ReadScope | null, artifactId: string, open: boolean) {
  const active = !!scope && open;
  const binding = useMemo(() => {
    if (!client || !active) return null;
    let newest = 0;
    const pages = createPageRead<Version>(async (cursor, signal) => {
      const result = await client.artifactVersions({ params: { id: artifactId }, query: cursor ? { cursor } : {}, body: {} }, { signal });
      if (!cursor && result.ok) newest = result.value.items[0]?.revision ?? 0;
      return result;
    });
    return { pages, newest: () => newest };
  }, [client, active, scope?.accountId, scope?.conversationId, artifactId]);
  const pages = binding?.pages;
  const snapshot = useSyncExternalStore(pages?.subscribe ?? subscribeIdle, pages?.getSnapshot ?? getIdle);
  useEffect(() => { if (!pages) return; void pages.start(); return pages.dispose; }, [pages]);
  return { ...snapshot, newestRevision: binding?.newest() ?? 0, retry: pages?.start ?? inactive, loadMore: pages?.loadMore ?? inactive, returnToFirstPage: pages?.returnToFirstPage ?? inactive };
}
