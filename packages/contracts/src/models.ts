import { z } from 'zod';

export const idSchema = z.string().min(1).max(200);
export const revisionSchema = z.number().int().nonnegative();
export const kindSchema = z.enum(['script', 'reference', 'storyboard', 'image', 'video']);
// Content/settings remain domain-owned JSON, never authority or server rows.
export const contentSchema = z.record(z.string(), z.json());
const order = z.number().int().nonnegative();
export const useBindingSchema = z.discriminatedUnion('purpose', [
  z.strictObject({ purpose: z.literal('script') }),
  z.strictObject({ purpose: z.literal('reference'), role: idSchema.optional() }),
  z.strictObject({ purpose: z.literal('storyboard') }),
  z.strictObject({ purpose: z.literal('panel_image'), shotId: idSchema, panelId: idSchema }),
  z.strictObject({ purpose: z.literal('shot_video'), shotId: idSchema }),
]);
export const intendedUseSchema = useBindingSchema;
export const useSchema = z.strictObject({ id: idSchema, versionId: idSchema, binding: useBindingSchema, state: z.enum(['draft', 'approved']) });
const versionBase = { id: idSchema, artifactId: idSchema, revision: revisionSchema, createdBy: z.enum(['human', 'assistant']), createdAt: z.iso.datetime(), dependencies: z.array(idSchema) };
const media = z.strictObject({ contentType: z.string().min(1), byteSize: z.number().int().positive(), width: z.number().int().positive(), height: z.number().int().positive(), durationMs: z.number().nonnegative().optional(), hasAudio: z.boolean().optional() });
export const versionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...versionBase, kind: z.enum(['script', 'reference', 'storyboard']), content: contentSchema }),
  z.strictObject({ ...versionBase, kind: z.enum(['image', 'video']), media }),
]);
export const questionSchema = z.strictObject({ id: idSchema, revision: revisionSchema, status: z.enum(['pending', 'answered', 'superseded']), scope: z.strictObject({ versionId: idSchema.optional(), proposalId: idSchema.optional(), useId: idSchema.optional() }), prompt: z.string().min(1), options: z.array(z.strictObject({ id: idSchema, label: z.string().min(1) })).min(1) });
const targetVariants = [
  z.strictObject({ purpose: z.literal('reference_image'), target: z.strictObject({ role: idSchema }) }),
  z.strictObject({ purpose: z.literal('panel_image'), target: z.strictObject({ shotId: idSchema, panelId: idSchema }) }),
  z.strictObject({ purpose: z.literal('shot_video'), target: z.strictObject({ shotId: idSchema }) }),
] as const;
const estimate = z.strictObject({ amount: z.number().nonnegative().optional(), currency: z.string().min(1).optional(), basis: z.enum(['provider', 'calculated', 'estimated', 'unknown']) });
const proposalFields = { id: idSchema, revision: revisionSchema, questionId: idSchema, provider: idSchema, model: idSchema, prompt: z.string().min(1), settings: contentSchema, candidateCount: z.number().int().positive(), inputs: z.array(z.strictObject({ versionId: idSchema, role: idSchema, order })), disclosures: z.array(z.string()), estimate };
export const proposalSchema = z.discriminatedUnion('purpose', [targetVariants[0].extend(proposalFields), targetVariants[1].extend(proposalFields), targetVariants[2].extend(proposalFields)]);
export const generationStatusSchema = z.enum(['queued', 'submitting', 'running', 'succeeded', 'failed', 'cancelled']);
const requestFields = { id: idSchema, batchId: idSchema, proposalId: idSchema, status: generationStatusSchema, failureReason: z.enum(['moderation', 'invalid_input', 'timed_out', 'outcome_unknown', 'provider_error']).optional(), resultVersionId: idSchema.optional(), remote: z.strictObject({ taskId: idSchema.optional(), status: z.string().min(1).optional() }), usage: z.strictObject({ quantities: z.array(z.strictObject({ unit: idSchema, amount: z.number().nonnegative(), basis: z.enum(['provider', 'calculated', 'estimated', 'unknown']) })), cost: estimate.optional() }).optional() };
export const generationRequestSchema = z.discriminatedUnion('purpose', [targetVariants[0].extend(requestFields), targetVariants[1].extend(requestFields), targetVariants[2].extend(requestFields)]);
export const exportSchema = z.strictObject({ id: idSchema, status: z.enum(['queued', 'processing', 'succeeded', 'failed', 'cancelled']), capturedSelectionRevision: revisionSchema, current: z.boolean(), sources: z.array(z.strictObject({ shotId: idSchema, versionId: idSchema, order })), compatibility: z.strictObject({ compatible: z.boolean(), issues: z.array(z.strictObject({ versionId: idSchema, message: z.string().min(1) })) }), failureReason: z.string().min(1).optional(), outputVersionId: idSchema.optional() });
const work = z.strictObject({ version: versionSchema, use: useSchema.nullable(), state: z.enum(['Draft', 'Ready']) });
const panel = z.strictObject({ panelId: idSchema, order, description: z.string(), references: z.array(idSchema), candidateImageVersions: z.array(versionSchema), approvedImageVersionId: idSchema.nullable() });
const shot = z.strictObject({ shotId: idSchema, order, intent: z.string().optional(), panels: z.array(panel), chosenVideoVersionId: idSchema.nullable() });
export const workspaceSchema = z.strictObject({ script: work.nullable(), assets: z.array(work), storyboard: z.strictObject({ work: work.nullable(), shots: z.array(shot) }), videos: z.array(generationRequestSchema), pendingQuestion: questionSchema.nullable(), activeWork: z.array(z.strictObject({ type: z.enum(['generation', 'export']), id: idSchema, status: z.string().min(1) })), selectionRevision: revisionSchema });
export const storyboardEditSchema = z.array(z.strictObject({ shotId: idSchema, order, intent: z.string().optional(), panels: z.array(z.strictObject({ panelId: idSchema, order, description: z.string().optional(), references: z.array(idSchema) })) }));
export type Version = z.infer<typeof versionSchema>;
export type Question = z.infer<typeof questionSchema>;
export type Proposal = z.infer<typeof proposalSchema>;
