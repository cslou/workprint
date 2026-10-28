import { defineConfig } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../../', import.meta.url));
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }).trim().length > 0;

export default defineConfig({
  metadata: { revision, workingTreeDirty: dirty, platform: process.platform, architecture: process.arch },
  testDir: './tests',
  outputDir: resolve(process.env.WORKPRINT_BROWSER_OUTPUT ?? `outputs/verification/sprint-003/${revision}${dirty ? '-working' : ''}`),
  timeout: 30_000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4179', browserName: 'chromium', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block', headless: true },
  webServer: { cwd: fileURLToPath(new URL('../../', import.meta.url)), command: 'pnpm --filter @workprint/web exec vite --config vite.test.config.ts', url: 'http://127.0.0.1:4179', reuseExistingServer: false, timeout: 30_000, gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 } },
});
