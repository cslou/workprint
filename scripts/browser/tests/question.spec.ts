import { browserOrigin } from '../origin.js';
import { expect, test } from '@playwright/test';
import { test as observedTest } from '../material-network.js';
import { activate } from '../activation.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { proposalSchema, workspaceSchema, versionSchema } from '../../../packages/contracts/src/index.js';
import { proposalCost, proposalLines, deriveProposalDisplayFacts } from '../../../apps/web/src/conversation/proposal.js';
import type { verifyBuiltAdmission as VerifyBuiltAdmission } from '../../../apps/api/test/auth-built-fixture.js';

test('proposal cost keeps missing/unknown amounts unknown and display facts bind exact identities', () => {
  const proposal = proposalSchema.parse({ id: 'p', revision: 3, questionId: 'q', purpose: 'panel_image', target: { shotId: 's', panelId: 'x' }, provider: 'provider', model: 'model', prompt: 'Prompt', settings: {}, candidateCount: 1, inputs: [], disclosures: [], estimate: { basis: 'unknown', amount: 0.12, currency: 'USD' } });
  expect(proposalCost(proposal)).toBe('Cost: unknown');
  for (const estimate of [{ basis: 'estimated' as const }, { basis: 'provider' as const, amount: 0.12 }]) expect(proposalCost({ ...proposal, estimate })).toBe('Cost: unknown');
  expect(proposalCost({ ...proposal, estimate: { basis: 'estimated', amount: 0.12, currency: 'USD' } })).toBe('Cost: $0.12 · estimate');
  expect(proposalLines(proposal, { proposalId: 'other', proposalRevision: 3, inputs: {} }, [])).toBeNull();
});

test('workspace order positions supply numbering and ambiguous or mismatched targets fail closed', () => {
  const proposal = proposalSchema.parse({ id: 'p', revision: 1, questionId: 'q', purpose: 'panel_image', target: { shotId: 'target', panelId: 'panel' }, provider: 'provider', model: 'model', prompt: 'Prompt', settings: {}, candidateCount: 1, inputs: [], disclosures: [], estimate: { basis: 'unknown' } });
  const panel = { panelId: 'panel', order: 40, description: '', references: [], candidateImageVersions: [], approvedImageVersionId: null };
  const workspace = workspaceSchema.parse({ script: null, assets: [], storyboard: { work: null, shots: [{ shotId: 'target', order: 80, panels: [panel, { ...panel, panelId: 'earlier-panel', order: 10 }, { ...panel, panelId: 'later-panel', order: 90 }], chosenVideoVersionId: null }, { shotId: 'first', order: 10, panels: [], chosenVideoVersionId: null }] }, videos: [], pendingQuestion: null, activeWork: [], selectionRevision: 0 });
  const facts = deriveProposalDisplayFacts(proposal, workspace, {});
  expect(facts?.shot).toEqual({ id: 'target', number: 2 });
  expect(facts?.panel).toEqual({ id: 'panel', number: 2 });
  for (const defect of ['missing-shot', 'missing-panel', 'duplicate-shot-order', 'duplicate-panel-order']) {
    const invalid = structuredClone(workspace);
    const target = invalid.storyboard.shots[0]!;
    if (defect === 'missing-shot') target.shotId = 'not-target';
    if (defect === 'missing-panel') target.panels = [];
    if (defect === 'duplicate-shot-order') target.order = 10;
    if (defect === 'duplicate-panel-order') target.panels.push({ ...panel, panelId: 'other' });
    expect(deriveProposalDisplayFacts(proposal, invalid, {})).toBeNull();
  }
});

