import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { createMiniMaxVideoClient, createSafeDownload, MiniMaxVideoError, type MiniMaxVideoClientOptions, type MiniMaxVideoErrorCode, type VideoRequest } from '../../../src/generation/index.js';
import { privateAddress } from '../../../src/generation/safe-download.js';
import { miniMaxVideoFake } from '../../support/minimax-video-fake.js';

const fake = await miniMaxVideoFake({ clip: Buffer.from('a clip') });
after(() => fake.close());
beforeEach(() => fake.reset());
const key = 'harmless-minimax-key-sentinel';
const client = (options: Partial<MiniMaxVideoClientOptions> = {}) => createMiniMaxVideoClient({ apiKey: key, baseUrl: fake.url, retryDelayMs: 1, download: createSafeDownload({ allowLoopback: true }), ...options });
const frame = (width = 1376, height = 768, data = 'AAAA') => ({ dataUrl: `data:image/png;base64,${data}`, width, height });
const prompt: VideoRequest = { prompt: 'A slow push-in on a bench', durationS: 5, ratio: '16:9' };
const refusal = async (promise: Promise<unknown>, code: MiniMaxVideoErrorCode, check: { detail?: string; outcomeUnknown?: boolean } = {}) => {
  let caught: MiniMaxVideoError | undefined;
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof MiniMaxVideoError, String(error));
    assert.equal(error.code, code);
    if ('detail' in check) assert.equal(error.detail, check.detail);
    assert.equal(error.outcomeUnknown, check.outcomeUnknown ?? false);
    caught = error;
    return true;
  });
  return caught!;
};

test('create sends MiniMax\'s field names for prompt-only, first-frame and first-and-last-frame requests', async () => {
  assert.match((await client().submit(prompt)).taskId, /^\d+$/);
  await client().submit({ prompt: 'From the still', durationS: 6, ratio: '9:16', firstFrame: frame() });
  await client().submit({ prompt: 'Between two stills', durationS: 15, firstFrame: frame(), lastFrame: frame(1024, 1024, 'BBBB') });
  const [only, first, both] = fake.requests.map(request => request.body);
  assert.equal(fake.requests[0]!.authorization, `Bearer ${key}`);
  assert.deepEqual(only, { model: 'MiniMax-H3', content: [{ type: 'text', text: 'A slow push-in on a bench' }], resolution: '768P', duration: 5, ratio: '16:9' });
  assert.deepEqual(first, { model: 'MiniMax-H3', content: [{ type: 'text', text: 'From the still' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' }, role: 'first_frame' }], resolution: '768P', duration: 6, ratio: 'adaptive' });
  assert.deepEqual((both!.content as unknown[]).slice(1), [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' }, role: 'first_frame' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,BBBB' }, role: 'last_frame' }]);
  assert.equal(fake.creates, 3);
});

test('requests outside MiniMax\'s limits are refused before anything is sent', async () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ durationS: 3 }, 'durationS'], [{ durationS: 16 }, 'durationS'], [{ durationS: 5.5 }, 'durationS'],
    [{ prompt: 'x'.repeat(7001) }, 'prompt.length'], [{ prompt: '  ' }, 'prompt'],
    [{ ratio: undefined }, 'ratio'], [{ ratio: 'adaptive' as never }, 'ratio'],
    [{ lastFrame: frame() }, 'lastFrame'],
    [{ firstFrame: { ...frame(), dataUrl: 'data:image/webp;base64,AAAA' } }, 'firstFrame'],
    [{ firstFrame: frame(200, 200) }, 'firstFrame.dimensions'], [{ firstFrame: frame(6000, 3000) }, 'firstFrame.dimensions'],
    [{ firstFrame: frame(1536, 512) }, 'firstFrame.ratio'],
    // Model arguments may carry null for an absent optional value.
    [{ firstFrame: null }, 'firstFrame'], [{ firstFrame: frame(), lastFrame: null }, 'lastFrame'],
  ];
  for (const [change, detail] of cases) await refusal(client().submit({ ...prompt, ...change } as VideoRequest), 'invalid_request', { detail });
  assert.equal(fake.requests.length, 0);
});

