import { test } from '@playwright/test';
import { captureUploadPair } from '../upload-pair.js';

for (const width of [1440, 390]) {
  for (const kind of ['upload', 'confirm'] as const) test(`${kind} unavailable reference at ${width}`, async ({ page }, info) => {
    await captureUploadPair(page, info, width, kind);
  });
}
