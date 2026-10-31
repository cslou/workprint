import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import type { NativeControlState } from './native-control-provider.js';
import { nativeTurnFixture, releasedNativeFixture } from './native-turn-fixture.js';

export async function nativeControlFixture() {
  const fixture = await nativeTurnFixture({ control: true });
  const state = async (): Promise<NativeControlState> => {
    const response = await fixture.request('/turn-test/control'); assert.equal(response.status, 200);
    const value = await response.json() as NativeControlState;
    for (const key of ['calls', 'active', 'listeners', 'timers', 'metadataObservers', 'streamSubscriptions', 'held', 'heldListeners'] as const) assert.ok(Number.isSafeInteger(value[key]) && value[key] >= 0);
    assert.ok(Array.isArray(value.providerGates) && Array.isArray(value.activeRuns) && Array.isArray(value.aborts)); return value;
  };
  const control = async (body: unknown) => { assert.equal((await fixture.request('/turn-test/control', body)).status, 200); };
  const wait = async (predicate: (value: NativeControlState) => boolean, milliseconds = 5000) => {
    const end = performance.now() + milliseconds;
    for (;;) { const value = await state(); if (predicate(value)) return value; if (performance.now() >= end) throw new Error('Native control state independent watchdog exceeded'); await delay(15); }
  };
  const released = async () => {
    await releasedNativeFixture(fixture);
    return wait(value => !value.active && !value.listeners && !value.timers && !value.held && !value.heldListeners && !value.metadataObservers && !value.streamSubscriptions && !value.observers && !value.pumps && !value.activeRuns.length, 5000);
  };
  return { ...fixture, state, control, wait, released,
    release: (id: number) => control({ release: id }),
    barrier: (barrier: 'stop' | 'observe' | 'metadata') => control({ barrier }),
    unblock: () => control({ releaseTransport: true }),
  };
}
export type NativeControlFixture = Awaited<ReturnType<typeof nativeControlFixture>>;

export async function settleNativeControl(fixture: NativeControlFixture) {
  await fixture.unblock();
  const until = performance.now() + 8500;
  for (;;) {
    const state = await fixture.state();
    for (const id of state.providerGates) await fixture.release(id);
    if (!state.active && !state.activeRuns.length && await fixture.nativeRuns() === 0) return;
    if (performance.now() > until) throw new Error('Held native work must settle');
    await delay(20);
  }
}

export async function withinFiveSeconds<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Native control independent five-second watchdog exceeded')), 5000); })]); }
  finally { clearTimeout(timer); }
}
