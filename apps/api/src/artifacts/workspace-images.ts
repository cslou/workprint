import type { OperationResponse } from '@workprint/contracts';

/** Image versions the video uses, in any use state: its images and every Panel's candidate images. */
export function usedImageVersions(workspace: OperationResponse<'workspace'>): Set<string> {
  const versions = [...workspace.assets.map(asset => asset.version), ...workspace.storyboard.shots.flatMap(shot => shot.panels.flatMap(panel => panel.candidateImageVersions))];
  return new Set(versions.filter(version => version.kind === 'image').map(version => version.id));
}
