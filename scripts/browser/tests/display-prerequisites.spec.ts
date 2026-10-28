import { expect, test, type Page } from '@playwright/test';
import type { Version } from '../../../packages/contracts/src/models.js';

type Harness = { selectionRace: { configure(mode: 'video' | 'panel', options: unknown): void; pending(): number } };
const src = '/references/assets/media-placeholder.svg';
const boardFacts = () => ({ versionId: 'board-v7', revision: 7, title: 'Bound storyboard title', shots: [{ shotId: 'shot-a', camera: 'Close-up · Eye level · Still', duration: '4 s', status: 'Ready' as const }], images: [{ versionId: 'panel-image-v2', revision: 2, src, alt: 'Bound Panel version two' }] });
const video = (revision: number): Extract<Version, { media: unknown }> => ({ id: `video-v${revision}`, artifactId: 'video-artifact', revision, kind: 'video', media: { contentType: 'video/mp4', byteSize: 456, width: 1280, height: 720, durationMs: 5100 }, createdBy: 'assistant', createdAt: '2026-10-28T00:00:00Z', dependencies: [] });
const videoFacts = () => ({ versions: [video(1), video(2)], images: [1, 2].map(revision => ({ versionId: `video-v${revision}`, revision, src: `${src}?version=${revision}`, alt: `Bound Video version ${revision}` })) });
async function configure(page: Page, mode: 'video' | 'panel', options: unknown) {
  await page.route('**/*', async route => { if (new URL(route.request().url()).origin !== 'http://127.0.0.1:4179') throw new Error('Unauthorized display prerequisite egress'); await route.continue(); });
  await page.goto('/selection-races.html'); await page.waitForFunction(() => !!(window as unknown as Harness).selectionRace);
  await page.evaluate(({ mode, options }) => (window as unknown as Harness).selectionRace.configure(mode, options), { mode, options });
}

test('labelled Storyboard facts display every bound title/camera/duration/status and Panel image field', async ({ page }, info) => {
  await info.attach('prerequisite', { body: 'Read-only exact Storyboard/image version display facts. The local neutral SVG is an explicit fixture URL, never a product fallback or generated image.', contentType: 'text/plain' });
  await configure(page, 'panel', { storyboardFacts: boardFacts() });
  await expect(page.locator('.wp-shot-title b')).toHaveText('First Shot');
  await expect(page.locator('.wp-shot-title small')).toHaveText('4 s · 1 panel');
  await expect(page.locator('.wp-storyboard-camera')).toHaveText('Close-up · Eye level · Still');
  await expect(page.locator('.wp-storyboard-shot .wp-status')).toHaveText('Ready');
  await expect(page.locator('.wp-storyboard-panel > p')).toHaveText('A quiet moment.');
  await page.getByRole('button', { name: 'View storyboard', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Storyboard · Bound storyboard title');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'View Panel 1.1 version 2', exact: true }).click();
  const image = page.getByRole('img', { name: 'Bound Panel version two', exact: true });
  await expect(image).toHaveAttribute('src', src); await expect(image).toHaveAttribute('alt', 'Bound Panel version two');
  await expect(page.locator('[data-displayed-version-id]')).toHaveAttribute('data-displayed-version-id', 'panel-image-v2');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'View Panel 1.1 version 1', exact: true }).click();
  await expect(page.locator('.wp-panel-version img')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as Harness).selectionRace.pending())).toBe(0);
});

for (const mismatch of ['version', 'revision'] as const) test(`Storyboard ${mismatch} mismatch rejects all rich facts`, async ({ page }) => {
  const facts = boardFacts(); if (mismatch === 'version') facts.versionId = 'other-board'; else facts.revision = 8;
  await configure(page, 'panel', { storyboardFacts: facts });
  await expect(page.locator('.wp-shot-title small')).toHaveText('1 panel');
  await expect(page.locator('.wp-storyboard-camera,.wp-storyboard-shot .wp-status')).toHaveCount(0);
  await page.getByRole('button', { name: 'View storyboard', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Storyboard');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'View Panel 1.1 version 2', exact: true }).click();
  await expect(page.locator('.wp-panel-version img')).toHaveCount(0);
});

for (const mismatch of ['version', 'revision'] as const) test(`Panel image ${mismatch} mismatch fails closed`, async ({ page }) => {
  const facts = boardFacts(); if (mismatch === 'version') facts.images[0]!.versionId = 'other-image'; else facts.images[0]!.revision = 1;
  await configure(page, 'panel', { storyboardFacts: facts });
  await expect(page.locator('.wp-storyboard-camera')).toHaveText('Close-up · Eye level · Still');
  await page.getByRole('button', { name: 'View Panel 1.1 version 2', exact: true }).click();
  await expect(page.locator('.wp-panel-version img')).toHaveCount(0);
});

test('unrelated Shot facts cannot supply camera, duration or status', async ({ page }) => {
  const facts = boardFacts(); facts.shots[0]!.shotId = 'unrelated-shot';
  await configure(page, 'panel', { storyboardFacts: facts });
  await expect(page.locator('.wp-shot-title small')).toHaveText('1 panel');
  await expect(page.locator('.wp-storyboard-camera,.wp-storyboard-shot .wp-status')).toHaveCount(0);
  await expect(page.locator('.wp-shot-title b')).toHaveText('First Shot');
});

test('labelled Video facts preserve exact titles, durations, selection status and every image src/alt', async ({ page }, info) => {
  await info.attach('prerequisite', { body: 'Read-only public Video projections and explicit exact-version neutral-image URLs, not playable media or persistence proof.', contentType: 'text/plain' });
  await configure(page, 'video', { videoFacts: videoFacts() });
  await expect(page.locator('.wp-video-title')).toHaveText(['First Shot', 'First Shot']);
  await expect(page.locator('.wp-video-metadata')).toHaveText(['Version 1 · 5.1 s', 'Version 2 · 5.1 s']);
  await expect(page.locator('.wp-video-row').nth(0).locator('.wp-status')).toHaveText('Chosen');
  await expect(page.locator('.wp-video-row').nth(1).locator('.wp-status')).toHaveCount(0);
  for (const revision of [1, 2]) {
    const image = page.getByRole('img', { name: `Bound Video version ${revision}`, exact: true });
    await expect(image).toHaveAttribute('src', `${src}?version=${revision}`); await expect(image).toHaveAttribute('alt', `Bound Video version ${revision}`);
  }
  expect(await page.evaluate(() => (window as unknown as Harness).selectionRace.pending())).toBe(0);
});

for (const mismatch of ['version', 'revision'] as const) test(`Video image ${mismatch} mismatch fails closed`, async ({ page }) => {
  const facts = videoFacts(); for (const image of facts.images) { if (mismatch === 'version') image.versionId = `unrelated-${image.versionId}`; else image.revision += 1; }
  await configure(page, 'video', { videoFacts: facts });
  await expect(page.locator('.wp-video-row')).toHaveCount(2); await expect(page.locator('.wp-video-thumbnail')).toHaveCount(0);
});

test('Video request bound to an unrelated Shot cannot expose candidates or images', async ({ page }) => {
  await configure(page, 'video', { videoFacts: videoFacts(), foreignShot: true });
  await expect(page.locator('.wp-video-row,.wp-video-thumbnail')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Use this version', exact: true })).toHaveCount(0);
});
