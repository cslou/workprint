import { browserOrigin } from './origin.js';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { compare } from './compare.js';
import { settleCapture } from './capture.js';
import { capturePairSide } from './capture-pair.js';
import { imageOnlyReference } from './image-only-reference.js';

const fonts = ':root{--font-sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--font-display:Georgia,"Times New Roman",serif}';
const lineStyle = '.rf-line{width:min(680px,calc(100% - 32px));margin:-14px auto 24px;color:#656155;font-size:13px;line-height:1.5;font-family:var(--font-sans)}';
const copy = {
  upload: 'Uploading files is not available yet. The file was not sent.',
  confirm: 'Confirming this upload is not available yet. No version was created.',
} as const;
type Kind = keyof typeof copy;
const box = async (page: Page, selector: string) => {
  const value = await page.locator(selector).first().boundingBox();
  if (!value) throw new Error(`Missing paired geometry ${selector}`);
  return value;
};
const union = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => {
  const x = Math.min(a.x, b.x); const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
};
export async function captureUploadPair(page: Page, info: TestInfo, width: number, kind: Kind) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await page.route('**/*', async (route) => { if (new URL(route.request().url()).origin !== browserOrigin) throw new Error('Unauthorized visual egress'); await route.continue(); });
  await page.goto('/references/flow2-step1-r73.html');
  await page.addStyleTag({ content: fonts });
  await page.addStyleTag({ content: lineStyle });
  await page.evaluate((text) => {
    const account = document.querySelector('.account'); if (account) account.innerHTML = '<span class="avatar">C</span>Creator A';
    const composer = document.querySelector('.composer');
    if (!composer) throw new Error('Missing reference composer');
    composer.insertAdjacentHTML('afterend', `<p class="rf-line">${text}</p>`);
  }, copy[kind]);
  const guidanceSourceHashes = await imageOnlyReference(page);
  await settleCapture(page);
  const referenceComposer = await box(page, '.composer');
  const referenceLine = await box(page, '.rf-line');
  const referenceUnion = union(referenceComposer, referenceLine);
  const referenceClip = kind === 'confirm' ? referenceLine : referenceUnion;
  const reference = await capturePairSide(page, info, [], 'reference', referenceClip, '.rf-line');

  if (kind === 'upload') {
    await page.goto('/shell.html');
    await page.waitForFunction(() => !!(window as unknown as { shellTest?: unknown }).shellTest);
    await page.route('**/v1/conversations/visual-conversation/uploads', async (route) => { await route.fulfill({ status: 501, json: { error: { code: 'not_implemented', message: 'Controlled visual prerequisite matched to the built backend 501' } } }); });
    await page.evaluate((input) => (window as unknown as { shellTest: { configure(value: unknown): void } }).shellTest.configure(input), { session: { accountId: 'visual-account', name: 'Creator A' }, conversationId: 'visual-conversation', apiOrigin: browserOrigin, token: 'token' });
    await page.locator('.wp-opening-composer').waitFor();
    await page.locator('input[type=file]').setInputFiles('apps/web/test/fixtures/library-tile.png');
    await page.locator('.wp-chat-feedback').waitFor();
  } else {
    await page.goto('/uploads.html');
    await page.waitForFunction(() => !!(window as unknown as { uploadsTest?: unknown }).uploadsTest);
    await page.route('**/v1/uploads/visual-upload/confirm', async (route) => { await route.fulfill({ status: 501, json: { error: { code: 'not_implemented', message: 'Controlled visual prerequisite matched to the built backend 501' } } }); });
    await page.evaluate(async (input) => {
      const mount = (window as unknown as { uploadsTest: { configure(value: unknown): void; confirm(id: string): Promise<string> } }).uploadsTest;
      mount.configure(input);
      await mount.confirm('visual-upload');
    }, { apiOrigin: browserOrigin, token: 'token', accountId: 'visual-account', conversationId: 'visual-conversation' });
    await page.locator('[data-confirm]').waitFor();
  }
  await expect(page.locator(kind === 'upload' ? '.wp-chat-feedback' : '[data-confirm]')).toHaveText(copy[kind]);
  await settleCapture(page);
  const actualComposer = await box(page, '.wp-opening-composer');
  const actualLine = await box(page, kind === 'upload' ? '.wp-chat-feedback' : '[data-confirm]');
  const actualUnion = union(actualComposer, actualLine);
  const actualClip = kind === 'confirm' ? actualLine : actualUnion;
  expect(actualComposer.width).toEqual(referenceComposer.width);
  expect(actualComposer.height).toEqual(referenceComposer.height);
  expect(actualLine.width).toEqual(referenceLine.width);
  expect(actualLine.height).toEqual(referenceLine.height);
  expect(actualUnion.width).toEqual(referenceUnion.width);
  expect(actualUnion.height).toEqual(referenceUnion.height);
  const actual = await capturePairSide(page, info, [], 'actual', actualClip, kind === 'upload' ? '.wp-chat-feedback' : '[data-confirm]');
  const changed = await compare(reference.image, actual.image, info.outputPath('comparison'));
  await writeFile(info.outputPath('result.json'), JSON.stringify({ kind, width, imageOnlyApproval: 'docs/design/design.md#image-only-upload-restriction', guidanceSourceHashes, changedPixels: changed, tolerance: 0, reference: 'docs/design/flow2-step1-r73.html composer plus the approved feedback line', substitutions: 'The 501 response is the built backend code and shape, routed in the visual mount; the file is the wordless /fixtures/library-tile.png', note: 'Full-context evidence and two-sided viewport checks accompany the unchanged region comparison; full-page background parity is covered separately by shell/send pairs. Absolute page placement is N/A for the isolated confirmation consumer.', revision: info.config.metadata, context: { reference: reference.context, actual: actual.context }, geometry: { reference: [referenceComposer, referenceLine], actual: [actualComposer, actualLine] } }, null, 2));
  expect(changed).toBe(0);
}
