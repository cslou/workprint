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
  const pages = useMemo(() => client && active ? createPageRead<Version>((cursor, signal) => client.artifactVersions({ params: { id: artifactId }, query: cursor ? { cursor } : {}, body: {} }, { signal })) : null, [client, active, scope?.accountId, scope?.conversationId, artifactId]);
  const snapshot = useSyncExternalStore(pages?.subscribe ?? subscribeIdle, pages?.getSnapshot ?? getIdle);
  useEffect(() => { if (!pages) return; void pages.start(); return pages.dispose; }, [pages]);
  return { ...snapshot, retry: pages?.start ?? inactive, loadMore: pages?.loadMore ?? inactive };
}
