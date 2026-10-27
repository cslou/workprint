import type { IMastraAuthProvider } from '@mastra/core/server';
import { createClient } from '@supabase/supabase-js';

export function supabaseAuth(config: { url: string; secret: string }): IMastraAuthProvider<{ id: string }> {
  const client = createClient(config.url, config.secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5000) }) },
  });
  return {
    name: 'workprint-supabase',
    public: ['/health'],
    async authenticateToken(token) {
      try {
        const result = await client.auth.getUser(token);
        return result.error || !result.data.user ? null : { id: result.data.user.id };
      } catch { return null; }
    },
    authorizeUser: () => true,
    mapUserToResourceId: (user) => user.id,
  };
}
