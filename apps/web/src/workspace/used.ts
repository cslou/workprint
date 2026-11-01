import { savedStoryboardContentSchema, type OperationResponse, type Version } from '@workprint/contracts';

/** Merge a confirmed exact-use receipt only; never refresh unrelated workspace/editor state. */
export function applyUsedVersion(workspace: OperationResponse<'workspace'>, result: OperationResponse<'useVersion'>, version: Version): OperationResponse<'workspace'> {
  const use = result.use;
  if (use.versionId !== version.id || use.state !== 'approved') return workspace;
  const work = { version, use, state: 'Ready' as const }, selectionRevision = Math.max(workspace.selectionRevision, result.selectionRevision);
  if (use.binding.purpose === 'script' && version.kind === 'script') return { ...workspace, script: work, selectionRevision };
  if (use.binding.purpose === 'reference') {
    const found = workspace.assets.some(item => item.use?.id === use.id);
    return { ...workspace, assets: found ? workspace.assets.map(item => item.use?.id === use.id ? work : item) : [...workspace.assets, work], selectionRevision };
  }
  if (use.binding.purpose === 'storyboard' && version.kind === 'storyboard') {
    const parsed = savedStoryboardContentSchema.safeParse(version.content);
    if (!parsed.success) return workspace;
    // The current backend supports planning reuse only, not Panel/Shot decisions.
    const shots = parsed.data.shots.map(shot => ({ ...shot, panels: shot.panels.map(panel => ({ ...panel, candidateImageVersions: [], approvedImageVersionId: null })), chosenVideoVersionId: null }));
    return { ...workspace, storyboard: { work, shots }, selectionRevision };
  }
  return workspace;
}
