import type { z } from 'zod';
import type { versionSchema } from './models.js';

type Version = z.infer<typeof versionSchema>;
/** A storyboard panel as the workspace gives it: every image bound to it, and the one a person chose. */
export type PanelImages = Readonly<{ candidateImageVersions: readonly Version[]; approvedImageVersionId: string | null }>;

/**
 * A panel's current image: the version a person chose, else the assistant's current version (its latest), else none.
 * This is the only implementation of the rule.
 */
export function currentPanelImage(panel: PanelImages): Version | null {
  const chosen = panel.approvedImageVersionId === null ? undefined : panel.candidateImageVersions.find(version => version.id === panel.approvedImageVersionId);
  if (chosen) return chosen;
  const made = panel.candidateImageVersions.filter(version => version.createdBy === 'assistant');
  return made.reduce<Version | null>((latest, version) => !latest || version.createdAt > latest.createdAt || (version.createdAt === latest.createdAt && version.revision > latest.revision) ? version : latest, null);
}
