import { z } from 'zod';
import { contentSchema, exportSchema, generationRequestSchema, generationStatusSchema, idSchema, intendedUseSchema, kindSchema, proposalSchema, questionSchema, revisionSchema, storyboardEditSchema, useBindingSchema, useSchema, versionSchema, workspaceSchema } from './models.js';
export * from './models.js';

export const errorCodeSchema = z.enum(['unauthenticated', 'forbidden', 'not_found', 'invalid_input', 'stale_revision', 'superseded', 'unsupported', 'not_implemented', 'integration_failure']);
export const errorEnvelopeSchema = z.strictObject({ error: z.strictObject({ code: errorCodeSchema, message: z.string().min(1), details: z.strictObject({ issues: z.array(z.strictObject({ path: z.array(z.union([z.string(), z.number()])), message: z.string() })).optional(), ids: z.array(idSchema).optional() }).optional() }) });
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
export const errorStatus: Readonly<Record<ErrorCode, number>> = { unauthenticated: 401, forbidden: 403, not_found: 404, invalid_input: 400, stale_revision: 409, superseded: 409, unsupported: 422, not_implemented: 501, integration_failure: 503 };
export function applicationError(code: ErrorCode, message: string): ErrorEnvelope { return { error: { code, message } }; }

const empty = z.strictObject({});
const scope = z.strictObject({ id: idSchema.refine((id) => id !== '.' && id !== '..', 'Path ID cannot be a dot segment') });
export const paginationSchema = z.strictObject({ cursor: z.string().min(1).max(1000).optional(), limit: z.number().int().min(1).max(100).optional() });
const mutation = { operationId: idSchema };
const request = <P extends z.ZodType, Q extends z.ZodType, B extends z.ZodType>(params: P, query: Q, body: B) => z.strictObject({ params, query, body });
const page = <T extends z.ZodType>(item: T) => z.strictObject({ items: z.array(item), nextCursor: z.string().min(1).max(1000).nullable() });
const saved = z.strictObject({ version: versionSchema, use: useSchema.optional() });
function define<R extends z.ZodType, S extends z.ZodType>(method: 'GET' | 'POST' | 'PATCH', path: string, input: R, response: S) { return { method, path, request: input, response } as const; }

/** Closed v1 application operations. Declarations only: no HTTP or native transport. */
export const operations = {
  workspace: define('GET', '/v1/conversations/:id/workspace', request(scope, empty, empty), workspaceSchema),
  artifactVersions: define('GET', '/v1/artifacts/:id/versions', request(scope, paginationSchema, empty), page(versionSchema)),
  version: define('GET', '/v1/versions/:id', request(scope, paginationSchema, empty), versionSchema),
  library: define('GET', '/v1/library', request(empty, paginationSchema.extend({ kind: kindSchema.optional() }), empty), page(z.strictObject({ id: idSchema, kind: kindSchema, builtIn: z.boolean(), latestVersion: versionSchema }))),
  saveVersion: define('POST', '/v1/conversations/:id/versions', request(scope, empty, z.strictObject({ ...mutation, artifactId: idSchema.optional(), kind: z.enum(['script', 'reference', 'storyboard']), baseVersionId: idSchema.optional(), content: contentSchema, dependencies: z.array(idSchema), intendedUse: intendedUseSchema.optional() })), saved),
  useVersion: define('POST', '/v1/conversations/:id/uses', request(scope, empty, z.discriminatedUnion('purpose', [
    useBindingSchema.options[0].extend({ ...mutation, versionId: idSchema }),
    useBindingSchema.options[1].extend({ ...mutation, versionId: idSchema }),
    useBindingSchema.options[2].extend({ ...mutation, versionId: idSchema }),
    useBindingSchema.options[3].extend({ ...mutation, versionId: idSchema }),
    useBindingSchema.options[4].extend({ ...mutation, versionId: idSchema }),
  ])), z.strictObject({ use: useSchema, selectionRevision: revisionSchema })),
  editStoryboard: define('PATCH', '/v1/conversations/:id/storyboard', request(scope, empty, z.strictObject({ ...mutation, baseVersionId: idSchema, shots: storyboardEditSchema })), z.strictObject({ version: versionSchema, selectionRevision: revisionSchema, affected: z.array(idSchema) })),
  question: define('GET', '/v1/questions/:id', request(scope, empty, empty), questionSchema),
  answerQuestion: define('POST', '/v1/questions/:id/answers', request(scope, empty, z.strictObject({ ...mutation, questionRevision: revisionSchema, optionId: idSchema })), z.strictObject({ question: questionSchema, effects: z.array(z.strictObject({ type: z.enum(['approval', 'use', 'batch_authority']), id: idSchema })), continuationId: idSchema })),
  proposal: define('GET', '/v1/proposals/:id', request(scope, empty, empty), proposalSchema),
  requestUpload: define('POST', '/v1/conversations/:id/uploads', request(scope, empty, z.strictObject({ ...mutation, kind: z.enum(['image', 'video']), filename: z.string().min(1).max(255), contentType: z.string().min(1).max(255), byteSize: z.number().int().positive(), intendedUse: intendedUseSchema.optional() })), z.strictObject({ uploadId: idSchema, url: z.url(), expiresAt: z.iso.datetime(), maxBytes: z.number().int().positive() })),
  confirmUpload: define('POST', '/v1/uploads/:id/confirm', request(scope, empty, z.strictObject(mutation)), saved),
  media: define('GET', '/v1/versions/:id/media', request(scope, empty, empty), z.strictObject({ url: z.url(), expiresAt: z.iso.datetime(), poster: z.url().optional(), measured: z.strictObject({ width: z.number().int().positive(), height: z.number().int().positive(), durationMs: z.number().nonnegative().optional(), hasAudio: z.boolean().optional() }) })),
  generationRequest: define('GET', '/v1/generation-requests/:id', request(scope, paginationSchema.extend({ status: generationStatusSchema.optional() }), empty), generationRequestSchema),
  generationRequests: define('GET', '/v1/conversations/:id/generation-requests', request(scope, paginationSchema.extend({ status: generationStatusSchema.optional() }), empty), page(generationRequestSchema)),
  cancelGeneration: define('POST', '/v1/generation-requests/:id/cancel', request(scope, empty, z.strictObject(mutation)), z.strictObject({ request: generationRequestSchema, remote: z.enum(['requested', 'unsupported', 'unknown']) })),
  createExport: define('POST', '/v1/conversations/:id/exports', request(scope, empty, z.strictObject({ ...mutation, selectionRevision: revisionSchema })), z.strictObject({ export: exportSchema })),
  exports: define('GET', '/v1/conversations/:id/exports', request(scope, paginationSchema, empty), page(exportSchema)),
  export: define('GET', '/v1/exports/:id', request(scope, paginationSchema, empty), exportSchema),
} as const;
export type OperationName = keyof typeof operations;
export type OperationRequest<N extends OperationName> = z.infer<(typeof operations)[N]['request']>;
export type OperationResponse<N extends OperationName> = z.infer<(typeof operations)[N]['response']>;
