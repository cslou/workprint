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
  return { connectionString, model, port: Number(port) };
}
