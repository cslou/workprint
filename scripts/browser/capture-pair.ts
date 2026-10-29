import { expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { compare } from './compare.js';
import { settleCapture } from './capture.js';

/** Narrow extraction of the pair helpers' settled geometry/image/evidence contract. */
export async function capturePairSide(page: Page, info: TestInfo, selectors: readonly string[], side: 'reference' | 'actual', region?: string) {
  await settleCapture(page);
  const geometry = await page.evaluate(selectors => selectors.map(selector => {
    const nodes = [...document.querySelectorAll(selector)];
    if (!nodes.length) throw new Error(`Missing paired geometry ${selector}`);
    return nodes.map(node => {
      const box = node.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) throw new Error(`Empty paired geometry ${selector}`);
      return box.toJSON();
    });
  }), [...selectors]);
  const full = await page.screenshot({ path: info.outputPath(`${side}-full.png`), fullPage: true, animations: 'disabled' });
  const image = region ? await page.locator(region).screenshot({ path: info.outputPath(`${side}-region.png`), animations: 'disabled' }) : full;
  return { geometry, image };
}
export async function verifyCapturePair(info: TestInfo, reference: Awaited<ReturnType<typeof capturePairSide>>, actual: Awaited<ReturnType<typeof capturePairSide>>, metadata: Readonly<Record<string, unknown>>) {
  await writeFile(info.outputPath('geometry.json'), JSON.stringify({ reference: reference.geometry, actual: actual.geometry }, null, 2));
  const changedPixels = await compare(reference.image, actual.image, info.outputPath('comparison'));
  await writeFile(info.outputPath('result.json'), JSON.stringify({ ...metadata, changedPixels, tolerance: 0, revision: info.config.metadata }, null, 2));
  expect(actual.geometry).toEqual(reference.geometry);
  expect(changedPixels).toBe(0);
}
