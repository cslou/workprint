import { z } from 'zod';

/** Text that is not blank, at most `max` characters. */
const bounded = (max: number) => z.string().max(max).refine(value => value.trim().length > 0, 'Text is required');
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** One script dialogue line: spoken by its character on screen, `off_screen`, or `voice_over`. */
export const dialogueLineSchema = z.strictObject({ character: bounded(20000), text: bounded(20000), delivery: z.enum(['voice_over', 'off_screen']).optional() });

/** What a Shot uses a subject's sheet for: identity (a character), environment (a place), prop (a prop), or composition (any). */
export const shotRoles = ['identity', 'environment', 'prop', 'composition'] as const;
export type ShotRole = typeof shotRoles[number];
/** The subject kind each role fits; composition fits any kind. */
export const roleKinds: Readonly<Record<ShotRole, readonly ('character' | 'place' | 'prop')[]>> = {
  identity: ['character'], environment: ['place'], prop: ['prop'], composition: ['character', 'place', 'prop'],
};

/** A Shot's use of a subject, by its script id; the subject's current sheet is what a panel is made from. */
export const shotReferenceSchema = z.strictObject({ subjectId: z.string().max(200).regex(slug), role: z.enum(shotRoles), purpose: bounded(120) });

/**
 * The optional Shot fields an assistant storyboard fills (additive to schema version 1), shared by saved content and
 * the workspace projection so a workspace holding an agent storyboard still parses.
 */
export const shotFields = {
  framing: bounded(80).optional(),
  action: bounded(2000).optional(),
  dialogue: z.array(dialogueLineSchema).max(20).optional(),
  cameraNote: bounded(2000).optional(),
  references: z.array(shotReferenceSchema).max(10).refine(items => new Set(items.map(item => item.subjectId)).size === items.length, 'Each subject is referenced once per Shot').optional(),
};
