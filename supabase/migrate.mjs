import { execFile } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const cli = fileURLToPath(new URL('../node_modules/.bin/supabase', import.meta.url));
// Development-only: these are the existing isolated Postgres fixture's roles/database.
// No stack lifecycle, linked project or implicitly selected database is supported.
try {
  const value = process.env.MIGRATION_DATABASE_URL;
  const url = new URL(value ?? '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' ||
      url.username !== 'wp_setup' || !url.password || url.pathname !== '/workprint' || url.search || url.hash) {
    throw new Error('Invalid isolated setup target');
  }
  // Only the loopback ephemeral fixture has no TLS listener. CLI 2.84.2 reads PGSSLMODE.
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, SUPABASE_TELEMETRY_DISABLED: 'true', PGSSLMODE: 'disable' };
  const { stdout } = await exec(cli, ['--version'], { env, timeout: 5000 });
  if (stdout.trim() !== '2.84.2') throw new Error('Unexpected CLI version');
  await exec(cli, ['db', 'push', '--db-url', url.href, '--yes', '--workdir', root], { env, timeout: 30000, maxBuffer: 1024 * 1024 });
  console.info('Application migrations applied through pinned Supabase CLI');
} catch {
  // CLI errors and command arguments may include the setup password/URL.
  console.error('Application migration failed; check the isolated setup target, CLI version and privileges');
  process.exitCode = 1;
}
