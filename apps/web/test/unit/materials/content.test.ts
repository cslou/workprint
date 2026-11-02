import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Version } from '@workprint/contracts';
import { savedMaterialPresentation } from '../../../src/materials/content.js';

const view = (n: number) => `3333333${n}-3333-4333-8333-333333333333`;
const sheet = (kind: string, name: string): Version => ({ id: 'v1', artifactId: 'artifact', kind: 'reference', revision: 1, createdBy: 'assistant', createdAt: '2026-11-03T00:00:00Z', dependencies: [view(1), view(2)],
  content: { schemaVersion: 1, subject: { id: 'subject', kind, name, description: 'Seen at night.', continuityNotes: ['Keep the light.'] }, references: [{ versionId: view(1), view: 'Wide master', notes: [] }, { versionId: view(2), view: 'Reverse angle', notes: [] }] } } as Version);

test('a sheet reads by its kind: a place, stored as environment, reads Place, and a prop reads Prop, with its views in order', () => {
  for (const [kind, label] of [['environment', 'Place'], ['prop', 'Prop'], ['character', 'Character']] as const) {
    const shown = savedMaterialPresentation(sheet(kind, 'The Gallery'));
    assert.equal(shown?.description, label, 'the row reads "<kind> sheet"');
    assert.equal(shown?.sheet?.kicker, label);
    assert.equal(shown?.sheet?.name, 'The Gallery');
    assert.deepEqual(shown?.sheet?.views, [{ versionId: view(1), view: 'Wide master' }, { versionId: view(2), view: 'Reverse angle' }]);
  }
});
