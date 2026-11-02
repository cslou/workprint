import { registerApiRoute } from '@mastra/core/server';
import { z } from 'zod';
import type { AgentTool } from '../../src/agent/index.js';

/** Test-only routes registered through the backend's route seam. `/test/slow` answers after 2 s. */
export function chatTestRoutes() {
  return [registerApiRoute('/test/slow', {
    method: 'GET',
    handler: async context => { await new Promise(resolve => setTimeout(resolve, 2000)); return context.json({ slow: true }); },
  })];
}

/**
 * Test-only tools registered through the turn composition seam. Production never registers these.
 * `gateUrl` is the scripted provider's `/gate`, which holds the gated tool until the test opens it.
 */
export function chatTestTools(gateUrl: string): AgentTool[] {
  return [
    {
      id: 'test-echo', description: 'Echo the given text back. Use it when asked to echo something.',
      inputSchema: z.strictObject({ text: z.string().max(200) }),
      phrase: 'Echoing your text…', doneSummary: () => 'Echoed',
      execute: async input => ({ echo: (input as { text: string }).text }),
    },
    {
      id: 'test-gated', description: 'A test tool that waits until the test releases it, and reports why it was stopped.',
      inputSchema: z.strictObject({}),
      phrase: 'Running the gated test tool…', doneSummary: () => 'Gated tool released',
      execute: async (_input, { signal, abortReason }) => {
        try {
          const response = await fetch(gateUrl, { signal });
          return { released: response.ok };
        } catch (error) {
          // Tell the test why the signal fired before the tool ends.
          if (signal.aborted) await fetch(`${gateUrl}/reason`, { method: 'POST', body: abortReason() ?? 'none', signal: AbortSignal.timeout(2000) }).catch(() => undefined);
          throw error;
        }
      },
    },
    {
      id: 'test-scope', description: 'Report the account and video this tool runs for.',
      inputSchema: z.strictObject({}),
      execute: async (_input, { scope }) => ({ accountId: scope.accountId, videoId: scope.videoId }),
    },
    {
      id: 'test-unphrased', description: 'A test tool with no activity phrase that, like test-gated, waits for the test.',
      inputSchema: z.strictObject({}),
      execute: async (_input, { signal }) => ({ done: (await fetch(gateUrl, { signal })).ok }),
    },
  ];
}
