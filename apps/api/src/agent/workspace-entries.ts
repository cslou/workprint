import { currentSheets, mediaVersionName, savedScriptContentSchema, scriptSubjects, sheetViews, workspaceMediaLabels, type ScriptSubject, type Version as SavedVersion } from '@workprint/contracts';
import type { OwnedWorkspace } from '../application/index.js';

type Version = OwnedWorkspace['assets'][number]['version'];
type State = 'Draft' | 'Ready';

/** Listing bounds (Sprint 006 Story 3): item count, serialized UTF-8 bytes, and characters per text field. */
export const listingBounds = Object.freeze({ items: 50, bytes: 16 * 1024, text: 200 });

/** One exact saved version the video uses, as the model sees it in a listing. */
export type WorkspaceItem = { name: string; kind: Version['kind']; versionId: string; use: string; state: State; text: string };
export type WorkspaceListing = { items: WorkspaceItem[]; total: number; truncated: boolean };
/** One item in full: the exact version's saved content, or its media facts. */
export type WorkspaceItemDetail = { name: string; kind: Version['kind']; versionId: string; revision: number; use: string; state: State } & ({ content: unknown } | { media: unknown });

type Entry = { name: string; use: string; state: State; version: Version };

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
 * A script subject as the model sees it, with its current sheet's version id and views when it has one. A sheet past
 * the listing's share for subjects gives its version id only; item mode on it gives its views.
 */
export type WorkspaceSubject = ScriptSubject & { sheet?: { versionId: string; views?: { view: string; versionId: string }[] } };

/** The share of the listing's byte bound that subjects' sheet views may take, so items still fit beside them. */
const subjectViewBytes = listingBounds.bytes / 2;

/** The video's subjects from its current script, in Assets order, each with its first current sheet; none without a script. */
export function workspaceSubjects(workspace: OwnedWorkspace): WorkspaceSubject[] {
  const content = workspace.script ? savedScriptContentSchema.safeParse('content' in workspace.script.version ? workspace.script.version.content : null) : null;
  const sheets = currentSheets(workspace);
  let bytes = 0;
  return (content?.success ? scriptSubjects(content.data) : []).map(subject => {
    const sheet = sheets.find(candidate => candidate.subjectId === subject.id);
    if (!sheet) return subject;
    const views = sheet.views.map(({ view, versionId }) => ({ view, versionId }));
    bytes += Buffer.byteLength(JSON.stringify(views));
    return { ...subject, sheet: { versionId: sheet.versionId, ...(bytes <= subjectViewBytes ? { views } : {}) } };
  });
}

/** Every exact version the video uses, in workspace order, each once, with a name a person would recognise. */
export function workspaceEntries(workspace: OwnedWorkspace): Entry[] {
  const clips = workspace.generatedVideos ?? [];
  const entries: Entry[] = [], seen = new Set<string>(), labels = workspaceMediaLabels(workspace), views = sheetViews(workspace);
  const sheetNames = new Map(currentSheets(workspace).map(sheet => [sheet.versionId, sheet.subjectName]));
  const add = (entry: Entry) => { if (!seen.has(entry.version.id)) { seen.add(entry.version.id); entries.push(entry); } };
  const revision = (version: Version) => `Version ${version.revision}`;
  if (workspace.script) add({ name: `Script · ${revision(workspace.script.version)}`, use: 'script', state: workspace.script.state, version: workspace.script.version });
  for (const asset of workspace.assets) {
    const { version } = asset;
    // Uploaded and made media keep no filename, so they are named by kind and order, or by subject and view in a sheet
    // (the shared rule). A sheet is named by its subject's current script name.
    const subject = 'content' in version && version.kind === 'reference' ? sheetNames.get(version.id) ?? strings(record(record(version.content).subject).name) : '';
    add({ name: subject ? `${clip(subject, 80)} · ${revision(version)}` : mediaVersionName(labels, version, views), use: 'reference', state: asset.state, version });
  }
  for (const made of clips) add({ name: mediaVersionName(labels, made.version), use: 'generated video', state: made.state, version: made.version });
  if (workspace.storyboard.work) add({ name: `Storyboard · ${revision(workspace.storyboard.work.version)}`, use: 'storyboard', state: workspace.storyboard.work.state, version: workspace.storyboard.work.version });
  [...workspace.storyboard.shots].sort((a, b) => a.order - b.order).forEach((shot, shotIndex) => {
    const shotNumber = shotIndex + 1;
    [...shot.panels].sort((a, b) => a.order - b.order).forEach((panel, panelIndex) => {
      for (const version of panel.candidateImageVersions) add({ name: `Shot ${shotNumber} · Panel ${shotNumber}.${panelIndex + 1} · ${revision(version)}`, use: 'panel image', state: panel.approvedImageVersionId === version.id ? 'Ready' : 'Draft', version });
    });
    for (const version of shot.candidateVideoVersions ?? []) add({ name: `Shot ${shotNumber} · Video · ${revision(version)}`, use: 'shot video', state: shot.chosenVideoVersionId === version.id ? 'Ready' : 'Draft', version });
  });
  return entries;
}

/**
 * A compact listing within the item, byte and text bounds; `truncated` says items were left out.
 * The byte bound covers the whole tool result the model receives, including its envelope.
 */
export function listWorkspace(workspace: OwnedWorkspace, envelope: Readonly<Record<string, unknown>> = {}): WorkspaceListing {
  // A sheet's images are listed under its subject, not again as items; item mode still reads them.
  const views = sheetViews(workspace);
  const entries = workspaceEntries(workspace).filter(entry => !(entry.use === 'reference' && entry.version.kind === 'image' && views.has(entry.version.id)));
  const listing: WorkspaceListing = { items: [], total: entries.length, truncated: false };
  for (const entry of entries) {
    const item: WorkspaceItem = { name: clip(entry.name), kind: entry.version.kind, versionId: entry.version.id, use: entry.use, state: entry.state, text: summary(entry.version) };
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
  const entry = workspaceEntries(workspace).find(candidate => candidate.version.id === versionId);
  if (!entry) return null;
  const { version } = entry;
  const base = { name: entry.name, kind: version.kind, versionId: version.id, revision: version.revision, use: entry.use, state: entry.state };
  return 'media' in version ? { ...base, media: version.media } : { ...base, content: version.content };
}
