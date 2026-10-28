import { test } from '@playwright/test';
import { captureExportPair } from '../export-pair.js';

for (const view of ['entry', 'export', 'history', 'detail', 'failed', 'download', 'loading', 'history-unavailable', 'detail-unavailable'] as const) for (const width of view === 'entry' ? [1440, 390, 820, 821] : [1440, 390]) test(`Export ${view} reference at ${width}`, async ({ page, context }, info) => {
  await captureExportPair(page, context, info, width, view);
});
