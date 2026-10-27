import assert from 'node:assert/strict';
import { test } from 'node:test';
import { operations, errorEnvelopeSchema, proposalSchema, questionSchema } from '@workprint/contracts';
import { unavailableApplication } from '../src/application/index.js';

const operationId = 'operation-1';
const save = { params: { id: 'conversation-1' }, query: {}, body: { operationId, kind: 'script', content: {}, dependencies: [] } };

test('closed contracts preserve identities and reject authority, missing operations and conditional targets', () => {
  assert.deepEqual(operations.saveVersion.request.parse(save), save);
  for (const field of ['accountId', 'createdBy', 'approved', 'selectionRevision']) {
    assert.equal(operations.saveVersion.request.safeParse({ ...save, body: { ...save.body, [field]: 'forged' } }).success, false);
  }
  const { operationId: omitted, ...body } = save.body;
  assert.ok(omitted);
  const missingOperation = operations.saveVersion.request.safeParse({ ...save, body });
  assert.equal(missingOperation.success, false);
  if (!missingOperation.success) assert.deepEqual(missingOperation.error.issues[0]?.path, ['body', 'operationId']);
  assert.equal(operations.workspace.request.safeParse({ params: { id: 'c', ownerId: 'other' }, query: {}, body: {} }).success, false);
  const use = (body: unknown) => operations.useVersion.request.safeParse({ params: { id: 'c' }, query: {}, body });
  for (const binding of [
    { purpose: 'script' }, { purpose: 'reference', role: 'hero' }, { purpose: 'storyboard' },
    { purpose: 'panel_image', shotId: 'shot-1', panelId: 'panel-1' }, { purpose: 'shot_video', shotId: 'shot-1' },
  ]) assert.equal(use({ operationId, versionId: 'version-2', ...binding }).success, true);
  for (const binding of [
    { purpose: 'panel_image', shotId: 'shot-1' }, { purpose: 'shot_video', panelId: 'panel-1' },
    { purpose: 'script', shotId: 'shot-1' }, { purpose: 'shot_video', shotId: 'shot-1', panelId: 'panel-1' },
  ]) assert.equal(use({ operationId, versionId: 'v', ...binding }).success, false);
  assert.equal(operations.answerQuestion.request.safeParse({ params: { id: 'q' }, query: {}, body: { operationId, questionRevision: 3, optionId: 'approve' } }).success, true);
  assert.equal(operations.answerQuestion.request.safeParse({ params: { id: 'q' }, query: {}, body: { operationId, questionRevision: 3, text: 'yes' } }).success, false);
  assert.equal(operations.createExport.request.safeParse({ params: { id: 'c' }, query: {}, body: { operationId, selectionRevision: 7 } }).success, true);
  assert.equal(operations.createExport.request.safeParse({ params: { id: 'c' }, query: {}, body: { operationId, selectionRevision: -1 } }).success, false);
  assert.equal(operations.library.request.safeParse({ params: {}, query: { limit: 101 }, body: {} }).success, false);
});

test('response contracts retain exact proposal/question targets and decode only structured public errors', () => {
  const proposal = { id: 'p', revision: 2, questionId: 'q', purpose: 'panel_image', target: { shotId: 's', panelId: 'panel' }, provider: 'unqualified', model: 'unqualified', prompt: 'draw', settings: {}, candidateCount: 1, inputs: [{ versionId: 'v', role: 'reference', order: 0 }], disclosures: [], estimate: { basis: 'unknown' } };
  assert.deepEqual(proposalSchema.parse(proposal), proposal);
  assert.equal(proposalSchema.safeParse({ ...proposal, target: { shotId: 's' } }).success, false);
  assert.equal(proposalSchema.safeParse({ ...proposal, purpose: 'reference_image', target: { role: 'hero' } }).success, true);
  assert.equal(proposalSchema.safeParse({ ...proposal, purpose: 'shot_video', target: { shotId: 's' } }).success, true);
  const question = { id: 'q', revision: 3, status: 'pending', scope: { proposalId: 'p', versionId: 'v', useId: 'u' }, prompt: 'Approve?', options: [{ id: 'approve', label: 'Approve shown proposal' }] };
  assert.deepEqual(questionSchema.parse(question), question);
  assert.equal(questionSchema.safeParse({ ...question, scope: { ...question.scope, approved: true } }).success, false);
  for (const code of ['unauthenticated', 'forbidden', 'not_found', 'invalid_input', 'stale_revision', 'superseded', 'unsupported', 'not_implemented', 'integration_failure']) {
    assert.equal(errorEnvelopeSchema.safeParse({ error: { code, message: 'Safe message' } }).success, true);
  }
  assert.equal(errorEnvelopeSchema.safeParse({ error: { code: 'success', message: 'ok' } }).success, false);
  assert.equal(errorEnvelopeSchema.safeParse({ error: { code: 'invalid_input', message: 'bad', stack: 'private' } }).success, false);
  assert.equal(errorEnvelopeSchema.safeParse({ error: { code: 'invalid_input', message: 'bad', details: { token: 'private' } } }).success, false);
  const exported = { id: 'e', status: 'succeeded', capturedSelectionRevision: 7, current: false, sources: [{ shotId: 's', versionId: 'v', order: 0 }], compatibility: { compatible: true, issues: [] }, outputVersionId: 'output-v' };
  assert.deepEqual(operations.export.response.parse(exported), exported);
  assert.equal(operations.export.response.safeParse({ ...exported, nativeRun: {} }).success, false);
  assert.equal(operations.export.response.safeParse({ ...exported, sources: [{ shotId: 's', order: 0 }] }).success, false);
});

