import { test } from '@playwright/test';
import { capturePickerPair } from '../picker-pair.js';

for (const width of [1440, 390, 820, 821]) test(`populated picker reference at ${width}`, async ({ page }, info) => {
  await capturePickerPair(page, info, width, 'populated');
});
for (const width of [1440, 390]) {
  for (const state of ['filtered', 'selected', 'no-facts'] as const) test(`${state} picker reference at ${width}`, async ({ page }, info) => {
    await capturePickerPair(page, info, width, state);
  });
}
for (const state of ['search', 'no-match'] as const) test(`${state} picker reference at 1440`, async ({ page }, info) => {
  await capturePickerPair(page, info, 1440, state);
});
