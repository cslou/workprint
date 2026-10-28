import { expect, test } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { proposalSchema } from '../../../packages/contracts/src/index.js';
import { proposalCost, proposalLines } from '../../../apps/web/src/conversation/proposal.js';
import type { verifyBuiltAdmission as VerifyBuiltAdmission } from '../../../apps/api/test/auth-built-fixture.js';

test('proposal cost keeps missing/unknown amounts unknown and display facts bind exact identities', () => {
  const proposal = proposalSchema.parse({ id: 'p', revision: 3, questionId: 'q', purpose: 'panel_image', target: { shotId: 's', panelId: 'x' }, provider: 'provider', model: 'model', prompt: 'Prompt', settings: {}, candidateCount: 1, inputs: [], disclosures: [], estimate: { basis: 'unknown', amount: 0.12, currency: 'USD' } });
  expect(proposalCost(proposal)).toBe('Cost: unknown');
  for (const estimate of [{ basis: 'estimated' as const }, { basis: 'provider' as const, amount: 0.12 }]) expect(proposalCost({ ...proposal, estimate })).toBe('Cost: unknown');
  expect(proposalCost({ ...proposal, estimate: { basis: 'estimated', amount: 0.12, currency: 'USD' } })).toBe('Cost: $0.12 · estimate');
  expect(proposalLines(proposal, { proposalId: 'other', proposalRevision: 3, inputs: {} }, [])).toBeNull();
});

test('real question/proposal/version reads and exact option answers distinguish 401/501 without effects', async ({ page }, info) => {
  test.setTimeout(120000);
  await info.attach('prerequisites', { body: 'Labelled read-only question, proposal, exact versions and identity-bound display facts; not saved product records.', contentType: 'text/plain' });
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const cleanup: (() => void | Promise<void>)[] = [];
  try {
    await verifyBuiltAdmission({ diagnostic(message) { console.log(message); }, after(fn) { cleanup.push(fn); } }, async ({ origin, accessTokens }) => {
      for (const [token, status, feedback] of [[accessTokens[0], 501, 'Answering is not available yet. The question stays pending.'], [null, 401, 'Sign-in required to answer. The question stays pending.']] as const) {
        const requests: { method: string; path: string; body: unknown }[] = [];
        await page.goto('/question.html');
        await page.waitForFunction(() => !!(window as unknown as { questionTest?: unknown }).questionTest);
        await page.route('**/*', async (route) => {
          const url = new URL(route.request().url());
          if (!['http://127.0.0.1:4179', origin].includes(url.origin)) throw new Error('Unauthorized question egress');
          if (url.origin === origin) requests.push({ method: route.request().method(), path: url.pathname, body: route.request().method() === 'POST' ? route.request().postDataJSON() : null });
          await route.continue();
        });
        const responses: number[] = [];
        const listener = (response: import('@playwright/test').Response) => { if (new URL(response.url()).origin === origin) responses.push(response.status()); };
        page.on('response', listener);
        await page.evaluate((value) => (window as unknown as { questionTest: { configure(value: unknown): void } }).questionTest.configure(value), { apiOrigin: origin, token, withProposal: true });
        await expect.poll(() => responses.length).toBe(4);
        expect(responses).toEqual([status, status, status, status]);
        expect(requests.map((request) => request.path).sort()).toEqual(['/v1/questions/question-example', '/v1/proposals/proposal-example', '/v1/versions/vale-v1', '/v1/versions/gallery-v1'].sort());
        await expect(page.getByText('Shot 2 · Panel 2.1 · 1 image', { exact: true })).toBeVisible();
        await page.getByRole('textbox', { name: 'Message' }).fill('This is a message, not an answer');
        await page.getByRole('button', { name: 'Send', exact: true }).click();
        await expect(page.getByText('Sending messages is not available yet. Your message is kept.', { exact: true })).toBeVisible();
        expect(requests).toHaveLength(4);
        await page.getByRole('button', { name: 'He stays still, then gives a small nod', exact: true }).click();
        await expect(page.getByText(feedback, { exact: true })).toBeVisible();
        await expect(page.getByRole('region', { name: 'Question' })).toHaveAttribute('data-question-status', 'pending');
        const answer = requests.find((request) => request.method === 'POST');
        expect(answer?.path).toBe('/v1/questions/question-example/answers');
        expect(answer?.body).toMatchObject({ questionRevision: 7, optionId: 'nod' });
        expect((answer?.body as { operationId: string }).operationId).toMatch(/^[0-9a-f-]{36}$/);
        expect(requests).toHaveLength(5);
        await page.evaluate(() => (window as unknown as { questionTest: { unmount(): void } }).questionTest.unmount());
        await expect(page.getByRole('region', { name: 'Question' })).toHaveCount(0);
        expect(requests.filter((request) => request.method === 'POST')).toHaveLength(1);
        const calls = await page.evaluate(() => (window as unknown as { questionTest: { observations(): { nativeCalls: string[] } } }).questionTest.observations());
        expect(calls.nativeCalls).toEqual(['subscribe', 'sendText']);
        page.off('response', listener);
        await page.unrouteAll({ behavior: 'wait' });
      }
    }, { browserOrigin: 'http://127.0.0.1:4179' });
  } finally { for (const fn of cleanup.reverse()) await fn(); }
});

test('record-owned options, generic client error and missing display facts cannot grant approval', async ({ page }) => {
  await page.goto('/question.html');
  await page.waitForFunction(() => !!(window as unknown as { questionTest?: unknown }).questionTest);
  await page.evaluate(() => (window as unknown as { questionTest: { configure(value: unknown): void } }).questionTest.configure({ apiOrigin: 'http://127.0.0.1:4179', question: { id: '.', revision: 9, status: 'pending', scope: {}, prompt: 'Record-owned question', options: [{ id: 'custom-option', label: 'A label supplied by this record' }] } }));
  await page.getByRole('button', { name: 'A label supplied by this record', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('The answer was not submitted. The question stays pending.');
  await expect(page.getByRole('region', { name: 'Question' })).toHaveAttribute('data-question-status', 'pending');
  await page.evaluate(() => (window as unknown as { questionTest: { configure(value: unknown): void } }).questionTest.configure({ withProposal: true, missingFacts: true, accountId: 'new-scope' }));
  await expect(page.getByRole('button', { name: 'He looks up at Vale, surprised', exact: true })).toBeDisabled();
});
