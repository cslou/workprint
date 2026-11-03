import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deliveryLabel } from '../../../src/workspace/projection.js';


test('a dialogue line is labelled by who is heard: on screen, off screen, a scene character\'s voice-over, or narration', () => {
  const characters = new Set(['Mara']);
  assert.equal(deliveryLabel({ character: ' Mara ', text: 'You came.' }, characters), 'Mara');
  assert.equal(deliveryLabel({ character: 'Mara', text: 'Wait.', delivery: 'off_screen' }, characters), 'Mara (off screen)');
  assert.equal(deliveryLabel({ character: 'Mara', text: 'I knew.', delivery: 'voice_over' }, characters), 'Mara (voice-over)');
  assert.equal(deliveryLabel({ character: 'Narrator', text: 'Years passed.', delivery: 'voice_over' }, characters), 'Narration');
});

