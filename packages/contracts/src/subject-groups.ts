import { currentSubjects, type ScriptSubject } from './script-subjects.js';
import { currentSheets, sheetViews } from './sheet-views.js';

type VersionLike = Readonly<{ id: string; artifactId: string; kind: string; content?: unknown }>;
type AssetLike = Readonly<{ version: VersionLike; subjectId?: string | undefined }>;

/**
 * One group in Assets: a script subject with its sheets and other work, or "Other" (`subject: null`) with everything
 * else. `items` are images, and in "Other" also videos and references that aren't sheets, in workspace order.
 */
export type SubjectGroup<A extends AssetLike> = Readonly<{ subject: ScriptSubject | null; sheets: A[]; items: A[]; empty: boolean }>;

/**
 * The video's assets grouped by script subject, in Assets order (characters, then places, then props), then "Other",
 * always last. A sheet goes to the subject its content names and an image to the subject its use is filed under, when
 * the script lists it; anything else is in "Other". A subject's first current sheet comes first, then any others.
 * An image's row is left out only when the version its use holds is listed by a current sheet: it shows in that sheet.
 * This is the one rule for Assets and the agent.
 */
export function subjectGroups<A extends AssetLike>(workspace: Readonly<{ script: Readonly<{ version: VersionLike }> | null; assets: readonly A[] }>): SubjectGroup<A>[] {
  const subjects = currentSubjects(workspace), views = sheetViews(workspace);
  const sheetSubjects = new Map(currentSheets(workspace).map(sheet => [sheet.versionId, sheet.subjectId]));
  const groups = new Map<string | null, { sheets: A[]; items: A[] }>();
  for (const id of [...subjects.map(subject => subject.id), null]) groups.set(id, { sheets: [], items: [] });
  const groupOf = (id: string | undefined) => groups.get(id !== undefined && groups.has(id) ? id : null)!;
  for (const asset of workspace.assets) {
    const sheetSubject = sheetSubjects.get(asset.version.id);
    if (sheetSubject !== undefined) groupOf(sheetSubject).sheets.push(asset);
    else if (asset.version.kind === 'image' && views.has(asset.version.id)) continue;
    else groupOf(asset.subjectId).items.push(asset);
  }
  return [...subjects, null].map(subject => {
    const { sheets, items } = groups.get(subject?.id ?? null)!;
    return { subject, sheets, items, empty: !sheets.length && !items.length };
  });
}