test('query maps each task status, and keeps the result URL only in the result', async () => {
  const { taskId } = await client().submit(prompt);
  assert.deepEqual(await client().query(taskId), { status: 'queued' });
  assert.deepEqual(await client().query(taskId), { status: 'running' });
  const done = await client().query(taskId);
  assert.equal(done.status, 'succeeded');
  assert.ok(done.status === 'succeeded' && done.result.url.startsWith(`${fake.url}/files/${taskId}.mp4?`));
  assert.deepEqual(done.status === 'succeeded' && { durationS: done.result.durationS, resolution: done.result.resolution }, { durationS: 5, resolution: '768P' });
  fake.script.query({ task: 'failed', code: '1027' }, { task: 'cancelled' });
  assert.deepEqual(await client().query(taskId), { status: 'failed', failure: { code: '1027' } });
  assert.deepEqual(await client().query(taskId), { status: 'cancelled' });
  fake.script.query({ raw: JSON.stringify({ task: { id: 'another', status: 'running' } }) }, { raw: '{"task":{"status":"done"}}' });
  await refusal(client().query(taskId), 'failed');
  await refusal(client().query(taskId), 'failed');
  await refusal(client().query('../x'), 'invalid_request', { detail: 'taskId' });
});

test('errors map to a closed set; only a 429 is retried, and a create that may have landed says so', async () => {
  fake.script.create({ status: 429 });
  await client().submit(prompt);
  assert.equal(fake.creates, 2, 'a 429 is retried once');
  fake.reset();
  fake.script.create({ status: 429 }, { status: 429 });
  await refusal(client().submit(prompt), 'rate_limited', { detail: '1002' });
  for (const [status, code, unknown] of [[400, 'invalid_request', false], [422, 'invalid_request', false], [401, 'unauthorized', false], [402, 'payment_required', false], [500, 'unavailable', true]] as const) {
    fake.reset();
    fake.script.create({ status });
    await refusal(client().submit(prompt), code, { outcomeUnknown: unknown });
    assert.equal(fake.creates, 1, `${status} is not retried`);
  }
  fake.reset();
  fake.script.create({ hang: true });
  await refusal(client({ submitTimeoutMs: 50 }).submit(prompt), 'unavailable', { outcomeUnknown: true });
  fake.script.create({ raw: '{"base_resp":{"status_code":0}}' }, { raw: 'not json' });
  await refusal(client().submit(prompt), 'failed', { outcomeUnknown: true });
  await refusal(client().submit(prompt), 'failed', { outcomeUnknown: true });
  fake.script.create({ raw: JSON.stringify({ padding: 'x'.repeat(1100 * 1024) }) }, { status: 400, message: 'x'.repeat(1100 * 1024) });
  await refusal(client().submit(prompt), 'failed', { outcomeUnknown: true });
  await refusal(client().submit(prompt), 'failed', { outcomeUnknown: false });
  assert.equal(fake.creates, 5, 'nothing unknown is sent again');
  // A closed port: the create may never have left, but the client can't know.
  await refusal(client({ baseUrl: 'http://127.0.0.1:9' }).submit(prompt), 'unavailable', { outcomeUnknown: true });
  fake.reset();
  const sent = new AbortController();
  fake.script.create({ hang: true });
  const hung = client().submit(prompt, sent.signal);
  setTimeout(() => sent.abort(), 20);
  await refusal(hung, 'aborted', { outcomeUnknown: true });
  const waiting = new AbortController();
  fake.script.create({ status: 429 });
  const backoff = client({ retryDelayMs: 5000 }).submit(prompt, waiting.signal);
  setTimeout(() => waiting.abort(), 20);
  await refusal(backoff, 'aborted', { outcomeUnknown: false });
  assert.equal(fake.creates, 2, 'an abort during the backoff sends no retry');
  fake.script.query({ status: 500 });
  await refusal(client().query('1'), 'unavailable');
  const stop = new AbortController();
  fake.script.query({ hang: true });
  const pending = client().query('1', stop.signal);
  setTimeout(() => stop.abort(), 20);
  await refusal(pending, 'aborted');
});

