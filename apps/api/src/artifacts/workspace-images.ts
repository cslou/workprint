import { sheetViews, type OperationResponse } from '@workprint/contracts';

/**
 * Image versions the video uses, in any use state: its images, every Panel's candidate images, and every image a
 * current sheet lists, even when that image's own use has moved on to a later version.
 */
export function usedImageVersions(workspace: OperationResponse<'workspace'>): Set<string> {
  const versions = [...workspace.assets.map(asset => asset.version), ...workspace.storyboard.shots.flatMap(shot => shot.panels.flatMap(panel => panel.candidateImageVersions))];
  return new Set([...versions.filter(version => version.kind === 'image').map(version => version.id), ...sheetViews(workspace).keys()]);
}

/**
 * Video versions the video uses, with each one's saved length in milliseconds and size in bytes: its videos, its
 * generated clips and each Shot video version that still has a use (its chosen and its latest).
 */
export function usedVideoVersions(workspace: OperationResponse<'workspace'>): Map<string, Readonly<{ durationMs: number; byteSize: number }>> {
  const versions = [...workspace.assets, ...(workspace.generatedVideos ?? [])].map(item => item.version).concat(workspace.storyboard.shots.flatMap(shot => shot.candidateVideoVersions ?? []));
  return new Map(versions.flatMap(version => version.kind === 'video' ? [[version.id, { durationMs: version.media.durationMs ?? 0, byteSize: version.media.byteSize }] as const] : []));
}
