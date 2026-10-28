import { databaseUrl } from '../db/index.js';
import { loadSupabaseConfig } from './auth.js';

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
  let browserOrigin: string | undefined;
  if (env.WORKPRINT_BROWSER_ORIGIN !== undefined) {
    try {
      if (env.WORKPRINT_BROWSER_ORIGIN.trim() !== env.WORKPRINT_BROWSER_ORIGIN) invalid('WORKPRINT_BROWSER_ORIGIN');
      const url = new URL(env.WORKPRINT_BROWSER_ORIGIN);
      if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) invalid('WORKPRINT_BROWSER_ORIGIN');
      browserOrigin = url.origin;
    } catch { invalid('WORKPRINT_BROWSER_ORIGIN'); }
  }
  return { connectionString, model, port: Number(port), supabase: loadSupabaseConfig(env), browserOrigin };
}
