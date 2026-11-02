import assert from 'node:assert/strict';
import { test } from 'node:test';
import { atBottom, followsAfterScroll, followThreshold } from '../../../src/shell/follow-bottom.js';

const view = (scrollTop: number) => ({ scrollTop, scrollHeight: 2000, clientHeight: 800 });

test('the thread is at its end at the bottom and within one line of it, not further up', () => {
  assert.equal(atBottom(view(1200)), true, 'at the bottom');
  assert.equal(atBottom(view(1200 - followThreshold)), true, 'within one line');
  assert.equal(atBottom(view(1200 - followThreshold - 1)), false, 'scrolled up');
  assert.equal(atBottom({ scrollTop: 0, scrollHeight: 500, clientHeight: 800 }), true, 'a thread that does not scroll');
});

test('any scroll up leaves, and only moving down to the end, or reaching it, resumes', () => {
  assert.equal(followsAfterScroll(view(1190), 1200, true), false, 'a small scroll up, still within one line');
  assert.equal(followsAfterScroll(view(1200), 1200, true), true, 'the thread\'s own move to the end');
  assert.equal(followsAfterScroll(view(1180), 1100, false), true, 'scrolling down to within one line');
  assert.equal(followsAfterScroll(view(1100), 1000, false), false, 'scrolling down but still above the end');
  assert.equal(followsAfterScroll(view(1200), 1500, false), true, 'the end itself, even when a shorter thread moved it up');
  assert.equal(followsAfterScroll(view(1000), 1000, true), true, 'no movement keeps following');
});
