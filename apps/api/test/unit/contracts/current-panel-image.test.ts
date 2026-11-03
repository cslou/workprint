import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentPanelImage, type PanelImages } from '@workprint/contracts';

type Version = PanelImages['candidateImageVersions'][number];
const image = (id: string, createdBy: 'human' | 'assistant', revision: number, createdAt: string): Version => ({ id, artifactId: `artifact-${createdBy}`, revision, createdBy, createdAt, dependencies: [], kind: 'image', media: { contentType: 'image/png', byteSize: 10, width: 64, height: 36 } });
const person = image('sheet-view', 'human', 1, '2026-11-03T10:00:00.000Z');
const first = image('panel-v1', 'assistant', 1, '2026-11-03T10:01:00.000Z'), second = image('panel-v2', 'assistant', 2, '2026-11-03T10:02:00.000Z');

test('a panel\'s current image is the one a person chose, else the assistant\'s latest version, else none', () => {
  assert.equal(currentPanelImage({ candidateImageVersions: [person, second, first], approvedImageVersionId: person.id })?.id, 'sheet-view', 'a person\'s choice beats the assistant\'s');
  assert.equal(currentPanelImage({ candidateImageVersions: [first, second], approvedImageVersionId: first.id })?.id, 'panel-v1', 'a chosen assistant version stays current after a newer one');
  assert.equal(currentPanelImage({ candidateImageVersions: [person, second, first], approvedImageVersionId: null })?.id, 'panel-v2', 'with no choice, the assistant\'s latest; a person\'s unchosen image is not current');
  assert.equal(currentPanelImage({ candidateImageVersions: [person], approvedImageVersionId: null }), null);
  assert.equal(currentPanelImage({ candidateImageVersions: [], approvedImageVersionId: null }), null);
});
