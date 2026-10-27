import { PostgresStore } from '@mastra/pg';
import { mastra } from '../src/mastra/index.js';

const store = mastra.getStorage();
if (!(store instanceof PostgresStore)) throw new Error('Expected the actual native Postgres adapter');
const before = await store.pool.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
process.on('message', async (message: unknown) => {
  if (message !== 'recover') throw new Error('Unknown pool qualification message');
  const memory = await store.getStore('memory');
  if (!memory) throw new Error('Missing native memory store');
  const threads = await memory.listThreads({ page: 0, perPage: 10 });
  const after = await store.pool.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
  await store.close();
  process.send?.({ kind: 'recovered', pid: after.rows[0]?.pid, threads: threads.threads });
  process.disconnect();
});
process.send?.({ kind: 'ready', pid: before.rows[0]?.pid });
