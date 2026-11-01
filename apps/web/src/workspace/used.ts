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
    // Panel/Shot decisions are bound by Shot/Panel identity, so the server keeps them for identities the new plan retains.
    const known = new Map(workspace.storyboard.shots.map(shot => [shot.shotId, shot]));
    const shots = parsed.data.shots.map(shot => {
      const previous = known.get(shot.shotId);
      return { ...shot, panels: shot.panels.map(panel => {
        const kept = previous?.panels.find(item => item.panelId === panel.panelId);
        return { ...panel, candidateImageVersions: kept?.candidateImageVersions ?? [], approvedImageVersionId: kept?.approvedImageVersionId ?? null };
      }), chosenVideoVersionId: previous?.chosenVideoVersionId ?? null, ...(previous?.candidateVideoVersions ? { candidateVideoVersions: previous.candidateVideoVersions } : {}) };
    });
    return { ...workspace, storyboard: { work, shots }, selectionRevision };
  }
  const binding = use.binding;
  const include = (versions: readonly Version[]) => versions.some(item => item.id === version.id) ? [...versions] : [...versions, version];
  if (binding.purpose === 'shot_video' && version.kind === 'video') {
    const shots = workspace.storyboard.shots.map(shot => shot.shotId !== binding.shotId ? shot : { ...shot, chosenVideoVersionId: version.id, candidateVideoVersions: include(shot.candidateVideoVersions ?? []) });
    return { ...workspace, storyboard: { ...workspace.storyboard, shots }, selectionRevision };
  }
  if (binding.purpose === 'panel_image' && version.kind === 'image') {
    const shots = workspace.storyboard.shots.map(shot => shot.shotId !== binding.shotId ? shot : { ...shot, panels: shot.panels.map(panel => panel.panelId !== binding.panelId ? panel : { ...panel, approvedImageVersionId: version.id, candidateImageVersions: include(panel.candidateImageVersions) }) });
    return { ...workspace, storyboard: { ...workspace.storyboard, shots }, selectionRevision };
  }
  return workspace;
}
