import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { compare } from '../compare.js';

const contexts = [
  { name: 'opening', reference: 'flow2-step1-r73.html', region: '.panel', actual: '.panel' },
  { name: 'assets', reference: 'flow1-step4-r85.html', region: '.panel', actual: '.panel' },
  { name: 'search', reference: 'library-picker-r92.html', region: '.lp-head', actual: '.lp-head' },
  { name: 'assets-ready', reference: 'flow2-step9-r81.html#p-assets', region: '.panel', actual: '.panel' },
  { name: 'versions', reference: 'flow2-step9-r81.html#p-takes', region: '.panel', actual: '.panel' },
  { name: 'viewer', reference: 'flow1-step4-r85.html#look-a', region: '#look-a .lb-panel', actual: '.wp-modal' },
] as const;
const fontNormalization = ':root{--font-sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--font-display:Georgia,"Times New Roman",serif}';

for (const width of [1440, 390, 820, 821]) for (const context of contexts) {
  test(`${context.name} reference parity at ${width}`, async ({ page, context: browser }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    // All resources are tracked local placeholders; fail on any off-origin request.
    await browser.route('**/*', async (route) => {
      if (new URL(route.request().url()).origin !== 'http://127.0.0.1:4179') throw new Error('Unauthorized browser egress');
      await route.continue();
    });
    await page.goto(`/references/${context.reference}`);
    await page.addStyleTag({ content: fontNormalization });
    await page.evaluate(async () => { await document.fonts.ready; });
    await expect(page.locator(context.region)).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    const referenceBounds = await page.locator(context.region).boundingBox();
    const reference = await page.locator(context.region).screenshot({ path: info.outputPath('reference-region.png'), animations: 'disabled' });
    await page.screenshot({ path: info.outputPath('reference-full.png'), fullPage: true, animations: 'disabled' });
    await page.goto(`/?context=${context.name}`);
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
    if (context.name === 'viewer') await page.getByRole('button', { name: 'View look A' }).click();
    // Focus behavior is tested separately; match the reference's pointer state.
    await page.mouse.move(1, 1);
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.locator(context.actual).boundingBox()).toEqual(referenceBounds);
    const actual = await page.locator(context.actual).screenshot({ path: info.outputPath('actual-region.png'), animations: 'disabled' });
    await page.screenshot({ path: info.outputPath('actual-full.png'), fullPage: true, animations: 'disabled' });
    const changed = await compare(reference, actual, info.outputPath('comparison'));
    const source = await readFile(`docs/design/${context.reference.split('#')[0]}`);
    const referenceCss = await readFile('docs/design/app-r11.css');
    await writeFile(info.outputPath('result.json'), JSON.stringify({ context: context.name, width, source: context.reference, sourceSha256: createHash('sha256').update(source).digest('hex'), referenceCssSha256: createHash('sha256').update(referenceCss).digest('hex'), revision: info.config.metadata, browser: browser.browser()?.version(), changedPixels: changed, tolerance: 0, scope: 'Production foundations mounted within inert approved reference surroundings; not a product page implementation.' }, null, 2));
    expect(changed).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (context.name === 'opening' && width === 1440) {
      // Mutate rendered spacing temporarily; never change/accept a stored baseline.
      const style = await page.addStyleTag({ content: '.wp-tabs{padding-left:28px!important}' });
      const damaged = await page.locator(context.actual).screenshot({ path: info.outputPath('negative-spacing.png') });
      expect(await compare(reference, damaged, info.outputPath('negative-spacing'))).toBeGreaterThan(0);
      await style.evaluate((element) => element.parentNode?.removeChild(element));
      expect(await compare(reference, await page.locator(context.actual).screenshot(), info.outputPath('restored'))).toBe(0);
    }
  });
}
