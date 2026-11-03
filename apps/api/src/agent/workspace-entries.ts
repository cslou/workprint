import { currentPanelImage, currentSheets, mediaVersionName, savedScriptContentSchema, scriptSubjects, sheetViews, workspaceMediaLabels, type ScriptSubject, type Version as SavedVersion } from '@workprint/contracts';
import { workspaceVersions, type OwnedWorkspace } from '../application/index.js';

type Version = OwnedWorkspace['assets'][number]['version'];
type State = 'Draft' | 'Ready';

/** Listing bounds (Sprint 006 Story 3): item count, serialized UTF-8 bytes, and characters per text field. */
export const listingBounds = Object.freeze({ items: 50, bytes: 16 * 1024, text: 200 });

/** One exact saved version the video uses, as the model sees it in a listing; `subjectId` is the subject an image is filed under. */
export type WorkspaceItem = { name: string; kind: Version['kind']; versionId: string; use: string; state: State; text: string; subjectId?: string };
export type WorkspaceListing = { items: WorkspaceItem[]; total: number; truncated: boolean };
/** One item in full: the exact version's saved content, or its media facts. */
export type WorkspaceItemDetail = { name: string; kind: Version['kind']; versionId: string; revision: number; use: string; state: State } & ({ content: unknown } | { media: unknown });