test('Version responses decode content and media branches while rejecting malformed and private fields', () => {
  const base = { id: 'version-2', artifactId: 'artifact-1', revision: 2, createdBy: 'human', createdAt: '2026-10-27T12:00:00Z', dependencies: ['reference-version-1'] };
  const contentVersion = { ...base, kind: 'script', content: { schemaVersion: 1, text: 'A door opens.' } };
  const mediaVersion = { ...base, id: 'video-version-1', kind: 'video', createdBy: 'assistant', media: { contentType: 'video/mp4', byteSize: 1024, width: 1920, height: 1080, durationMs: 1000, hasAudio: true } };
  assert.deepEqual(operations.version.response.parse(contentVersion), contentVersion);
  assert.deepEqual(operations.confirmUpload.response.parse({ version: mediaVersion }), { version: mediaVersion });
  const page = { items: [contentVersion, mediaVersion], nextCursor: null };
  assert.deepEqual(operations.artifactVersions.response.parse(page), page);

  for (const content of [undefined, 'not-an-object']) {
    const result = operations.version.response.safeParse({ ...contentVersion, content });
    assert.equal(result.success, false);
    if (!result.success) assert.ok(result.error.issues.some((issue) => issue.code === 'invalid_type' && issue.path.join('.') === 'content'));
  }
  const malformedMedia = operations.confirmUpload.response.safeParse({ version: { ...mediaVersion, media: { ...mediaVersion.media, width: 'wide' } } });
  assert.equal(malformedMedia.success, false);
  if (!malformedMedia.success) assert.ok(malformedMedia.error.issues.some((issue) => issue.code === 'invalid_type' && issue.path.join('.') === 'version.media.width'));
  assert.equal(operations.version.response.safeParse({ ...mediaVersion, media: undefined }).success, false);
  assert.equal(operations.version.response.safeParse({ ...contentVersion, createdBy: 'system' }).success, false);

  for (const privateOrWrongBranch of [{ accountId: 'private-owner' }, { media: mediaVersion.media }]) {
    const result = operations.version.response.safeParse({ ...contentVersion, ...privateOrWrongBranch });
    assert.equal(result.success, false);
    if (!result.success) assert.ok(result.error.issues.some((issue) => issue.code === 'unrecognized_keys'));
  }
  assert.equal(operations.confirmUpload.response.safeParse({ version: { ...mediaVersion, content: contentVersion.content } }).success, false);
  const privateMedia = operations.confirmUpload.response.safeParse({ version: { ...mediaVersion, media: { ...mediaVersion.media, objectKey: 'private-storage-key' } } });
  assert.equal(privateMedia.success, false);
  if (!privateMedia.success) assert.ok(privateMedia.error.issues.some((issue) => issue.code === 'unrecognized_keys' && issue.path.join('.') === 'version.media'));
});

test('named unavailable boundaries authenticate before validation and have no ownership or mutation fiction', async () => {
  const calls: string[] = [];
  const denied = await unavailableApplication.saveVersion({}, async () => { calls.push('authenticate'); return { kind: 'unauthorized' }; });
  assert.equal(denied.error.code, 'unauthenticated');
  const malformed = await unavailableApplication.saveVersion({}, async () => ({ kind: 'verified', accountId: 'account' }));
  assert.equal(malformed.error.code, 'invalid_input');
  const unavailable = await unavailableApplication.saveVersion(save, async () => ({ kind: 'verified', accountId: 'account' }));
  assert.equal(unavailable.error.code, 'not_implemented');
  assert.equal((await unavailableApplication.saveVersion({}, async () => ({ kind: 'unavailable' }))).error.code, 'integration_failure');
  assert.deepEqual(calls, ['authenticate']);
  const bodies: Partial<Record<keyof typeof operations, unknown>> = {
    saveVersion: save.body,
    useVersion: { operationId, versionId: 'v', purpose: 'panel_image', shotId: 's', panelId: 'p' },
    editStoryboard: { operationId, baseVersionId: 'base-v', shots: [{ shotId: 's', order: 0, panels: [{ panelId: 'p', order: 0, references: ['reference-v'] }] }] },
    answerQuestion: { operationId, questionRevision: 2, optionId: 'approve' },
    requestUpload: { operationId, kind: 'image', filename: 'image.png', contentType: 'image/png', byteSize: 1024 },
    confirmUpload: { operationId }, cancelGeneration: { operationId }, createExport: { operationId, selectionRevision: 7 },
  };
  for (const name of Object.keys(operations) as (keyof typeof operations)[]) {
    const input = { params: name === 'library' ? {} : { id: 'exact-resource' }, query: {}, body: bodies[name] ?? {} };
    assert.equal(operations[name].request.safeParse(input).success, true, name);
    assert.equal((await unavailableApplication[name](input, async () => ({ kind: 'verified', accountId: 'account' }))).error.code, 'not_implemented', name);
  }
});
