import { savedReferenceContentSchema, savedScriptContentSchema, type Version } from '@workprint/contracts';
import type { MaterialPresentation } from './presentation.js';

/** A subject's or sheet's kind as people read it; a sheet stores a place as `environment`. */
export const kindLabel = { character: 'Character', place: 'Place', environment: 'Place', prop: 'Prop', style: 'Style' } as const;

/** A subject's Shots as its entry lists them: "Shot 1", "Shots 1 and 2", "Shots 1, 2 and 3"; empty for none. */
export function shotsLabel(numbers: readonly number[]): string {
  if (!numbers.length) return '';
  if (numbers.length === 1) return `Shot ${numbers[0]}`;
  return `Shots ${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1)}`;
}

/** Public validated content only; opaque fields and identifiers never supply display facts. */
export function savedMaterialPresentation(version: Version): MaterialPresentation | null {
  if (version.kind === 'script') {
    const parsed = savedScriptContentSchema.safeParse(version.content);
    if (!parsed.success) return null;
    const text = parsed.data.scenes.flatMap(scene => scene.script.map(entry => 'action' in entry ? entry.action : `${entry.dialogue.character}${entry.dialogue.delivery === 'voice_over' ? ' (voice-over)' : entry.dialogue.delivery === 'off_screen' ? ' (off-screen)' : ''}: “${entry.dialogue.text}”`)).join('\n\n');
    return { versionId: version.id, revision: version.revision, sections: [{ label: 'What happens', text }] };
  }
  if (version.kind === 'reference') {
    const parsed = savedReferenceContentSchema.safeParse(version.content);
    if (!parsed.success) return null;
    const subject = parsed.data.subject;
    const kind = kindLabel[subject.kind];
    return { versionId: version.id, revision: version.revision, name: subject.name, description: kind,
      sheet: { kicker: kind, name: subject.name, summary: subject.description, sections: [{ title: 'Identity', text: subject.continuityNotes.join('\n\n') }],
        views: parsed.data.references.map(({ versionId, view }) => ({ versionId, view })) } };
  }
  return null;
}
