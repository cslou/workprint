import assert from 'node:assert/strict';
import { test } from 'node:test';
import { atBottom, followThreshold } from '../../../src/shell/follow-bottom.js';

const view = (scrollTop: number) => ({ scrollTop, scrollHeight: 2000, clientHeight: 800 });

test('the thread follows at the bottom and within one line of it, and stops once scrolled further up', () => {
  assert.equal(atBottom(view(1200)), true, 'at the bottom');
  assert.equal(atBottom(view(1200 - followThreshold)), true, 'within one line');
  assert.equal(atBottom(view(1200 - followThreshold - 1)), false, 'scrolled up');
  assert.equal(atBottom({ scrollTop: 0, scrollHeight: 500, clientHeight: 800 }), true, 'a thread that does not scroll');
});