test('a download is bounded, sends no key, and refuses non-HTTPS, private hosts and bad redirects', async () => {
  const { taskId } = await client().submit(prompt);
  const url = `${fake.url}/files/${taskId}.mp4?Signature=s`;
  assert.equal(Buffer.from(await client().download(url)).toString(), 'a clip');
  assert.equal(fake.requests.at(-1)!.authorization, undefined);
  fake.script.download({ oversize: 8 * 1024 * 1024 }, { declare: 2 * 1024 * 1024 });
  await refusal(client().download(url, undefined, 1024 * 1024), 'failed', { detail: 'download.size' });
  assert.ok(fake.served < 4 * 1024 * 1024, `the reader stopped early (${fake.served} bytes served)`);
  await refusal(client().download(url, undefined, 1024 * 1024), 'failed', { detail: 'download.size' });
  for (const bad of [Number.NaN, 0, 1.5]) await refusal(client().download(url, undefined, bad), 'invalid_request', { detail: 'maxBytes' });
  const hop = `${fake.url}/files/${taskId}.mp4`;
  fake.script.download({ redirect: hop }, { redirect: hop }, { redirect: hop }, { redirect: hop });
  await refusal(client().download(url), 'failed', { detail: 'download' });
  fake.script.download({ redirect: 'https://10.0.0.1/clip.mp4' }, { redirect: 'http://169.254.169.254/latest' }, { status: 404 }, { status: 503 });
  await refusal(client().download(url), 'failed', { detail: 'download' });
  await refusal(client().download(url), 'failed', { detail: 'download' });
  await refusal(client().download(url), 'failed', { detail: 'download' });
  await refusal(client().download(url), 'unavailable', { detail: 'download' });
  fake.script.download({ redirect: `${fake.url}/files/${taskId}.mp4` });
  assert.equal(Buffer.from(await client().download(url)).toString(), 'a clip', 'a checked redirect is followed');
  const before = fake.requests.length;
  // Without the test allowance, plain HTTP and loopback are refused before any connection.
  const production = client({ download: createSafeDownload({ lookup: async () => [{ address: '10.1.2.3', family: 4 }] }) });
  for (const value of [url, 'https://127.0.0.1/clip.mp4', 'https://[::1]/clip.mp4', 'https://cdn.example/clip.mp4', 'https://user:pass@cdn.example/clip.mp4', 'ftp://cdn.example/clip.mp4'])
    await refusal(production.download(value), 'failed', { detail: 'download' });
  assert.equal(fake.requests.length, before);
});

test('private addresses include IPv6 forms that carry a private IPv4 address', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1',
    '::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', 'fec0::1', 'feff::1', 'ff02::1', '::ffff:0:127.0.0.1', '::ffff:0:a00:1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::127.0.0.1', '::7f00:1',
    '64:ff9b::a00:1', '64:ff9b::7f00:1', '64:ff9b:1::1', '2002:7f00:1::', '2002:a00:1::1', 'not-an-address'])
    assert.equal(privateAddress(address), true, address);
  for (const address of ['8.8.8.8', '2606:4700:4700::1111', '::ffff:8.8.8.8', '64:ff9b::808:808', '2002:808:808::1'])
    assert.equal(privateAddress(address), false, address);
});

test('no error message carries the key, the prompt, a frame or a result URL', async () => {
  const secret = { prompt: 'prompt-sentinel', frame: 'ZnJhbWVzZW50aW5lbA', url: 'url-sentinel' };
  const errors: unknown[] = [];
  const keep = (promise: Promise<unknown>) => promise.catch((error: unknown) => { errors.push(error); });
  fake.script.create({ status: 400, message: `bad prompt ${secret.prompt} for ${key} (1026)` }, { status: 500 });
  await keep(client().submit({ prompt: secret.prompt, durationS: 5, firstFrame: frame(1376, 768, secret.frame) }));
  await keep(client().submit({ prompt: secret.prompt, durationS: 5, firstFrame: frame(1376, 768, secret.frame) }));
  await keep(client().submit({ prompt: secret.prompt, durationS: 99, firstFrame: frame(1376, 768, secret.frame) }));
  await keep(client().download(`https://10.0.0.1/${secret.url}?Signature=${secret.url}`));
  fake.script.download({ status: 403 });
  await keep(client().download(`${fake.url}/files/1.mp4?Signature=${secret.url}`));
  assert.equal(errors.length, 5);
  assert.equal((errors[0] as MiniMaxVideoError).detail, '1026', 'only the code is kept');
  for (const error of errors) {
    const text = `${String(error)} ${JSON.stringify(error)} ${(error as Error).stack}`;
    for (const value of [key, secret.prompt, secret.frame, secret.url]) assert.ok(!text.includes(value), `leaked ${value}`);
  }
});
