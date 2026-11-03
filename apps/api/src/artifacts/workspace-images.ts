import { sheetViews, type OperationResponse } from '@workprint/contracts';

/**
 * Image versions the video uses, in any use state: its images, every Panel's candidate images, and every image a
 * current sheet lists, even when that image's own use has moved on to a later version.
 */
export function usedImageVersions(workspace: OperationResponse<'workspace'>): Set<string> {
  const versions = [...workspace.assets.map(asset => asset.version), ...workspace.storyboard.shots.flatMap(shot => shot.panels.flatMap(panel => panel.candidateImageVersions))];
  return new Set([...versions.filter(version => version.kind === 'image').map(version => version.id), ...sheetViews(workspace).keys()]);
}
