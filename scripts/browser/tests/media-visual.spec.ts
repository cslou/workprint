import { test } from '@playwright/test';
import { captureMediaPair } from '../media-pair.js';

for (const width of [1440, 390, 820, 821]) test(`single-clip player main reference at ${width}`, async ({ page, context }, info) => {
  await captureMediaPair(page, context, info, width, 'player');
});
for (const width of [1440, 390]) for (const state of ['unavailable', 'unauthenticated', 'error'] as const) test(`${state} media reference at ${width}`, async ({ page, context }, info) => {
  await captureMediaPair(page, context, info, width, state);
});