observedTest('real question/proposal/version reads and exact option answers distinguish 401/404/501 without effects', async ({ page, materialNetwork }, info) => {
  observedTest.setTimeout(120000);
  await info.attach('prerequisites', { body: 'Labelled read-only question, proposal, exact versions and identity-bound display facts; not saved product records.', contentType: 'text/plain' });
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const cleanup: (() => void | Promise<void>)[] = [];
  try {
    await verifyBuiltAdmission({ diagnostic(message) { console.log(message); }, after(fn) { cleanup.push(fn); } }, async ({ origin, accessTokens }) => {
      for (const [token, status, feedback] of [[accessTokens[0], 501, 'Answering is not available yet. The question stays pending.'], [null, 401, 'Sign-in required to answer. The question stays pending.']] as const) {
        materialNetwork.expectOperations(
          ...['/v1/questions/question-example', '/v1/proposals/proposal-example', '/v1/versions/vale-v1', '/v1/versions/gallery-v1'].map(path => ({ origin, method: 'GET', path, count: 2, query: {} })),
          { origin, method: 'POST', path: '/v1/questions/question-example/answers', count: 1, query: {} },
        );
        const requests: { method: string; path: string; body: unknown }[] = [];
        await page.goto('/question.html');
        await page.waitForFunction(() => !!(window as unknown as { questionTest?: unknown }).questionTest);
        await page.route('**/*', async (route) => {
          const url = new URL(route.request().url());
          if (![browserOrigin, origin].includes(url.origin)) throw new Error('Unauthorized question egress');
          if (url.origin === origin) requests.push({ method: route.request().method(), path: url.pathname, body: route.request().method() === 'POST' ? route.request().postDataJSON() : null });
          await route.continue();
        });
        const responses: { path: string; status: number }[] = [];
        const listener = (response: import('@playwright/test').Response) => { const url = new URL(response.url()); if (url.origin === origin) responses.push({ path: url.pathname, status: response.status() }); };
        page.on('response', listener);
        await page.evaluate((value) => (window as unknown as { questionTest: { configure(value: unknown): void } }).questionTest.configure(value), { apiOrigin: origin, token, withProposal: true });
        await expect.poll(() => responses.length).toBe(4);
        expect([...responses].sort((a, b) => a.path.localeCompare(b.path))).toEqual(['/v1/questions/question-example', '/v1/proposals/proposal-example', '/v1/versions/vale-v1', '/v1/versions/gallery-v1'].sort((a, b) => a.localeCompare(b)).map(path => ({ path, status: status === 501 && path.startsWith('/v1/versions/') ? 404 : status })));
        expect(requests.map((request) => request.path).sort()).toEqual(['/v1/questions/question-example', '/v1/proposals/proposal-example', '/v1/versions/vale-v1', '/v1/versions/gallery-v1'].sort());
        await expect(page.getByText('Shot 2 · Panel 2.1 · 1 image', { exact: true })).toBeVisible();
        await activate(page.locator('.wp-proposal summary'), status === 501);
        await expect(page.locator('.wp-proposal details')).toHaveAttribute('open', '');
        await expect(page.locator('.wp-proposal details > div > p')).toHaveText([
          'Vale recognises Mercer in the gallery.',
          '16:9 · still camera',
          'Input references are sent to example-provider.',
          'The output is a generated candidate, not an approved version.',
        ]);
        await page.getByRole('textbox', { name: 'Message' }).fill('This is a message, not an answer');
        await activate(page.getByRole('button', { name: 'Send', exact: true }), status === 501);
        await expect(page.getByText('Sending messages is not available yet. Your message is kept.', { exact: true })).toBeVisible();
        expect(requests).toHaveLength(4);
        await activate(page.getByRole('button', { name: 'Fold the question', exact: true }), status === 501);
        await expect(page.getByRole('button', { name: 'Make this panel', exact: true })).toHaveCount(0);
        await activate(page.getByRole('button', { name: 'Show', exact: true }), status === 501);
        await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue('This is a message, not an answer');
        await activate(page.getByRole('button', { name: 'Make this panel', exact: true }), status === 501);
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
        await page.evaluate((value) => (window as unknown as { questionTest: { configure(value: unknown): void } }).questionTest.configure(value), { token, withProposal: true });
        await expect.poll(() => requests.length).toBe(9);
        expect(requests.filter((request) => request.method === 'POST')).toHaveLength(1);
        expect(await page.getByRole('textbox', { name: 'Message' }).inputValue()).toBe('');
        page.off('response', listener);
        await page.unrouteAll({ behavior: 'wait' });
      }
    }, { browserOrigin });
  } finally { for (const fn of cleanup.reverse()) await fn(); }
});

