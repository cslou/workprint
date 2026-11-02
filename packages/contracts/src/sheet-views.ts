import { savedReferenceContentSchema, savedScriptContentSchema } from './saved-content.js';
import { scriptSubjects, type ScriptSubject } from './script-subjects.js';

type VersionLike = Readonly<{ id: string; artifactId: string; kind: string; content?: unknown }>;
type WorkspaceLike = Readonly<{ script: Readonly<{ version: VersionLike }> | null; assets: readonly Readonly<{ version: VersionLike }>[] }>;

/** A sheet the video currently uses, with its subject's current name: the script's name when the script lists it. */
export type CurrentSheet = Readonly<{ versionId: string; artifactId: string; subjectId: string; subjectName: string; views: readonly Readonly<{ versionId: string; view: string; notes: readonly string[] }>[] }>;
/** The sheet an image version is in, and its view there. */
export type SheetViewName = Readonly<{ sheetArtifactId: string; sheetVersionId: string; subjectId: string; subjectName: string; view: string }>;

/** The current script's subjects in Assets order; none when the video has no script or it doesn't parse. */
export function currentSubjects(workspace: Pick<WorkspaceLike, 'script'>): ScriptSubject[] {
  const script = workspace.script && 'content' in workspace.script.version ? savedScriptContentSchema.safeParse(workspace.script.version.content) : null;
  return script?.success ? scriptSubjects(script.data) : [];
}

/** The video's current sheets in workspace order. A sheet whose content doesn't parse is not a sheet. */
export function currentSheets(workspace: WorkspaceLike): CurrentSheet[] {
  const names = new Map(currentSubjects(workspace).map(subject => [subject.id, subject.name]));
  return workspace.assets.flatMap(({ version }) => {
    if (version.kind !== 'reference' || !('content' in version)) return [];
    const sheet = savedReferenceContentSchema.safeParse(version.content);
    if (!sheet.success) return [];
    const { subject, references } = sheet.data;
    return [{ versionId: version.id, artifactId: version.artifactId, subjectId: subject.id, subjectName: names.get(subject.id) ?? subject.name, views: references }];
  });
}

/**
 * Each image version a current sheet lists, with that sheet's subject and the view as stored. When people's sheets
 * share an image, the first sheet in workspace order claims it. Assets, the chat and the agent name sheet images by this.
 */
export function sheetViews(workspace: WorkspaceLike): ReadonlyMap<string, SheetViewName> {
  const views = new Map<string, SheetViewName>();
  for (const sheet of currentSheets(workspace)) {
    for (const { versionId, view } of sheet.views) {
      if (!views.has(versionId)) views.set(versionId, { sheetArtifactId: sheet.artifactId, sheetVersionId: sheet.versionId, subjectId: sheet.subjectId, subjectName: sheet.subjectName, view });
    }
  }
  return views;
}
