import assert from 'node:assert/strict';
import type { WorkflowRun } from '@mastra/core/storage';
import test from 'node:test';
import { cancelNativeWorkflow, confirmedWorkflowOutcome, NativeCancellationUnconfirmed } from './native-workflow-outcome.js';

const identity = { runId: 'exact-native-run', workflowName: 'exact-native-workflow', resourceId: 'verified-resource' };
const row = (status: string): WorkflowRun => ({ ...identity, snapshot: JSON.stringify({ status }), createdAt: new Date(0), updatedAt: new Date(0) });
const unconfirmed = (error: unknown) => error instanceof NativeCancellationUnconfirmed && error.code === 'native_cancellation_unconfirmed';

test('native cancellation confirms each actual persisted terminal outcome without inventing canceled', async () => {
  for (const status of ['success', 'failed', 'canceled', 'tripwire', 'bailed']) {
    const saved = row(status); let requests = 0;
    assert.equal(await cancelNativeWorkflow(identity, async () => { requests++; }, async () => saved), saved);
    assert.equal(requests, 1);
  }
});

test('missing, nonterminal, malformed or mismatched native outcomes are typed unconfirmed failures', async () => {
  const invalid = [null, ...['pending', 'running', 'waiting', 'suspended', 'paused'].map(row),
    { ...row('canceled'), runId: 'another-run' }, { ...row('canceled'), workflowName: 'another-workflow' },
    { ...row('canceled'), resourceId: 'another-resource' }, { ...row('canceled'), snapshot: '{malformed' }];
  for (const saved of invalid) await assert.rejects(cancelNativeWorkflow(identity, async () => {}, async () => saved), unconfirmed);
  await assert.rejects(confirmedWorkflowOutcome({ ...identity, resourceId: undefined }, async () => row('canceled')), unconfirmed);
});

test('native request/read errors preserve uncertainty unless an actual terminal outcome is available', async () => {
  const failure = async () => { throw new Error('Controlled native persistence failure'); };
  await assert.rejects(cancelNativeWorkflow(identity, failure, async () => row('suspended')), unconfirmed);
  await assert.rejects(cancelNativeWorkflow(identity, async () => {}, failure), unconfirmed);
  const saved = row('success');
  assert.equal(await cancelNativeWorkflow(identity, failure, async () => saved), saved, 'Concurrent saved completion is reported as itself, not cancellation');
});
