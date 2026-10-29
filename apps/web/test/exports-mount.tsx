import { createRoot } from 'react-dom/client';
import type { OperationResponse } from '@workprint/contracts';
import { createBrowserClient, type BrowserClient } from '../src/api/client.js';
import { Exports, ExportHistory } from '../src/exports/exports.js';
import { ExportDetails, ExportDownload } from '../src/exports/record.js';
import { WorkspaceVideos } from '../src/shell/workspace-videos.js';
import { WorkspacePanel } from '../src/ui/panel.js';
import { ViewerDialog } from '../src/ui/overlays.js';
import { Button } from '../src/ui/controls.js';
import { exportRecords, exportVideo, exportWorkspace } from './export-fixtures.js';
import { loadReference } from './reference-loader.js';
import '../src/ui/tokens.css';
import '../src/ui/foundations.css';

await loadReference('flow2-step1-r73.html');
const node = document.querySelector('.panel');
if (!node) throw new Error('Missing Export test root');
const root = createRoot(node);
const style = document.createElement('style');
style.textContent = ':root{--font-sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--font-display:Georgia,"Times New Roman",serif}b,strong{font-weight:600}';
document.head.append(style);
type Input = { apiOrigin?: string; token?: string | null; accountId?: string; conversationId?: string; mode?: 'videos' | 'entry' | 'history' | 'detail' | 'download'; dialogTitle?: string; prerequisites?: boolean; uncancellableReads?: boolean; recordId?: string; workspace?: OperationResponse<'workspace'> };
let token: string | null = null, origin: string | undefined, connection: BrowserClient = { kind: 'missing' }, generation = 0;
let current: Input = {};
let uncancellable = false;
function configure(input: Input) {
  current = input; token = input.token ?? null;
  if (input.apiOrigin !== origin || !!input.uncancellableReads !== uncancellable) {
    origin = input.apiOrigin; uncancellable = !!input.uncancellableReads;
    connection = origin ? createBrowserClient(origin, async () => token) : { kind: 'missing' };
    if (uncancellable && connection.kind === 'configured') {
      // Test-only controlled races deliberately let HTTP reads finish after cleanup.
      const client = connection.client;
      connection = { kind: 'configured', client: { ...client, exports: input => client.exports(input), export: input => client.export(input) } };
    }
  }
  const scope = { accountId: input.accountId ?? 'account-a', conversationId: input.conversationId ?? 'conversation-a' };
  const workspace = input.workspace ?? exportWorkspace;
  const props = { connection, scope, workspace, versions: [exportVideo] };
  const records = input.prerequisites ? exportRecords : undefined;
  const content = input.mode === 'history' ? <ExportHistory {...props} {...(records ? { prerequisites: records } : {})} />
    : input.mode === 'detail' ? <ExportDetails {...props} id={input.recordId ?? 'export-exact'} {...(records ? { prerequisite: records.find(record => record.id === (input.recordId ?? 'export-exact'))! } : {})} />
    : input.mode === 'download' ? <ExportDownload connection={connection} scope={scope} versionId="output-exact" />
    : input.mode === 'entry' ? <Exports {...props} selectionRevision={workspace.selectionRevision} {...(records ? { prerequisites: records } : {})} />
    : <WorkspaceVideos connection={connection} scope={scope} workspace={workspace} videoPrerequisites={{ versions: [exportVideo] }} {...(records ? { exportPrerequisites: records } : {})} />;
  root.render(<WorkspacePanel key={generation} selectedKey="videos" content={{ videos: input.dialogTitle ? <ViewerDialog title={input.dialogTitle} trigger={<Button>Open dialog</Button>}>{content}</ViewerDialog> : content }} />);
}
(window as unknown as { exportsTest: unknown }).exportsTest = { configure, unmount() { root.render(null); }, remount() { generation++; configure(current); } };
