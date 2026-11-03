import { currentSheets, currentSubjects, mediaVersionName, sheetViewLabel, sheetViews, storyboardNames, workspaceMediaLabels } from '@workprint/contracts';
import type { OwnedWorkspace } from './workspace-reads.js';

type Version = OwnedWorkspace['assets'][number]['version'];
type State = 'Draft' | 'Ready';

/** One exact version the video uses, with the name a person would recognise and what it is used as. */
export type WorkspaceVersion = Readonly<{ name: string; use: string; state: State; version: Version; subjectId?: string | undefined }>;

const byOrder = <T extends { order: number }>(items: readonly T[]) => [...items].sort((a, b) => a.order - b.order);
/** A sheet subject's name is cut to this many characters in its version's name. */
const sheetNameLimit = 80;
const clipped = (text: string) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= sheetNameLimit ? flat : `${flat.slice(0, sheetNameLimit - 1)}…`;
};
/** The subject name a sheet's own content gives, when the script no longer names it. */
const ownSubjectName = (content: unknown): string => {
  const subject = content !== null && typeof content === 'object' ? (content as { subject?: unknown }).subject : undefined;
  const name = subject !== null && typeof subject === 'object' ? (subject as { name?: unknown }).name : undefined;
  return typeof name === 'string' ? name : '';
};

/**
 * Every exact version the video uses, in workspace order, each once under its first name: the script, the assets, the
 * generated videos, the storyboard, then each Shot's panel images and videos in story order. This is the only rule
 * for these names; the agent's listing and a panel's input labels both use it.
 */
export function workspaceVersions(workspace: OwnedWorkspace): WorkspaceVersion[] {
  const entries: WorkspaceVersion[] = [], seen = new Set<string>(), labels = workspaceMediaLabels(workspace), views = sheetViews(workspace);
  const sheetNames = new Map(currentSheets(workspace).map(sheet => [sheet.versionId, sheet.subjectName]));
  // An image is filed under a subject only while the script lists it, as in Assets; otherwise it is under Other.
  const listed = new Set(currentSubjects(workspace).map(subject => subject.id));
  const add = (entry: WorkspaceVersion) => { if (!seen.has(entry.version.id)) { seen.add(entry.version.id); entries.push(entry); } };
  const revision = (version: Version) => `Version ${version.revision}`;
  if (workspace.script) add({ name: `Script · ${revision(workspace.script.version)}`, use: 'script', state: workspace.script.state, version: workspace.script.version });
  for (const asset of workspace.assets) {
    const { version } = asset;
    // Uploaded and made media keep no filename, so they are named by kind and order, or by subject and view in a sheet
    // (the shared rule). A sheet is named by its subject's current script name.
    const subject = 'content' in version && version.kind === 'reference' ? sheetNames.get(version.id) ?? ownSubjectName(version.content) : '';
    add({ name: subject ? `${clipped(subject)} · ${revision(version)}` : mediaVersionName(labels, version, views), use: 'reference', state: asset.state, version, subjectId: asset.subjectId && listed.has(asset.subjectId) ? asset.subjectId : undefined });
  }
  for (const made of workspace.generatedVideos ?? []) add({ name: mediaVersionName(labels, made.version), use: 'generated video', state: made.state, version: made.version });
  if (workspace.storyboard.work) add({ name: `Storyboard · ${revision(workspace.storyboard.work.version)}`, use: 'storyboard', state: workspace.storyboard.work.state, version: workspace.storyboard.work.version });
  const names = storyboardNames(workspace.storyboard.shots);
  for (const shot of byOrder(workspace.storyboard.shots)) {
    for (const panel of byOrder(shot.panels)) {
      for (const version of panel.candidateImageVersions) add({ name: `${names.panel(shot.shotId, panel.panelId)} · ${revision(version)}`, use: 'panel image', state: panel.approvedImageVersionId === version.id ? 'Ready' : 'Draft', version });
    }
    for (const version of shot.candidateVideoVersions ?? []) add({ name: `${names.shot(shot.shotId)} · Video · ${revision(version)}`, use: 'shot video', state: shot.chosenVideoVersionId === version.id ? 'Ready' : 'Draft', version });
  }
  return entries;
}

/**
 * The workspace's name for any image version the video uses: its name in `workspaceVersions`, or, for a view a current
 * sheet still lists after that image's own use moved on, its subject and view. Undefined for an image it doesn't use.
 */
export function imageVersionNames(workspace: OwnedWorkspace): (versionId: string) => string | undefined {
  const names = new Map(workspaceVersions(workspace).map(entry => [entry.version.id, entry.name])), views = sheetViews(workspace);
  return versionId => {
    const view = views.get(versionId);
    return names.get(versionId) ?? (view ? sheetViewLabel(view) : undefined);
  };
}
