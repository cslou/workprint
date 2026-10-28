import type { Page } from '@playwright/test';

/** Apply identical focus/scroll/font/layout settlement before either side is measured. */
export async function settleCapture(page: Page) {
  await page.mouse.move(1, 1);
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode()));
    scrollTo(0, 0);
    // Native disclosure/modal effects, font-driven pill widths and scroll locking settle
    // across frames. Require the full layout signature to be unchanged for four frames.
    const signature = () => [...document.querySelectorAll('body *')].map((node) => { const box = node.getBoundingClientRect(); return `${box.x},${box.y},${box.width},${box.height}`; }).join('|');
    let previous = ''; let stableFrames = 0;
    for (let frame = 0; frame < 120 && stableFrames < 4; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const current = signature();
      stableFrames = current === previous ? stableFrames + 1 : 0;
      previous = current;
    }
  });
}
