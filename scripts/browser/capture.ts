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
    // Reverse overflow at a fractional origin can reuse stale rounded-image edge rasters.
    // Repaint their backings once; restore authored styles before measuring or capturing.
    const images = new Set<HTMLImageElement>();
    for (const scroller of document.querySelectorAll<HTMLElement>('body *')) {
      const style = getComputedStyle(scroller);
      const child = scroller.firstElementChild;
      if (style.display !== 'flex' || style.flexDirection !== 'column-reverse' || !['auto', 'scroll'].includes(style.overflowY) || scroller.children.length !== 1 || !(child instanceof HTMLElement) || scroller.scrollHeight <= scroller.clientHeight || scroller.scrollTop !== 0 || scroller.scrollLeft !== 0) continue;
      const box = child.getBoundingClientRect();
      if (Number.isInteger(box.x * devicePixelRatio) && Number.isInteger(box.y * devicePixelRatio)) continue;
      for (const image of child.querySelectorAll('img')) images.add(image);
    }
    const repaint = [...images].map(image => ({ image, opacity: image.style.getPropertyValue('opacity'), priority: image.style.getPropertyPriority('opacity'), computed: getComputedStyle(image).opacity, hadStyle: image.hasAttribute('style') }));
    if (repaint.length) {
      const before = signature();
      const frames = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      for (const { image } of repaint) image.style.setProperty('opacity', '0');
      try { await frames(); }
      finally {
        for (const { image, opacity, priority, hadStyle } of repaint) {
          if (opacity) image.style.setProperty('opacity', opacity, priority); else image.style.removeProperty('opacity');
          if (!hadStyle && image.getAttribute('style') === '') image.removeAttribute('style');
        }
      }
      await frames();
      if (signature() !== before || repaint.some(({ image, computed }) => getComputedStyle(image).opacity !== computed)) throw new Error('Capture image settlement changed layout or authored opacity');
    }
  });
  // A CDP LayerTree enable forces a full compositor commit so text rasters are deterministic.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('LayerTree.enable');
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.waitForTimeout(50);
  await cdp.send('LayerTree.disable');
  await cdp.detach();
}
