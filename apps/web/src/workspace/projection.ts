import type { OperationResponse } from '@workprint/contracts';
type Shot = OperationResponse<'workspace'>['storyboard']['shots'][number];
/** Positions are presentation only; transport retains the supplied IDs and order values. */
export function orderedStoryboard(shots: readonly Shot[]) {
  const shotIds = new Set<string>(), panelIds = new Set<string>();
  if (new Set(shots.map(shot => shot.order)).size !== shots.length) return null;
  for (const shot of shots) {
    if (shotIds.has(shot.shotId)) return null; shotIds.add(shot.shotId);
    if (new Set(shot.panels.map(panel => panel.order)).size !== shot.panels.length) return null;
    for (const panel of shot.panels) { if (panelIds.has(panel.panelId)) return null; panelIds.add(panel.panelId); }
  }
  return [...shots].sort((a, b) => a.order - b.order).map((shot, index) => ({ shot, number: index + 1, panels: [...shot.panels].sort((a, b) => a.order - b.order).map((panel, index) => ({ panel, number: index + 1 })) }));
}
