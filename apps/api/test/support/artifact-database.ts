import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
/** Owned isolated test setup only; no route or production build input. */
export async function applyArtifactMigrations(setupUrl: string) {
  try {
    await exec('pnpm', ['db:migrate'], { env: { ...process.env, MIGRATION_DATABASE_URL: setupUrl }, timeout: 45000 });
  } catch {
    throw new Error('Application CLI migration failed');
  }
}
