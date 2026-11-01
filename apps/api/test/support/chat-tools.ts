import { z } from 'zod';
import type { AgentTool } from '../../src/agent/index.js';

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
      id: 'test-gated', description: 'A test tool that waits until the test releases it.',
      inputSchema: z.strictObject({}),
      phrase: 'Running the gated test tool…', doneSummary: () => 'Gated tool released',
      execute: async (_input, { signal }) => {
        const response = await fetch(gateUrl, { signal });
        return { released: response.ok };
      },
    },
    {
      id: 'test-unphrased', description: 'A test tool with no activity phrase.',
      inputSchema: z.strictObject({}),
      execute: async () => ({ done: true }),
    },
  ];
}