for (const race of ['read', 'answer'] as const) test(`${race} revision race ignores old completion and never replays commands on remount`, async ({ page }, info) => {
  await info.attach('prerequisite', { body: 'Labelled read-only question revision race; controlled responses only for this race.', contentType: 'text/plain' });
  await page.goto('/question.html');
  await page.waitForFunction(() => !!(window as unknown as { questionTest?: unknown }).questionTest);
  const record = (revision: number) => ({ id: 'race-question', revision, status: 'pending', scope: {}, prompt: revision === 1 ? 'First question revision' : 'Current question revision', options: [{ id: 'choice-' + revision, label: 'Record choice ' + revision }] });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let completed!: () => void;
  const completion = new Promise<void>((resolve) => { completed = resolve; });
  let held = false;
  const posts: unknown[] = [];
  await page.route('**/v1/**', async (route) => {
    const post = route.request().method() === 'POST';
    if (post) posts.push(route.request().postDataJSON());
    if ((race === 'read' && !post) || (race === 'answer' && post)) {
      held = true; await gate;
      try { await route.fulfill(race === 'read' ? { json: record(1) } : { status: 501, json: { error: { code: 'not_implemented', message: 'Controlled revision race' } } }); }
      finally { completed(); }
    } else await route.fulfill({ status: 501, json: { error: { code: 'not_implemented', message: 'Controlled revision race' } } });
  });
  const configure = (revision: number, initial = false) => page.evaluate((input) => (window as unknown as { questionTest: { configure(value: unknown): void } }).questionTest.configure(input), { ...(initial ? { apiOrigin: browserOrigin } : {}), question: record(revision) });
  await configure(1, true);
  await page.getByRole('textbox', { name: 'Message' }).fill('Keep the separate message');
  if (race === 'answer') await page.getByRole('button', { name: 'Record choice 1', exact: true }).click();
  await expect.poll(() => held).toBe(true);
  await configure(2);
  await expect(page.getByRole('heading', { name: 'Current question revision' })).toBeVisible();
  release(); await completion;
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByRole('heading', { name: 'Current question revision' })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveValue('Keep the separate message');
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Record choice 2', exact: true })).toBeEnabled();
  expect(posts).toHaveLength(race === 'answer' ? 1 : 0);
  await page.evaluate(() => (window as unknown as { questionTest: { unmount(): void } }).questionTest.unmount());
  await expect(page.getByRole('region', { name: 'Question' })).toHaveCount(0);
  await configure(2);
  await expect(page.getByRole('textbox')).toHaveValue('');
  expect(posts).toHaveLength(race === 'answer' ? 1 : 0);
  const calls = await page.evaluate(() => (window as unknown as { questionTest: { observations(): { nativeCalls: string[] } } }).questionTest.observations());
  expect(calls.nativeCalls.every((name) => name === 'subscribe')).toBe(true);
});

