import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isolatedPostgres } from './postgres.js';
import { command } from './process.js';

// Development-only fixture host, never imported by the production runtime.
const file = join(process.cwd(), 'outputs/local-database.env');
if (existsSync(file)) throw new Error('Refusing to overwrite outputs/local-database.env; stop its owning fixture first');
await mkdir('outputs', { recursive: true });
const stopped = new Promise<void>((resolve) => {
  process.on('SIGINT', resolve);
  process.on('SIGTERM', resolve);
});
const db = await isolatedPostgres();
const contents = `DATABASE_URL=${db.servingUrl}\nMIGRATION_DATABASE_URL=${db.setupUrl}\nDEFAULT_ASSISTANT_MODEL=unqualified/disabled\n`;
let written = false;
try {
  await writeFile(file, contents, { flag: 'wx', mode: 0o600 });
  written = true;
  await command('pnpm', ['db:prepare'], {
    cwd: process.cwd(),
    env: { ...process.env, WORKPRINT_ENV_FILE: file, MASTRA_TELEMETRY_DISABLED: '1', MASTRA_OFFLINE: '1' },
    log: join(process.cwd(), 'outputs/local-database.log'),
  });
  await db.grantServing();
  console.info('Isolated database ready. In another terminal:');
  console.info('WORKPRINT_ENV_FILE=outputs/local-database.env pnpm dev');
  console.info('Ctrl-C here stops only this fixture and removes its unchanged environment file. Data is ephemeral.');
  process.stdin.resume();
  await stopped;
} finally {
  process.stdin.pause();
  await db.close();
  if (written) {
    if (await readFile(file, 'utf8') === contents) await unlink(file);
    else console.error('Environment file changed; preserved it for its owner');
  }
}
