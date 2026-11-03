import type { OwnedWorkspace } from './workspace-reads.js';

type Shot = OwnedWorkspace['storyboard']['shots'][number];

/** A position as one clause: trimmed, without the closing punctuation the line adds itself (unless that is all it is). */
const clause = (text: string) => text.trim().replace(/[.;!?\s]+$/, '') || text.trim();
/** The places a Shot names, by subject id. */
const places = (shot: Shot) => new Set((shot.references ?? []).filter(reference => reference.role === 'environment').map(reference => reference.subjectId));

/**
 * The lines that tell a panel or a Shot video where its Shot starts and ends, then where the Shot before it in story
 * order ended. The previous ending is given only when it can carry on: both Shots name a place in common, or neither
 * names one. A Shot without positions, and a previous Shot without them, give no line for what is missing.
 */
export function positionLines(shots: readonly Shot[], shot: Shot): string[] {
  const lines = shot.positions ? [`Positions: starts ${clause(shot.positions.start)}; ends ${clause(shot.positions.end)}.`] : [];
  const previous = [...shots].sort((a, b) => a.order - b.order).filter(other => other.order < shot.order).at(-1);
  if (previous?.positions) {
    const here = places(shot), there = places(previous);
    if ((here.size === 0 && there.size === 0) || [...here].some(id => there.has(id))) lines.push(`Previous Shot ended: ${clause(previous.positions.end)}.`);
  }
  return lines;
}
