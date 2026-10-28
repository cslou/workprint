import { useMemo } from 'react';
import type { ClientError } from '@workprint/api-client';
import type { BrowserClient } from '../api/client.js';
import { useScopedRead, type ReadScope } from '../api/use-scoped-read.js';

export type WorkspaceFailure = 'unauthenticated' | 'unavailable' | 'error';
export function classifyWorkspaceFailure(code: ClientError['code']): WorkspaceFailure {
  return code === 'unauthenticated' ? 'unauthenticated' : code === 'not_implemented' ? 'unavailable' : 'error';
}

export function useWorkspace(connection: BrowserClient, scope: ReadScope | null) {
  const client = connection.kind === 'configured' ? connection.client : null;
  const id = scope?.conversationId;
  const read = useMemo(() => client && id ? (signal: AbortSignal) => client.workspace({ params: { id }, query: {}, body: {} }, { signal }) : null, [client, id]);
  const state = useScopedRead(scope, read);
  return { ...state, failure: state.kind === 'settled' && !state.result.ok ? classifyWorkspaceFailure(state.result.error.code) : null };
}
