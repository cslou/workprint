import { test } from '@playwright/test';
import { captureStoryboardPair } from '../storyboard-pair.js';

for (const width of [1440, 390, 820, 821]) for (const view of ['storyboard', 'board', 'panel', 'videos'] as const) test(`${view} main reference at ${width}`, async ({ page, context }, info) => {
  await captureStoryboardPair(page, context, info, width, view);
});
