import type { Locator } from '@playwright/test';

/** Exercise the real control, not a dispatched click or component callback. */
export const activate = (control: Locator, keyboard: boolean) => keyboard ? control.press('Enter') : control.click();
