import { databaseUrl } from '../db/index.js';

type Environment = Readonly<Record<string, string | undefined>>;

function invalid(name: string): never {
  throw new Error(`Invalid or missing server configuration: ${name}`);
}

/** Syntax/admission only. No model resolution, SDK, credentials or provider calls. */
export function loadServerConfig(env: Environment) {
  const connectionString = databaseUrl(env.DATABASE_URL, 'DATABASE_URL');
  const model = env.DEFAULT_ASSISTANT_MODEL;
  if (!model || !/^[a-z][a-z0-9-]*\/[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(model) ||
    /^(test|mock|fake)\//i.test(model)) invalid('DEFAULT_ASSISTANT_MODEL');
  const port = env.PORT ?? '4111';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) invalid('PORT');
  if (env.MIGRATION_DATABASE_URL) invalid('MIGRATION_DATABASE_URL must not enter the serving process');
  if (Object.keys(env).some((key) => key.startsWith('VITE_'))) invalid('VITE_* is not server configuration');
  let auth: { url: string; secret: string } | undefined;
  if (env.SUPABASE_URL) {
    try {
      const url = new URL(env.SUPABASE_URL);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
        (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) invalid('SUPABASE_URL');
    } catch { invalid('SUPABASE_URL'); }
    if (!env.SUPABASE_SECRET_KEY) invalid('SUPABASE_SECRET_KEY');
    auth = { url: env.SUPABASE_URL, secret: env.SUPABASE_SECRET_KEY };
  }
  return { connectionString, model, port: Number(port), auth };
}
