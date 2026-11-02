import { savedReferenceContentSchema, type OperationResponse } from '@workprint/contracts';

/**
 * Image versions the video uses, in any use state: its images, every Panel's candidate images, and every image a
 * current sheet lists, even when that image's own use has moved on to a later version.
 */
export function usedImageVersions(workspace: OperationResponse<'workspace'>): Set<string> {
  const versions = [...workspace.assets.map(asset => asset.version), ...workspace.storyboard.shots.flatMap(shot => shot.panels.flatMap(panel => panel.candidateImageVersions))];
  const listed = workspace.assets.flatMap(({ version }) => {
    if (version.kind !== 'reference' || !('content' in version)) return [];
    const sheet = savedReferenceContentSchema.safeParse(version.content);
    return sheet.success ? sheet.data.references.map(reference => reference.versionId) : [];
  });
  return new Set([...versions.filter(version => version.kind === 'image').map(version => version.id), ...listed]);
}
