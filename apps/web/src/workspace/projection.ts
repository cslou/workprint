import type { OperationResponse } from '@workprint/contracts';
type Shot = OperationResponse<'workspace'>['storyboard']['shots'][number];
type Line = NonNullable<Shot['dialogue']>[number];
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

/**
 * Who a dialogue line is heard from: its character on screen, off screen, or in voice-over when the character is in
 * the scene; any other voice-over is narration.
 */
export function deliveryLabel(line: Line, sceneCharacters: ReadonlySet<string>): string {
  const character = line.character.trim();
  if (line.delivery === 'off_screen') return `${character} (off screen)`;
  if (line.delivery === 'voice_over') return sceneCharacters.has(character) ? `${character} (voice-over)` : 'Narration';
  return character;
}

/** The numbers of the Shots that name a subject, in storyboard order; none when the storyboard can't be ordered. */
export function subjectShotNumbers(shots: readonly Shot[], subjectId: string): number[] {
  return (orderedStoryboard(shots) ?? []).filter(row => row.shot.references?.some(reference => reference.subjectId === subjectId)).map(row => row.number);
}

/** "Shot 1", "Shots 1 and 2", "Shots 1, 2 and 3"; empty for none. */
export function shotsLabel(numbers: readonly number[]): string {
  if (!numbers.length) return '';
  if (numbers.length === 1) return `Shot ${numbers[0]}`;
  return `Shots ${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1)}`;
}
