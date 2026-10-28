import { createRoot } from 'react-dom/client';
import { versionSchema } from '@workprint/contracts';
import type { Version } from '@workprint/contracts';
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
(window as unknown as { versionTest: unknown }).versionTest = {
  configure(input: { apiOrigin?: string; token?: string | null; accountId?: string; conversationId?: string; version?: Version; field?: string; review?: boolean }) {
    token = input.token ?? null;
    if (input.apiOrigin !== undefined) connection = createBrowserClient(input.apiOrigin, async () => token);
    const scope = { accountId: input.accountId ?? 'read-only-account', conversationId: input.conversationId ?? 'read-only-conversation' };
    const current = input.version ?? version;
    const editor = (value: Version) => <VersionEditor connection={connection} scope={scope} version={value} field={input.field ?? 'synopsis'} label="What happens" />;
    const earlier = versionSchema.parse({ ...version, id: 'script-v6', revision: 6, content: { synopsis: 'Earlier Script text.', retained: 'Earlier unrelated field.' } });
    root.render(<div className="wp-panel-body" style={{ width: 380 }}>{input.review ? <VersionReview connection={connection} scope={scope} version={current} binding={{ purpose: 'script' }} currentUse={{ id: 'use-current', versionId: current.id, state: 'approved', binding: { purpose: 'script' } }} selectionRevision={9} historyPrerequisite={[earlier]}>{editor}</VersionReview> : editor(current)}</div>);
  },
  unmount() { root.render(null); },
};
