import { test } from '@playwright/test';
import { captureStoryboardPair } from '../storyboard-pair.js';

// Representative edit states use the approved desktop/narrow rule, not the main-page breakpoint matrix.
for (const width of [1440, 390]) for (const edit of ['shot', 'panel'] as const) test(`${edit} edit representative reference at ${width}`, async ({ page, context }, info) => {
  await captureStoryboardPair(page, context, info, width, 'board', edit);
});
