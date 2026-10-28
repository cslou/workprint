import { expect, test } from '@playwright/test';
import { compare } from '../compare.js';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

for (const width of [1440, 390, 820, 821]) for (const view of ['question', 'proposal', 'answer', 'send'] as const) {
  if ((view === 'answer' || view === 'send') && width !== 1440 && width !== 390) continue;
  test(`${view} main reference at ${width}`, async ({ page, context }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await context.route('**/*', async (route) => { if (new URL(route.request().url()).origin !== 'http://127.0.0.1:4179') throw new Error('Unauthorized visual egress'); await route.continue(); });
    // Apply the approved font mapping in the first stylesheet response, before layout.
    await context.route('http://127.0.0.1:4179/references/app-r11.css', async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}\n:root{--font-sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--font-display:Georgia,"Times New Roman",serif}b,strong{font-weight:600}` });
    });
    const reference = view === 'send' ? 'flow2-step1-r73.html' : view === 'proposal' ? 'flow2-step6-r78.html' : 'flow2-step2-r74.html';
    await page.goto(`/references/${reference}`);
    await page.addStyleTag({ content: ':root{--font-sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--font-display:Georgia,"Times New Roman",serif}b,strong{font-weight:600}.qcard.dock{width:min(680px,calc(100% - 32px));margin:0 auto 24px}.composer .field.typed{color:var(--fg)}.qplan{margin-bottom:10px}.qplan p+p{margin-top:12px}.qplan details p+p{margin-top:12px}.approved-feedback{font-size:13px;color:var(--fg-subtle);margin:10px 0 0}.approved-send{font-size:13px;color:var(--fg-subtle);margin:-14px auto 24px;width:min(680px,calc(100% - 32px))}.approved-menu{display:none}@media(max-width:820px){.approved-menu{display:block}}' });
    await page.evaluate((view) => {
      if (view === 'send') {
        document.querySelector('.avatar')!.textContent = '';
        document.querySelector('.navlist')!.insertAdjacentHTML('beforeend', '<button class="choice approved-menu">Menu</button>');
        const field = document.querySelector('.composer .field')!; field.textContent = 'Keep this message'; field.classList.add('typed');
        document.querySelector('.send')!.removeAttribute('disabled');
        document.querySelector('.composer')!.insertAdjacentHTML('afterend', '<p class="approved-send">Sending messages is not available yet. Your message is kept.</p>');
        return;
      }
      // Mount the component at the same boundary: the dock's outer spacing belongs to the card.
      const dock = document.querySelector('.dockwrap')!;
      dock.replaceWith(dock.querySelector('.qcard')!);
      // No count/next-question fields exist in the question contract; never invent them.
      document.querySelectorAll('.qcard .count,.qcard .qnext').forEach((element) => element.remove());
      if (view === 'proposal') {
        document.querySelector('.qhead h2')!.textContent = 'Make Panel 2.1?';
        document.querySelector('.qplan')!.outerHTML = '<div class="qplan"><p>Shot 2 · Panel 2.1 · 1 image</p><p>Uses: Vale reference (version 1), Gallery reference (version 1)</p><p>Model: example-provider · example-model</p><p>Cost: $0.12 · estimate</p><p>For information only; not a quote.</p><details class="asked-ctx"><summary>Prompt and settings</summary><div class="ctx"><p>Vale recognises Mercer in the gallery.</p><p>16:9 · still camera</p></div></details></div>';
        const labels = ['Request a different framing', 'Make this panel'];
        document.querySelectorAll('.qopt').forEach((element, index) => { element.querySelector('span:last-child')!.textContent = labels[index] ?? ''; });
      }
      if (view === 'answer') document.querySelector('.qopts')!.insertAdjacentHTML('afterend', '<p class="approved-feedback">The answer was not submitted. The question stays pending.</p>');
    }, view);
    await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
    const measure = () => page.evaluate((view) => {
      const selectors = [
        ...(view === 'send' ? [] : ['.qcard,.wp-question-card']),
        ...(view === 'proposal' ? ['.qplan,.wp-proposal', 'summary'] : []),
        '.ptabs a.default,.wp-tab[aria-selected="true"]',
        '.dock-input .field,.composer .field,.wp-chat-input',
      ];
      return selectors.map((selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing expected ${view} measurement: ${selector}`);
        const style = getComputedStyle(element);
        const textStyle = element.matches('textarea:placeholder-shown') ? getComputedStyle(element, '::placeholder') : style;
        return { selector, box: element.getBoundingClientRect().toJSON(), styles: Object.fromEntries(['font','line-height','color','background-color','border','border-radius','padding','margin','position','z-index','transform','opacity'].map((key) => [key, key === 'color' ? textStyle.color : style.getPropertyValue(key)])) };
      });
    }, view);
    const referenceGeometry = await measure();
    const expected = await page.screenshot({ path: info.outputPath('reference-full.png'), fullPage: true, animations: 'disabled' });
    if (view === 'send') {
      await page.goto('/shell.html');
      await page.waitForFunction(() => !!(window as unknown as { shellTest?: unknown }).shellTest);
      await page.evaluate(() => (window as unknown as { shellTest: { configure(value: unknown): void } }).shellTest.configure({ session: null }));
      await page.getByRole('textbox', { name: 'Message' }).fill('Keep this message');
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(page.getByRole('status')).toHaveText('Sending messages is not available yet. Your message is kept.');
    } else {
      await page.goto(`/question.html?reference=${view === 'proposal' ? 'proposal' : 'question'}`);
      await page.waitForFunction(() => !!(window as unknown as { questionTest?: unknown }).questionTest);
      await page.evaluate((view) => (window as unknown as { questionTest: { configure(value: unknown): void } }).questionTest.configure(view === 'answer' ? { apiOrigin: 'http://127.0.0.1:4179', question: { id: '.', revision: 7, status: 'pending', scope: {}, prompt: 'How does Mercer react?', options: [{ id: 'surprised', label: 'He looks up at Vale, surprised' }, { id: 'nod', label: 'He stays still, then gives a small nod' }] } } : { withProposal: view === 'proposal' }), view);
      await expect(page.getByRole('region', { name: 'Question' })).toBeVisible();
      if (view === 'answer') { await page.getByRole('button', { name: 'He stays still, then gives a small nod', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('The answer was not submitted. The question stays pending.'); }
      if (view === 'proposal') await expect(page.getByText('Cost: $0.12 · estimate', { exact: true })).toBeVisible();
    }
    await page.mouse.move(1, 1);
    await page.evaluate(async () => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); await document.fonts.ready; window.scrollTo(0, 0); });
    const actualGeometry = await measure();
    await writeFile(info.outputPath('geometry.json'), JSON.stringify({ reference: referenceGeometry, actual: actualGeometry }, null, 2));
    expect(actualGeometry.map((element) => element.box)).toEqual(referenceGeometry.map((element) => element.box));
    const actual = await page.screenshot({ path: info.outputPath('actual-full.png'), fullPage: true, animations: 'disabled' });
    const changed = await compare(expected, actual, info.outputPath('comparison'));
    const source = await readFile(`docs/design/${reference}`);
    const referenceCss = await readFile('docs/design/app-r11.css');
    await writeFile(info.outputPath('result.json'), JSON.stringify({ view, width, reference, sourceSha256: createHash('sha256').update(source).digest('hex'), referenceCssSha256: createHash('sha256').update(referenceCss).digest('hex'), approval: 'docs/design/design.md#shell-and-remaining-phase-2-feedback', changedPixels: changed, tolerance: 0, revision: info.config.metadata, browser: context.browser()?.version(), scope: 'Actual review component in inert tracked reference surroundings; read-only prerequisites are not saved work.' }, null, 2));
    expect(changed).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
