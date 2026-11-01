import { AuthClient } from '@supabase/auth-js';
import type { PublicAuthConfig } from './public-config.js';

/** Serialize explicit SDK session mutations, not network credential exchange or SDK refresh. */
export function authChange<T>(change: () => Promise<T>): Promise<T> {
  if (!navigator.locks) return Promise.reject(new Error('Browser account coordination unavailable'));
  return navigator.locks.request('workprint.auth-change', { signal: AbortSignal.timeout(10000) }, change);
}

/** Official SDK exchange only: no persistent storage, refresh, broadcast or application session store. */
export async function exchangePassword(config: Extract<PublicAuthConfig, { kind: 'configured' }>, email: string, password: string, signal: AbortSignal) {
  const exchange = new AuthClient({
    url: `${config.url}/auth/v1`, headers: { apikey: config.publishableKey }, storageKey: `workprint.exchange.${crypto.randomUUID()}`,
    persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, debug: false,
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(5000), ...(init?.signal ? [init.signal] : [])]) }),
  });
  try { return await exchange.signInWithPassword({ email, password }); }
  finally { await exchange.stopAutoRefresh(); }
}
