type SupabaseConfig = Readonly<{ url: string; key: string }>;
type Verification = { kind: 'verified'; accountId: string } | { kind: 'unauthorized' } | { kind: 'unavailable' };

/** Online Supabase verification; never trust decoded caller claims or metadata. */
export async function verifyAccount(authorization: string | undefined, config: SupabaseConfig): Promise<Verification> {
  if (!authorization || authorization.length > 8192 || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i.test(authorization)) {
    return { kind: 'unauthorized' };
  }
  try {
    const response = await fetch(`${config.url}/auth/v1/user`, {
      headers: { apikey: config.key, Authorization: authorization },
      signal: AbortSignal.timeout(2000), redirect: 'error',
    });
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      return { kind: 'unauthorized' };
    }
    if (!response.ok) {
      await response.body?.cancel();
      return { kind: 'unavailable' };
    }
    const user: unknown = await response.json();
    if (!user || typeof user !== 'object' || !('id' in user) || typeof user.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)) return { kind: 'unavailable' };
    return { kind: 'verified', accountId: user.id };
  } catch {
    // Transport, deadline, redirect and invalid upstream payloads are not authentication successes.
    return { kind: 'unavailable' };
  }
}

export function loadSupabaseConfig(env: Readonly<Record<string, string | undefined>>): SupabaseConfig {
  try {
    const url = new URL(env.SUPABASE_URL ?? '');
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)))) throw new Error();
    const key = env.SUPABASE_PUBLISHABLE_KEY;
    if (!key || key.length > 8192 || /\s/.test(key)) throw new Error();
    return { url: url.origin, key };
  } catch {
    throw new Error('Invalid or missing server configuration: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY');
  }
}
