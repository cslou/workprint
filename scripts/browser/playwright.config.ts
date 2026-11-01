import { previewOrigin } from './origin.js';
import { defineConfig } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../../', import.meta.url));
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }).trim().length > 0;

export default defineConfig({
  metadata: { revision, workingTreeDirty: dirty, platform: process.platform, architecture: process.arch },
  testDir: './e2e',
  outputDir: resolve(process.env.WORKPRINT_BROWSER_OUTPUT ?? `outputs/verification/e2e/${revision}${dirty ? '-working' : ''}`),
  // Every journey shares one worker-scoped backend (see e2e/fixtures.ts).
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  // Journeys sign in with synthetic credentials; keep them out of traces, screenshots and video.
  use: { baseURL: previewOrigin, browserName: 'chromium', viewport: { width: 1440, height: 900 }, locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce', serviceWorkers: 'block', headless: true, trace: 'off', screenshot: 'off', video: 'off' },
});