test('record-owned options, generic client error and missing display facts cannot grant approval', async ({ page }) => {
  await page.goto('/question.html');
  await page.waitForFunction(() => !!(window as unknown as { questionTest?: unknown }).questionTest);
  await page.evaluate(() => (window as unknown as { questionTest: { configure(value: unknown): void } }).questionTest.configure({ apiOrigin: window.location.origin, question: { id: '.', revision: 9, status: 'pending', scope: {}, prompt: 'Record-owned question', options: [{ id: 'custom-option', label: 'A label supplied by this record' }] } }));
  await page.getByRole('button', { name: 'A label supplied by this record', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('The answer was not submitted. The question stays pending.');
  await expect(page.getByRole('region', { name: 'Question' })).toHaveAttribute('data-question-status', 'pending');
  await page.getByRole('textbox', { name: 'Message' }).fill('Keep this separate message');
  await page.getByRole('button', { name: 'Fold the question' }).click();
  await expect(page.getByRole('button', { name: 'A label supplied by this record', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show', exact: true }).click();
  await expect(page.getByRole('button', { name: 'A label supplied by this record', exact: true })).toBeEnabled();
  await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue('Keep this separate message');
  await page.evaluate(() => (window as unknown as { questionTest: { configure(value: unknown): void } }).questionTest.configure({ withProposal: true, missingFacts: true, accountId: 'new-scope' }));
  await expect(page.getByRole('button', { name: 'Request a different framing', exact: true })).toBeDisabled();
});

for (const status of ['answered', 'superseded'] as const) for (const timing of ['cached', 'concurrent'] as const) test(`${status} prop synchronously blocks a ${timing} pending read`, async ({ page }, info) => {
  await info.attach('prerequisite', { body: 'Labelled read-only terminal question; controlled pending GET tests cache/response races, not backend success.', contentType: 'text/plain' });
  await page.goto('/question.html');
  await page.waitForFunction(() => !!(window as unknown as { questionTest?: unknown }).questionTest);
  const pending = { id: 'terminal-question', revision: 7, status: 'pending', scope: {}, prompt: 'Cached pending response', options: [{ id: 'choice', label: 'Record terminal choice' }] };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let held = false;
  let posts = 0;
  await page.route('**/v1/**', async (route) => {
    if (route.request().method() === 'POST') { posts++; await route.fulfill({ status: 501, json: { error: { code: 'not_implemented', message: 'Controlled terminal race' } } }); return; }
    held = true; await gate; await route.fulfill({ json: pending });
  });
  const response = page.waitForResponse((value) => value.url().endsWith('/v1/questions/terminal-question'));
  await page.evaluate((question) => (window as unknown as { questionTest: { configure(value: unknown): void } }).questionTest.configure({ apiOrigin: window.location.origin, question: { ...question, prompt: 'Pending prop' } }), pending);
  await expect.poll(() => held).toBe(true);
  if (timing === 'cached') { release(); await (await response).finished(); await expect(page.getByRole('heading', { name: 'Cached pending response' })).toBeVisible(); }
  const snapshot = await page.evaluate((question) => {
    (window as unknown as { questionTest: { configure(value: unknown): void } }).questionTest.configure({ question, sync: true });
    const region = document.querySelector('[aria-label="Question"]');
    return { status: region?.getAttribute('data-question-status'), disabled: (region?.querySelector('.wp-question-option') as HTMLButtonElement | null)?.disabled };
  }, { ...pending, status, prompt: 'Terminal question prop' });
  expect(snapshot).toEqual({ status, disabled: true });
  if (timing === 'concurrent') { release(); await (await response).finished(); await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))); }
  await expect(page.getByRole('region', { name: 'Question' })).toHaveAttribute('data-question-status', status);
  await expect(page.getByRole('button', { name: 'Record terminal choice', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Record terminal choice', exact: true }).evaluate((element) => (element as HTMLButtonElement).click());
  expect(posts).toBe(0);
});

for (const status of ['answered', 'superseded'] as const) for (const kind of ['newer', 'older', 'foreign'] as const) test(`revision precedence: ${status} prop versus ${kind} pending read`, async ({ page }, info) => {
  await info.attach('prerequisite', { body: 'Labelled read-only revision precedence; controlled server reads and unavailable answers, not persisted decisions.', contentType: 'text/plain' });
  await page.goto('/question.html');
  await page.waitForFunction(() => !!(window as unknown as { questionTest?: unknown }).questionTest);
  const question = { id: 'revision-question', revision: 7, status, scope: {}, prompt: 'Terminal revision 7', options: [{ id: 'terminal-choice', label: 'Terminal option' }] };
  const server = { ...question, id: kind === 'foreign' ? 'different-question' : question.id, revision: kind === 'older' ? 6 : 8, status: 'pending', prompt: 'Server question', options: [{ id: 'server-choice', label: 'Server option' }] };
  const posts: { path: string; body: unknown }[] = [];
  await page.route('**/v1/**', async (route) => {
    if (route.request().method() === 'POST') {
      posts.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
      await route.fulfill({ status: 501, json: { error: { code: 'not_implemented', message: 'Controlled revision answer' } } });
    } else await route.fulfill({ json: server });
  });
  const response = page.waitForResponse((value) => value.url().endsWith('/v1/questions/revision-question'));
  await page.evaluate((question) => (window as unknown as { questionTest: { configure(value: unknown): void } }).questionTest.configure({ apiOrigin: window.location.origin, question, sync: true }), question);
  await (await response).finished();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  if (kind === 'newer') {
    await expect(page.getByRole('heading', { name: 'Server question', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Server option', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Server option', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Answering is not available yet. The question stays pending.');
    expect(posts).toEqual([{ path: '/v1/questions/revision-question/answers', body: { operationId: expect.stringMatching(/^[0-9a-f-]{36}$/), questionRevision: 8, optionId: 'server-choice' } }]);
  } else {
    await expect(page.getByRole('heading', { name: 'Terminal revision 7', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Question' })).toHaveAttribute('data-question-status', status);
    await expect(page.getByRole('button', { name: 'Terminal option', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Server option', exact: true })).toHaveCount(0);
    expect(posts).toHaveLength(0);
  }
});

test('inherited display-name entries cannot authorize a proposal input', () => {
  const proposal = proposalSchema.parse({ id: 'p', revision: 1, questionId: 'q', purpose: 'reference_image', target: { role: 'character' }, provider: 'provider', model: 'model', prompt: 'Prompt', settings: {}, candidateCount: 1, inputs: [{ versionId: 'constructor', role: 'character_reference', order: 0 }], disclosures: [], estimate: { basis: 'unknown' } });
  const version = versionSchema.parse({ id: 'constructor', artifactId: 'artifact', revision: 1, kind: 'reference', content: {}, createdBy: 'human', createdAt: '2026-10-28T00:00:00Z', dependencies: [] });
  expect(proposalLines(proposal, { proposalId: 'p', proposalRevision: 1, inputs: {} }, [version])).toBeNull();
  expect(proposalLines(proposal, { proposalId: 'p', proposalRevision: 1, inputs: { constructor: { name: 'Explicit reference' } } }, [version])?.inputs).toBe('Uses: Explicit reference (version 1)');
});

for (const docked of [false, true]) test(`standalone ${docked ? 'docked' : 'opening'} composer owns its styles`, async ({ page }) => {
  await page.goto(`/composer.html${docked ? '?docked' : ''}`);
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
  const styles = await page.locator('form').evaluate((element) => {
    const form = getComputedStyle(element);
    const input = getComputedStyle(element.querySelector('textarea')!);
    const attach = element.querySelector('.wp-opening-attach > span')!.getBoundingClientRect();
    return { display: form.display, background: form.backgroundColor, radius: form.borderTopLeftRadius, borderRight: form.borderRightWidth, shadow: form.boxShadow, fontSize: input.fontSize, minHeight: input.minHeight, lineHeight: input.lineHeight, attach: [attach.width, attach.height] };
  });
  expect(styles).toMatchObject({ display: 'flex', background: docked ? 'rgba(0, 0, 0, 0)' : 'rgb(255, 254, 250)', radius: docked ? '0px' : '14px', borderRight: docked ? '0px' : '1px', fontSize: '15px', minHeight: '44px', lineHeight: docked ? '21.75px' : '22.5px', attach: [30, 30] });
  if (docked) expect(styles.shadow).toBe('none'); else expect(styles.shadow).not.toBe('none');
});
