import { Mastra } from '@mastra/core';
import type { MastraLanguageModel } from '@mastra/core/agent';
import { PostgresStore } from '@mastra/pg';
import { Pool } from 'pg';
import { createAssistant } from '../agent/index.js';
import { loadServerConfig } from './config.js';
import { conversationAdmission } from './admission.js';
import { supabaseAuth } from './auth.js';

export async function createBackend(env: NodeJS.ProcessEnv, model?: MastraLanguageModel) {
  const config = loadServerConfig(env);
  const pool = new Pool({ connectionString: config.connectionString, max: 4, connectionTimeoutMillis: 5000, idleTimeoutMillis: 5000, statement_timeout: 10000 });
  pool.on('error', (error) => {
    const code = 'code' in error && typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : 'connection_error';
    console.error('Native storage idle connection lost', { code });
  });
  try {
    const result = await pool.query<{ privileged: boolean }>(`SELECT
      has_database_privilege(current_database(), 'CREATE') OR
      has_schema_privilege('mastra', 'CREATE') OR
      has_schema_privilege('public', 'CREATE') OR
      (SELECT rolsuper OR rolcreaterole OR rolcreatedb FROM pg_roles WHERE rolname = current_user)
      AS privileged`);
    if (result.rows[0]?.privileged !== false) throw new Error('Privileged serving connection');
  } catch {
    await pool.end();
    throw new Error('Serving storage unavailable or privileged; prepare storage separately and use restricted DATABASE_URL');
  }
  const storage = new PostgresStore({ id: 'workprint-native', schemaName: 'mastra', disableInit: true, pool });
  const assistant = createAssistant(storage, model);
  const auth = config.auth ? supabaseAuth(config.auth) : undefined;
  return new Mastra({
    storage, agents: { assistant },
    ...(auth ? { studio: { auth } } : {}),
    server: {
      host: '127.0.0.1', port: config.port,
      build: { swaggerUI: false, openAPIDocs: false },
      ...(auth ? { auth } : {}),
      middleware: [conversationAdmission(assistant, auth, !!model)],
      onError: (error, context) => {
        console.error('Native integration request failed', { kind: error instanceof TypeError ? 'type_error' : 'integration_error' });
        return context.json({ error: { code: 'integration_failure', message: 'Native integration request failed' } }, 500);
      },
    },
  });
}
