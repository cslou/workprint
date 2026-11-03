import { currentPanelImage, currentSheets, currentSubjects, currentSubjectSheets, shotRoles, storyboardNames } from '@workprint/contracts';
import { usedImageVersions } from '../artifacts/index.js';
import type { OwnedWorkspace } from './workspace-reads.js';
import { imageVersionNames } from './workspace-versions.js';

/** Meta takes at most this many input images. */
export const maxPanelInputs = 10;
/** The job of a later panel's first input, the Shot's first panel. */
export const anchorJob = 'keep camera, setting and staging';
/** The job of a picked image that isn't a view of one of the Shot's sheets. */
export const otherImageJob = 'as the prompt describes';

/** One image a panel is made from, with the workspace's name for it and what it is for. */
export type PanelInput = Readonly<{ versionId: string; label: string; job: string }>;
/** A panel's inputs, or why there are none. Only version ids: the caller reads the images. */
export type PanelInputs =
  | { kind: 'resolved'; inputs: PanelInput[]; preface: string; size?: { width: number; height: number } }
  | { kind: 'not_found' } | { kind: 'needs_first_panel' } | { kind: 'image_not_found' }
  | { kind: 'too_many'; count: number } | { kind: 'subject_gone'; subjectName: string };
/** The panel to make and the images the agent picked; empty `images` means every sheet the Shot names, whole. */
export type PanelRequest = Readonly<{ shot: string; panel: string; images: readonly string[] }>;

const byOrder = <T extends { order: number }>(items: readonly T[]) => [...items].sort((a, b) => a.order - b.order);

/**
 * The only place a panel's inputs are chosen, from the workspace projection alone. The order is the Shot's first
 * panel (for every later panel), then the Shot's sheets by role (identity, environment, prop, composition), in
 * reference order and view order, then the other picked images as given. Each image keeps its first place, and the
 * 10-input limit counts after that. A sheet is its subject's current sheet, so a redone view is used at once.
 */
export function panelInputs(workspace: OwnedWorkspace, request: PanelRequest): PanelInputs {
  const shot = workspace.storyboard.shots.find(candidate => candidate.shotId === request.shot);
  const panels = shot ? byOrder(shot.panels) : [];
  const index = panels.findIndex(panel => panel.panelId === request.panel);
  if (!shot || index < 0) return { kind: 'not_found' };
  const names = storyboardNames(workspace.storyboard.shots);

  const inputs: PanelInput[] = [];
  let size: { width: number; height: number } | undefined;
  if (index > 0) {
    const first = panels[0]!, image = currentPanelImage(first);
    if (!image) return { kind: 'needs_first_panel' };
    inputs.push({ versionId: image.id, label: names.panel(shot.shotId, first.panelId)!, job: anchorJob });
    if ('media' in image) size = { width: image.media.width, height: image.media.height };
  }

  // Each reference's subject must still be in the script; its current sheet is the subject's first.
  const listed = new Set(currentSubjects(workspace).map(subject => subject.id)), sheets = currentSheets(workspace), subjectSheets = currentSubjectSheets(workspace);
  const references = (shot.references ?? []).map((reference, position) => ({ reference, position }))
    .sort((a, b) => shotRoles.indexOf(a.reference.role) - shotRoles.indexOf(b.reference.role) || a.position - b.position).map(item => item.reference);
  for (const { subjectId } of references) {
    if (!listed.has(subjectId)) return { kind: 'subject_gone', subjectName: sheets.find(sheet => sheet.subjectId === subjectId)?.subjectName ?? subjectId };
  }

  const used = usedImageVersions(workspace), picked = [...new Set(request.images)];
  if (picked.some(id => !used.has(id))) return { kind: 'image_not_found' };
  const chosen = new Set(picked), claimed = new Set<string>();
  for (const reference of references) {
    for (const view of subjectSheets.get(reference.subjectId)?.views ?? []) {
      if (picked.length && !chosen.has(view.versionId)) continue;
      claimed.add(view.versionId);
      inputs.push({ versionId: view.versionId, label: '', job: reference.purpose });
    }
  }
  for (const id of picked) if (!claimed.has(id)) inputs.push({ versionId: id, label: '', job: otherImageJob });

  const unique = inputs.filter((input, position) => inputs.findIndex(other => other.versionId === input.versionId) === position);
  if (unique.length > maxPanelInputs) return { kind: 'too_many', count: unique.length };
  // Each label is the workspace's own name for the image, the one the agent picked it by.
  const name = imageVersionNames(workspace);
  const resolved = unique.map(input => input.label ? input : { ...input, label: name(input.versionId) ?? input.versionId });
  return { kind: 'resolved', inputs: resolved, preface: resolved.map((input, position) => `Input ${position + 1}: ${input.label} — ${input.job}`).join('\n'), ...(size ? { size } : {}) };
}
