import { useMemo } from 'react';
import type { ApiClient, ClientResult } from '@workprint/api-client';
import type { Version } from '@workprint/contracts';
import { useScopedRead, type ReadScope } from '../api/use-scoped-read.js';

export function useQuestionRead(client: ApiClient | null, scope: ReadScope | null, id: string) {
  const read = useMemo(() => client && scope?.conversationId ? (signal: AbortSignal) => client.question({ params: { id }, query: {}, body: {} }, { signal }) : null, [client, id, scope?.conversationId]);
  return useScopedRead(scope, read);
}
export function useProposalRead(client: ApiClient | null, scope: ReadScope | null, id: string | undefined) {
  const read = useMemo(() => client && id && scope?.conversationId ? (signal: AbortSignal) => client.proposal({ params: { id }, query: {}, body: {} }, { signal }) : null, [client, id, scope?.conversationId]);
  return useScopedRead(scope, read);
}
export function useInputVersions(client: ApiClient | null, scope: ReadScope | null, ids: readonly string[]) {
  const key = JSON.stringify(ids);
  const read = useMemo(() => client && scope?.conversationId && ids.length ? async (signal: AbortSignal): Promise<ClientResult<Version[]>> => {
    const results = await Promise.all((JSON.parse(key) as string[]).map((id) => client.version({ params: { id }, query: {}, body: {} }, { signal })));
    const failed = results.find((result) => !result.ok);
    if (failed && !failed.ok) return failed;
    return { ok: true, value: results.flatMap((result) => result.ok ? [result.value] : []) };
  } : null, [client, key, scope?.conversationId]);
  return useScopedRead(scope, read);
}
