import type { Page } from '@playwright/test';

/** Apply identical focus/scroll/font/layout settlement before either side is measured. */
export async function settleCapture(page: Page) {
  await page.mouse.move(1, 1);
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode()));
    scrollTo(0, 0);
    // Native disclosure/modal effects and scroll locking settle across render frames.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}