const clip = (text: string, limit: number = listingBounds.text) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`;
};
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const strings = (value: unknown): string => typeof value === 'string' ? value : '';

/** Short text for a listing: what the saved version says, never its full content. */
function summary(version: Version): string {
  if ('media' in version) {
    const { contentType, width, height, durationMs } = version.media;
    return clip(`${contentType}, ${width}×${height}${durationMs !== undefined ? `, ${Math.round(durationMs / 100) / 10} s` : ''}`);
  }
  const content = record(version.content);
  if (version.kind === 'reference') {
    const subject = record(content.subject);
    return clip(`${strings(subject.kind)}: ${strings(subject.name)}. ${strings(subject.description)}`);
  }
  if (version.kind === 'storyboard') {
    const shots = list(content.shots).map(record);
    return clip(`${shots.length} shot${shots.length === 1 ? '' : 's'}: ${shots.map(shot => strings(shot.intent)).join('; ')}`);
  }
  const scene = record(list(content.scenes)[0]);
  const heading = record(scene.heading);
  const lines = list(scene.script).map(record).map(line => line.action !== undefined ? strings(line.action) : `${strings(record(line.dialogue).character)}: ${strings(record(line.dialogue).text)}`);
  return clip([`${strings(heading.setting)} ${strings(heading.location)} - ${strings(heading.time)}`, ...lines].join(' '));
}

/**
 * A script subject as the model sees it, with its current sheet's version id and views when it has one. Past the
 * subjects' byte share a sheet gives its version id only, or nothing; it is then an item, and item mode gives its views.
 */
export type WorkspaceSubject = ScriptSubject & { sheet?: { versionId: string; views?: { view: string; versionId: string }[] } };

/** The share of the listing's byte bound the whole subject list may take with its sheets, so items still fit beside it. */
const subjectBytes = listingBounds.bytes * 5 / 8;
const bytesOf = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

/**
 * The video's subjects from its current script, in Assets order, each with its first current sheet; none without a
 * script. Subjects themselves are always listed; sheets are added in order while the list stays within its share.
 */
export function workspaceSubjects(workspace: OwnedWorkspace): WorkspaceSubject[] {
  const content = workspace.script ? savedScriptContentSchema.safeParse('content' in workspace.script.version ? workspace.script.version.content : null) : null;
  const sheets = currentSheets(workspace), subjects: WorkspaceSubject[] = content?.success ? scriptSubjects(content.data) : [];
  let bytes = bytesOf(subjects);
  return subjects.map(subject => {
    const sheet = sheets.find(candidate => candidate.subjectId === subject.id);
    if (!sheet) return subject;
    const full = { versionId: sheet.versionId, views: sheet.views.map(({ view, versionId }) => ({ view, versionId })) }, short = { versionId: sheet.versionId };
    // `,"sheet":` joins each sheet to its subject.
    for (const listed of [full, short]) {
      const added = bytesOf(listed) + 9;
      if (bytes + added <= subjectBytes) { bytes += added; return { ...subject, sheet: listed }; }
    }
    return subject;
  });
}

/** The image versions listed as views under the subjects, which the listing then leaves out of its items. */
export const subjectViewIds = (subjects: readonly WorkspaceSubject[]): ReadonlySet<string> => new Set(subjects.flatMap(subject => subject.sheet?.views?.map(view => view.versionId) ?? []));

/**
 * A storyboard Shot as the model sees it in a listing. It never has the Shot's action, dialogue, camera note or
 * reference purposes, and long text is clipped: item mode on the storyboard gives those.
 */
export type ListedShot = {
  shotId: string; intent?: string; framing?: string; durationS?: number; references?: { subjectId: string; role: string }[];
  panels?: { panelId: string; description: string; imageVersionId?: string }[];
};
/**
 * The current storyboard, listed once: its version and its Shots in order. `detail` says what each Shot gives: `panels`
 * (ids, text, references and panels), `intents` or `ids`; `truncated` says panels or Shots were left out.
 */
export type WorkspaceStoryboard = { name: string; versionId: string; state: State; detail: 'panels' | 'intents' | 'ids'; truncated: boolean; shots: ListedShot[] };

/** What the storyboard always leaves of the listing's byte bound for the items beside it. */
const itemReserve = listingBounds.bytes / 8;

const byOrder = <T extends { order: number }>(items: readonly T[]) => [...items].sort((a, b) => a.order - b.order);

/**
 * The video's storyboard within the listing's byte bound, beside the rest of `envelope` and a reserve for items: each
 * Shot with its id, intent, framing, length, subject references and panels (id, description and current image); when that
 * doesn't fit, Shot ids and intents; then Shot ids; then the first Shot ids that fit. Undefined with no storyboard.
 */
export function workspaceStoryboard(workspace: OwnedWorkspace, envelope: Readonly<Record<string, unknown>> = {}): WorkspaceStoryboard | undefined {
  // `,"storyboard":` joins it to the envelope.
  const budget = listingBounds.bytes - itemReserve - bytesOf(envelope) - 14;
  const work = workspace.storyboard.work;
  if (!work) return undefined;
  const shots = byOrder(workspace.storyboard.shots);
  const intent = (shot: typeof shots[number]) => shot.intent ? { intent: clip(shot.intent) } : {};
  const full: ListedShot[] = shots.map(shot => ({
    shotId: shot.shotId, ...intent(shot), ...(shot.framing ? { framing: clip(shot.framing) } : {}), ...(shot.durationS !== undefined ? { durationS: shot.durationS } : {}),
    ...(shot.references?.length ? { references: shot.references.map(({ subjectId, role }) => ({ subjectId, role })) } : {}),
    panels: byOrder(shot.panels).map(panel => { const image = currentPanelImage(panel); return { panelId: panel.panelId, description: clip(panel.description), ...(image ? { imageVersionId: image.id } : {}) }; }),
  }));
  const head = { name: `Storyboard · Version ${work.version.revision}`, versionId: work.version.id, state: work.state };
  const steps: [WorkspaceStoryboard['detail'], ListedShot[]][] = [['panels', full], ['intents', shots.map(shot => ({ shotId: shot.shotId, ...intent(shot) }))], ['ids', shots.map(shot => ({ shotId: shot.shotId }))]];
  for (const [detail, listed] of steps) {
    const candidate: WorkspaceStoryboard = { ...head, detail, truncated: detail !== 'panels', shots: listed };
    if (bytesOf(candidate) <= budget) return candidate;
  }
  const fitted: WorkspaceStoryboard = { ...head, detail: 'ids', truncated: true, shots: [] };
  for (const shot of shots) {
    if (bytesOf({ ...fitted, shots: [...fitted.shots, { shotId: shot.shotId }] }) > budget) break;
    fitted.shots.push({ shotId: shot.shotId });
  }
  return fitted;
}

/**
 * A compact listing within the item, byte and text bounds; `truncated` says items were left out.
 * The byte bound covers the whole tool result the model receives, including its envelope.
 */
export function listWorkspace(workspace: OwnedWorkspace, envelope: Readonly<Record<string, unknown>> = {}, listedViews: ReadonlySet<string> = new Set(), listedStoryboard?: string): WorkspaceListing {
  // Images listed as views under a subject, and a storyboard listed on its own, are not listed again as items; item
  // mode still reads them.
  const entries = workspaceVersions(workspace).filter(entry => !(entry.use === 'reference' && entry.version.kind === 'image' && listedViews.has(entry.version.id))
    && !(entry.use === 'storyboard' && entry.version.id === listedStoryboard));
  const listing: WorkspaceListing = { items: [], total: entries.length, truncated: false };
  for (const entry of entries) {
    const item: WorkspaceItem = { name: clip(entry.name), kind: entry.version.kind, versionId: entry.version.id, use: entry.use, state: entry.state, text: summary(entry.version), ...(entry.subjectId ? { subjectId: entry.subjectId } : {}) };
    const next = { ...listing, items: [...listing.items, item], truncated: true };
    if (listing.items.length >= listingBounds.items || Buffer.byteLength(JSON.stringify({ ...envelope, ...next })) > listingBounds.bytes) { listing.truncated = true; break; }
    listing.items.push(item);
  }
  return listing;
}

/** A sheet's image read on its own, named by its subject and view: one whose own use moved on to a later version. */
export function sheetViewItem(workspace: OwnedWorkspace, version: SavedVersion): WorkspaceItemDetail | null {
  if (version.kind !== 'image' || !('media' in version)) return null;
  const views = sheetViews(workspace);
  if (!views.has(version.id)) return null;
  return { name: mediaVersionName(workspaceMediaLabels(workspace), version, views), kind: version.kind, versionId: version.id, revision: version.revision, use: 'sheet view', state: 'Draft', media: version.media };
}

/** One item in full, only when the video uses that exact version. */
export function workspaceItem(workspace: OwnedWorkspace, versionId: string): WorkspaceItemDetail | null {
  const entry = workspaceVersions(workspace).find(candidate => candidate.version.id === versionId);
  if (!entry) return null;
  const { version } = entry;
  const base = { name: entry.name, kind: version.kind, versionId: version.id, revision: version.revision, use: entry.use, state: entry.state };
  return 'media' in version ? { ...base, media: version.media } : { ...base, content: version.content };
}
