import { parsePublicApiOrigin } from '../api/public-config.js';

export type PublicAuthConfig = { kind: 'missing' | 'invalid' } | { kind: 'configured'; url: string; publishableKey: string };
/** Only public Auth configuration. JWT inspection distinguishes key roles, never verifies identity. */
export function parsePublicAuthConfig(url: unknown, key: unknown): PublicAuthConfig {
  const origin = parsePublicApiOrigin(url);
  if (origin.kind === 'missing' && (key === undefined || key === null || key === '')) return { kind: 'missing' };
  if (origin.kind !== 'configured' || typeof key !== 'string' || key.length > 8192 || key.trim() !== key) return { kind: 'invalid' };
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key);
  if (!publicKey && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) {
    try {
      const payload: unknown = JSON.parse(atob(key.split('.')[1]!.replaceAll('-', '+').replaceAll('_', '/')));
      publicKey = !!payload && typeof payload === 'object' && 'role' in payload && payload.role === 'anon';
    } catch { return { kind: 'invalid' }; }
  }
  return publicKey ? { kind: 'configured', url: origin.apiOrigin, publishableKey: key } : { kind: 'invalid' };
}
