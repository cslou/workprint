import { appendFile, readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { recoveryBoundary } from './native-recovery-store.js';

export type RecoveryEvent = { kind: string; runId: string; inserted?: number | null; phase?: string; pid?: number };
export type RecoveryInstrumentation = {
  event: (value: RecoveryEvent) => Promise<void>;
  barrier: (phase: string, runId: string, signal?: AbortSignal) => Promise<void>;
};

/** Trusted local barrier inputs, never native status/ownership or production environment controls. */
export function recoveryInstrumentation(control: string, events: string): RecoveryInstrumentation {
  const schema = z.object({ phase: z.union([recoveryBoundary, z.literal('released')]) }).strict();
  const phase = async () => schema.parse(JSON.parse(await readFile(control, 'utf8')) as unknown).phase;
  const event = (value: RecoveryEvent) => appendFile(events, JSON.stringify({ ...value, pid: process.pid }) + '\n');
  return { event, barrier: async (wanted, runId, signal) => {
    if (await phase() !== wanted) return;
    await event({ kind: 'barrier', phase: wanted, runId });
    const deadline = performance.now() + 5000;
    while (await phase() === wanted) {
      if (signal?.aborted) throw new Error('Recovery fixture barrier canceled');
      if (performance.now() >= deadline) throw new Error('Recovery fixture barrier wait exceeded');
      await delay(10);
    }
  } };
}
