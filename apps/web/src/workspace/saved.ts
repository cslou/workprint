import { savedStoryboardContentSchema, type OperationResponse } from '@workprint/contracts';
type Workspace = OperationResponse<'workspace'>;
type Saved = OperationResponse<'saveVersion'>;
type Work = NonNullable<Workspace['script']>;
/** Apply a confirmed exact-use command result, never an inferred approval or selection. */
export function applySavedVersion(workspace: Workspace, result: Saved): Workspace {
  const use = result.use;
  if (!use || use.state !== 'approved' || use.versionId !== result.version.id) return workspace;
  const replace = (work: Work | null): Work | null => {
    if (!work?.use || work.use.id !== use.id || work.version.artifactId !== result.version.artifactId || work.version.kind !== result.version.kind || result.version.revision <= work.version.revision || JSON.stringify(work.use.binding) !== JSON.stringify(use.binding)) return work;
    return { version: result.version, use, state: 'Ready' };
  };
  const script = replace(workspace.script);
  const assets = workspace.assets.map(work => replace(work)!);
  const work = replace(workspace.storyboard.work);
  if (work === workspace.storyboard.work) return { ...workspace, script, assets };
  if (!work || work.version.kind !== 'storyboard') return workspace;
  const parsed = savedStoryboardContentSchema.safeParse(work.version.content);
  if (!parsed.success) return workspace;
  const layout = (shots: Workspace['storyboard']['shots']) => shots.map(shot => [shot.shotId, shot.order, shot.panels.map(panel => [panel.panelId, panel.order, panel.references])]);
  const rows = parsed.data.shots;
  if (JSON.stringify(layout(rows.map(shot => ({ ...shot, panels: shot.panels.map(panel => ({ ...panel, candidateImageVersions: [], approvedImageVersionId: null })), chosenVideoVersionId: null })))) !== JSON.stringify(layout(workspace.storyboard.shots))) return workspace;
  const shots = workspace.storyboard.shots.map(shot => {
    const next = rows.find(value => value.shotId === shot.shotId)!;
    return { ...shot, intent: next.intent, panels: shot.panels.map(panel => ({ ...panel, description: next.panels.find(value => value.panelId === panel.panelId)!.description })) };
  });
  return { ...workspace, script, assets, storyboard: { work, shots } };
}
