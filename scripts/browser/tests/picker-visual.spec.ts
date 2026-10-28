import { test } from '@playwright/test';
import { capturePickerPair, type PickerState } from '../picker-pair.js';

for (const width of [1440, 390, 820, 821]) test(`populated picker reference at ${width}`, async ({ page }, info) => {
  await capturePickerPair(page, info, width, 'populated');
});
