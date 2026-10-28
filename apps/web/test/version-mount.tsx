import { createRoot } from 'react-dom/client';
import { versionSchema } from '@workprint/contracts';
import type { OperationResponse, Version } from '@workprint/contracts';
import type { ClientResult } from '@workprint/api-client';
import { VersionEditor } from '../src/versions/editor.js';
import { VersionReview } from '../src/versions/review.js';
import { createBrowserClient, type BrowserClient } from '../src/api/client.js';
import '../src/ui/tokens.css';
import '../src/ui/foundations.css';

// Labelled read-only version and explicit field mapping, not a domain content schema or saved work.
const version = versionSchema.parse({ id: 'script-v7', artifactId: 'script-example', revision: 7, kind: 'script', content: { synopsis: 'Mercer and Vale sit side by side on the gallery bench.', retained: 'Keep this unrelated field.' }, createdBy: 'human', createdAt: '2026-10-28T00:00:00Z', dependencies: ['reference-v1'] });
const node = document.getElementById('root');
if (!node) throw new Error('Missing version test root');
const root = createRoot(node);
let connection: BrowserClient = { kind: 'missing' };
let token: string | null = null;
// Controlled completions are confined to the explicitly labelled concurrent-Use race.
const pendingUses: { versionId: string; resolve(value: ClientResult<OperationResponse<'useVersion'>>): void }[] = [];
(window as unknown as { versionTest: unknown }).versionTest = {
  configure(input: { apiOrigin?: string; token?: string | null; accountId?: string; conversationId?: string; version?: Version; field?: string; review?: boolean; useRace?: boolean }) {
    token = input.token ?? null;
    if (input.apiOrigin !== undefined) connection = createBrowserClient(input.apiOrigin, async () => token);
    if (input.useRace && connection.kind === 'configured') connection = { kind: 'configured', client: { ...connection.client, useVersion(request) { return new Promise((resolve) => pendingUses.push({ versionId: request.body.versionId, resolve })); } } };
    const scope = { accountId: input.accountId ?? 'read-only-account', conversationId: input.conversationId ?? 'read-only-conversation' };
    const current = input.version ?? version;
    const editor = (value: Version) => <VersionEditor connection={connection} scope={scope} version={value} field={input.field ?? 'synopsis'} label="What happens" />;
    const earlier = versionSchema.parse({ ...version, id: 'script-v6', revision: 6, content: { synopsis: 'Earlier Script text.', retained: 'Earlier unrelated field.' } });
    root.render(<div className="wp-panel-body" style={{ width: 380 }}>{input.review ? <VersionReview connection={connection} scope={scope} version={current} binding={{ purpose: 'script' }} currentUse={{ id: 'use-current', versionId: current.id, state: 'approved', binding: { purpose: 'script' } }} selectionRevision={9} historyPrerequisite={input.useRace ? [earlier, versionSchema.parse({ ...earlier, id: 'script-v5', revision: 5 })] : [earlier]}>{editor}</VersionReview> : editor(current)}</div>);
  },
  pendingUses() { return pendingUses.map((value) => value.versionId); },
  resolveUses(order: readonly string[]) {
    for (const versionId of order) {
      const index = pendingUses.findIndex((value) => value.versionId === versionId);
      if (index < 0) throw new Error('Missing controlled Use completion');
      pendingUses.splice(index, 1)[0]!.resolve({ ok: true, value: { use: { id: `raced-${versionId}`, versionId, binding: { purpose: 'script' }, state: 'approved' }, selectionRevision: versionId === 'script-v5' ? 11 : 10 } });
    }
  },
  unmount() { root.render(null); },
};
