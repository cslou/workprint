import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deliveryLabel } from '../../../src/storyboard/dialogue.js';

test('a dialogue line is labelled by who is heard: on screen, off screen, a scene character\'s voice-over, or narration', () => {
  const characters = new Set(['Mara']);
  assert.equal(deliveryLabel({ character: ' Mara ' }, characters), 'Mara');
  assert.equal(deliveryLabel({ character: 'Mara', delivery: 'off_screen' }, characters), 'Mara (off screen)');
  assert.equal(deliveryLabel({ character: ' Mara ', delivery: 'voice_over' }, characters), 'Mara (voice-over)');
  assert.equal(deliveryLabel({ character: 'Narrator', delivery: 'voice_over' }, characters), 'Narration');
});
