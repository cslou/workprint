import { createApiClient } from '@workprint/api-client';
import type { ApiClient } from '@workprint/api-client';
import { parsePublicApiOrigin } from './public-config.js';

export type BrowserClient = { kind: 'missing' | 'invalid' } | { kind: 'configured'; client: ApiClient };
export function createBrowserClient(apiOrigin: unknown, getAccessToken: () => Promise<string | null>, timeoutMs?: number): BrowserClient {
  const config = parsePublicApiOrigin(apiOrigin);
  if (config.kind !== 'configured') return config;
  return { kind: 'configured', client: createApiClient({ baseUrl: config.apiOrigin, getAccessToken, ...(timeoutMs === undefined ? {} : { timeoutMs }) }) };
}
