import { z } from 'zod';
import { idSchema } from './models.js';

const text = z.string().max(20000).refine(value => value.trim().length > 0, 'Text is required');
const names = z.array(text).max(100);
const unique = (values: readonly (string | number)[]) => new Set(values).size === values.length;
const dialogue = z.strictObject({ character: text, text, delivery: z.enum(['voice_over', 'off_screen']).optional() });
const scene = z.strictObject({
  heading: z.strictObject({ setting: text, location: text, time: text }),
  characters: names,
  script: z.array(z.union([z.strictObject({ action: text }), z.strictObject({ dialogue })])).min(1).max(500),
}).superRefine((value, context) => {
  const characters = value.characters.map(name => name.trim());
  if (!unique(characters)) context.addIssue({ code: 'custom', message: 'Character names must be distinct', path: ['characters'] });
  value.script.forEach((entry, index) => {
    if ('dialogue' in entry && entry.dialogue.delivery !== 'voice_over' && !characters.includes(entry.dialogue.character.trim())) {
      context.addIssue({ code: 'custom', message: 'The speaker must be present unless voice-over', path: ['script', index] });
    }
  });
});

/** Structural hosted content only: validation never grants human approval. */
export const savedScriptContentSchema = z.strictObject({ schemaVersion: z.literal(1), scenes: z.array(scene).min(1).max(1) });
const referenceImage = z.strictObject({ versionId: idSchema, view: text, notes: names });
export const savedReferenceContentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  subject: z.strictObject({
    id: z.string().max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    kind: z.enum(['character', 'environment', 'prop', 'style']),
    name: text, description: text, continuityNotes: names.min(1),
  }),
  // Text-only references are not an approved visual package or verified media.
  references: z.array(referenceImage).max(100).refine(items => unique(items.map(item => item.versionId)), 'Reference versions must be distinct'),
});
const panel = z.strictObject({ panelId: idSchema, order: z.number().int().nonnegative(), description: text, references: z.array(idSchema).max(100).refine(unique, 'Reference versions must be distinct') });
const shot = z.strictObject({ shotId: idSchema, order: z.number().int().nonnegative(), intent: text, panels: z.array(panel).min(1).max(100) });
export const savedStoryboardContentSchema = z.strictObject({ schemaVersion: z.literal(1), sourceScriptVersionId: idSchema, shots: z.array(shot).min(1).max(100) }).superRefine((value, context) => {
  const ids = value.shots.map(item => item.shotId);
  const panelIds = value.shots.flatMap(item => item.panels.map(panel => panel.panelId));
  if (!unique([...ids, ...panelIds]) || !unique(value.shots.map(item => item.order)) || value.shots.some(item => !unique(item.panels.map(panel => panel.order)))) {
    context.addIssue({ code: 'custom', message: 'Shot and Panel identities and their sibling orders must be distinct' });
  }
});
export const savedContentSchemas = { script: savedScriptContentSchema, reference: savedReferenceContentSchema, storyboard: savedStoryboardContentSchema } as const;
