import { expect, test } from '../material-network.js';

test('labelled working prerequisite: queue/Stop stay local and remount never replays', async ({ page }, info) => {
  await info.attach('prerequisite', { body: 'Read-only working presentation; no assistant or generation is executing.', contentType: 'text/plain' });
  await page.goto('/chat.html');
  await page.waitForFunction(() => !!(window as unknown as { chatTest?: unknown }).chatTest);
  const configure = (working: boolean) => page.evaluate((value) => (window as unknown as { chatTest: { configure(value: boolean): void } }).chatTest.configure(value), working);
  let requests = 0;
  await page.route('**/v1/**', async (route) => { requests++; await route.abort(); });
  await configure(false);
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
  await configure(true);
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Keep this queued message');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Sending messages is not available yet. Your message is kept.');
  await expect(page.getByRole('textbox')).toHaveValue('Keep this queued message');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Stopping is not available yet.');
  await page.getByRole('button', { name: 'Stop', exact: true }).press('Space');
  await expect(page.getByRole('status')).toHaveText('Stopping is not available yet.');
  expect(await page.evaluate(() => (window as unknown as { chatTest: { calls(): string[] } }).chatTest.calls())).toEqual(['sendText', 'stop', 'stop']);
  await page.evaluate(() => (window as unknown as { chatTest: { unmount(): void } }).chatTest.unmount());
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await configure(false);
  await expect(page.getByRole('textbox')).toHaveValue('');
  expect(await page.evaluate(() => (window as unknown as { chatTest: { calls(): string[] } }).chatTest.calls())).toEqual(['sendText', 'stop', 'stop']);
  expect(requests).toBe(0);
});
