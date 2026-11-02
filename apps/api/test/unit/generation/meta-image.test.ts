import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { createMetaImageClient, MetaImageError, type MetaImageErrorCode } from '../../../src/generation/index.js';
import { metaImageFake, testPng } from '../../support/meta-image-fake.js';

const fake = await metaImageFake();
after(() => fake.close());
beforeEach(() => fake.reset());
const key = 'harmless-image-key-sentinel';
const client = (options: { timeoutMs?: number } = {}) => createMetaImageClient({ apiKey: key, baseUrl: fake.url, retryDelayMs: 1, ...options });
const refusal = async (promise: Promise<unknown>, code: MetaImageErrorCode, param?: string) => {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof MetaImageError);
    assert.equal(error.code, code);
    assert.equal(error.param, param);
    return true;
  });
};

test('generate and edit send Meta\'s field names, and each returned image is a result', async () => {
  const result = await client().generate({ prompt: 'A bench', n: 2, size: '1536x1024', outputFormat: 'png', reasoningStrength: 'low', tools: { imageSearch: false, webSearch: false, shell: false } });
  assert.equal(fake.requests[0]!.path, '/v1/images/generations');
  assert.equal(fake.requests[0]!.authorization, `Bearer ${key}`);
  assert.deepEqual(fake.requests[0]!.body, {
    model: 'muse-image-1.0', prompt: 'A bench', response_format: 'b64_json', n: 2, size: '1536x1024', output_format: 'png', reasoning_strength: 'low',
    tool_enablement: { enable_image_search: false, enable_web_search: false, enable_shell: false },
  });
  assert.equal(result.images.length, 2);
  assert.deepEqual(result.images.map(image => image.contentType), ['image/png', 'image/png']);
  assert.ok(Buffer.from(result.images[0]!.bytes).equals(testPng({ seed: 1 })));
  assert.equal(result.requestId, 'fake-1');
  assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 20, totalTokens: 30 });

  const input = `data:image/png;base64,${testPng().toString('base64')}`;
  await client().edit({ prompt: 'Evening light', outputFormat: 'png', images: [{ dataUrl: input }] });
  assert.equal(fake.requests[1]!.path, '/v1/images/edits');
  // Omitted fields take Meta's defaults: nothing is sent for them.
  assert.deepEqual(fake.requests[1]!.body, { model: 'muse-image-1.0', prompt: 'Evening light', response_format: 'b64_json', output_format: 'png', images: [{ image_url: input }] });
});

test('invalid requests are refused before anything is sent', async () => {
  const image = { dataUrl: `data:image/png;base64,${testPng().toString('base64')}` };
  await refusal(client().generate({ prompt: ' ' }), 'invalid_request', 'prompt');
  await refusal(client().generate({ prompt: 'x', n: 0 }), 'invalid_request', 'n');
  await refusal(client().generate({ prompt: 'x', n: 11 }), 'invalid_request', 'n');
  await refusal(client().generate({ prompt: 'x', size: '1700x100' }), 'invalid_request', 'size');
  await refusal(client().generate({ prompt: 'x', size: 'wide' }), 'invalid_request', 'size');
  await refusal(client().edit({ prompt: 'x', images: Array.from({ length: 11 }, () => image) }), 'invalid_request', 'images');
  await refusal(client().edit({ prompt: 'x', images: [{ url: 'http://example.invalid/a.png' }] }), 'invalid_request', 'images[0]');
  assert.equal(fake.requests.length, 0);
  await client().generate({ prompt: 'x', size: '1600x100' });
  assert.equal(fake.requests.length, 1, 'a 16:1 ratio is allowed');
});

test('errors map to a closed set: one retry for 503, none for 400 or 500', async () => {
  fake.script({ status: 400, error: { type: 'invalid_request_error', code: 'content_policy_violation', param: 'prompt', message: 'echo A bench' } });
  await refusal(client().generate({ prompt: 'A bench' }), 'content_policy');
  fake.script({ status: 400, error: { type: 'invalid_request_error', param: 'size', message: 'bad' } });
  await refusal(client().generate({ prompt: 'x' }), 'invalid_request', 'size');
  fake.script({ status: 415, error: { code: 'unsupported_media_type' } });
  await refusal(client().generate({ prompt: 'x' }), 'invalid_request');
  fake.script({ status: 500 });
  await refusal(client().generate({ prompt: 'x' }), 'failed');
  assert.equal(fake.requests.length, 4, 'no retries');

  fake.reset();
  fake.script({ status: 503 });
  assert.equal((await client().generate({ prompt: 'x' })).images.length, 1);
  assert.equal(fake.requests.length, 2, 'one retry, then success');
  fake.reset();
  fake.script({ status: 503 }, { status: 503 });
  await refusal(client().generate({ prompt: 'x' }), 'unavailable');
  assert.equal(fake.requests.length, 2);

  fake.script({ raw: '{"data":[]}' });
  await refusal(client().generate({ prompt: 'x' }), 'failed');
  fake.script({ images: [Buffer.from('RIFF0000WEBPVP8 ')], outputFormat: 'png' });
  await refusal(client().generate({ prompt: 'x', outputFormat: 'png' }), 'failed');
  await refusal(createMetaImageClient({ apiKey: key, baseUrl: 'http://127.0.0.1:9/v1' }).generate({ prompt: 'x' }), 'failed');
});

test('Stop aborts as aborted, and a request that never answers times out as unavailable', async () => {
  fake.script({ hang: true });
  const stop = new AbortController();
  const pending = client().generate({ prompt: 'x' }, stop.signal);
  await new Promise(resolve => setTimeout(resolve, 20));
  stop.abort();
  await refusal(pending, 'aborted');
  fake.script({ hang: true });
  await refusal(client({ timeoutMs: 50 }).generate({ prompt: 'x' }), 'unavailable');
  await refusal(client().generate({ prompt: 'x' }, AbortSignal.abort()), 'aborted');
});

test('no error carries the key, the prompt or image bytes', async () => {
  const prompt = 'harmless-prompt-sentinel', bytes = testPng({ seed: 99 }).toString('base64');
  const failures = [
    { status: 400, error: { code: 'content_policy_violation', message: prompt } },
    { status: 400, error: { param: `x ${prompt}`, message: prompt } },
    { status: 500, error: { message: `${key} ${prompt}` } },
    { raw: `{"data":[{"b64_json":"${bytes}"}],"output_format":"jpeg"}` },
  ] as const;
  for (const step of failures) {
    fake.script(step);
    await assert.rejects(client().edit({ prompt, images: [{ dataUrl: `data:image/png;base64,${bytes}` }] }), (error: unknown) => {
      assert.ok(error instanceof MetaImageError);
      for (const secret of [key, prompt, bytes.slice(0, 40)]) assert.ok(!`${error.message} ${error.param ?? ''} ${error.stack ?? ''}`.includes(secret));
      return true;
    });
  }
});
