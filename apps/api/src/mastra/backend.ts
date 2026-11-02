import { ResourceMastra } from './resources.js';
import { registerApiRoute, type ApiRoute } from '@mastra/core/server';
import { PostgresStore } from '@mastra/pg';
import { Pool } from 'pg';
import { createOwnedConversationCheck, bindNativeTurns, productionTools, turnLimits, type AgentCollaborators, type AgentTool, type NativeTurnModel, type TurnLimits } from '../agent/index.js';
import { createApplication, createAssistantScriptSaver, createGeneratedImageSaver, createImageInputReader, createWorkspaceReader, withSavedWork, withManualSaves, withVersionUses, withGenerationRequests, withStoryboardEdits, withUploads } from '../application/index.js';
import { createArtifactStore, createArtifactWriters, createAssistantScripts, createGeneratedImages, createVersionUses, createStoryboardEdits, createMediaVerifier, createUploadCoordinator } from '../artifacts/index.js';
import { configuredMediaSandbox, configuredObjectStorage } from '../storage/index.js';
import { assertRestrictedRole } from '../db/index.js';
import { createGenerationJobs, type MetaImageClient } from '../generation/index.js';
import { loadServerConfig } from './config.js';
import { verifyAccount } from './auth.js';
import { applicationRoutes } from './application-routes.js';
import { verifiedIngressAccount } from './ingress.js';
import { createAdmissionPolicy, decorateCors } from './admission.js';
import { nativeNavigationRoutes } from './native-navigation.js';
import { nativeTurnRoutes, isNativeTurnRoute } from './native-turns.js';

/** Turn composition. Production supplies the model and the Meta image client; a test composition may point them at fakes, add tools and override limits. */
export interface TurnComposition {
  readonly model: NativeTurnModel;
  readonly images?: MetaImageClient;
  readonly tools?: readonly AgentTool[];
  readonly limits?: TurnLimits;
}

/** One backend: cataloged application routes plus explicit test-composition additions. */
export async function createBackend(routes: ApiRoute[] = [], turns?: TurnComposition) {
  const config = loadServerConfig(process.env);
  const objects = configuredObjectStorage(process.env);
  const media = await configuredMediaSandbox(process.env).catch(error => { objects?.close(); throw error; });
  const pool = new Pool({
    connectionString: config.connectionString, max: 4, connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 5000, statement_timeout: 10000,
  });
  pool.on('error', (error) => {
    const code = 'code' in error && typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)
      ? error.code : 'connection_error';
    console.error('Native storage idle connection lost', { code });
  });
  try {
    await assertRestrictedRole(pool, {
      createSchemas: ['artifacts', 'generation', 'mastra', 'public'], ownershipSchemas: ['artifacts', 'generation', 'mastra'],
      requiredSchemas: ['mastra', 'public'], errorMessage: 'Privileged serving connection',
    });
  } catch {
    objects?.close(); await media?.close(); await pool.end();
    throw new Error('Serving storage unavailable or privileged; prepare storage separately and use restricted DATABASE_URL');
  }
  const jobs = createGenerationJobs(pool);
  const tools = turns ? turns.tools ?? productionTools : [];
  const storage = new PostgresStore({ id: 'workprint-native', schemaName: 'mastra', disableInit: true, pool });
  const application = createApplication({ checkOwnedConversation: createOwnedConversationCheck(storage) });
  const savedWork = createArtifactStore(pool, application.checkOwnedConversation);
  const savedApplication = withSavedWork(application, savedWork);
  const manualApplication = withManualSaves(savedApplication, createArtifactWriters(pool, application.checkOwnedConversation).human.save);
  const reuseApplication = withVersionUses(manualApplication, createVersionUses(pool, application.checkOwnedConversation).useVersion);
  const planningApplication = withStoryboardEdits(reuseApplication, createStoryboardEdits(pool, application.checkOwnedConversation).editStoryboard);
  // One media checker: uploads and assistant-made images share the one-job decode sandbox.
  const verifyMedia = media ? createMediaVerifier(media) : undefined;
  const uploadApplication = withUploads(planningApplication, createUploadCoordinator(pool, application.checkOwnedConversation, { ...(objects ? { storage: objects } : {}), ...(verifyMedia ? { verifyMedia } : {}) }));
  const jobApplication = withGenerationRequests(uploadApplication, application.checkOwnedConversation, jobs);
  const protectedRoutes = [...applicationRoutes(jobApplication), ...nativeNavigationRoutes(storage, application.checkOwnedConversation, tools), ...routes];
  const policy = createAdmissionPolicy([...protectedRoutes, ...nativeTurnRoutes], config.browserOrigin);
  const mastra = new ResourceMastra({
    storage,
    server: {
      host: '127.0.0.1', port: config.port,
      // Native CORS appends framework headers even to an explicit allowHeaders list.
      // Disable it; this catalog-only policy must not expose native routes/headers.
      cors: false,
      build: { swaggerUI: false, openAPIDocs: false },
      apiRoutes: [
        ...protectedRoutes,
        // With no qualified native catalog, retain the terminal custom fallback.
        // A native composition relies on mandatory pre-Mastra closed admission;
        // a nested custom wildcard cannot fall through to native adapter routes.
        ...(turns ? [] : [registerApiRoute('/*', {
          method: 'ALL',
          handler: (context) => context.json({ error: { code: 'not_found', message: 'Not found' } }, 404),
        })]),
      ],
      middleware: [async (context, next) => {
        const admittedAccount = verifiedIngressAccount(context);
        if (admittedAccount) {
          context.get('requestContext').set('accountId', admittedAccount);
          await next();
          return context.res;
        }
        // Native turns require the app-owned pre-Mastra body/ownership admission.
        if (isNativeTurnRoute(context)) return context.json({ error: { code: 'integration_failure', message: 'Native turns unavailable' } }, 503);
        const { origin, preflight } = policy.cors(context);
        if (origin && preflight) return context.body(null, 204);
        if (context.req.path === '/health' && context.req.method === 'GET') return next();
        // Default-deny before native handlers, regardless of caller identity.
        if (!policy.matchesRoute(context.req.path, context.req.method)) {
          return context.json({ error: { code: 'not_found', message: 'Not found' } }, 404);
        }
        const identity = await verifyAccount(context.req.header('Authorization'), config.supabase);
        if (identity.kind === 'unauthorized') {
          return context.json({ error: { code: 'unauthenticated', message: 'Authentication required' } }, 401);
        }
        if (identity.kind === 'unavailable') {
          return context.json({ error: { code: 'integration_failure', message: 'Authentication unavailable' } }, 503);
        }
        context.get('requestContext').set('accountId', identity.accountId);
        await next();
        // Application adapters return a standalone Response; decorate the settled one.
        if (origin) decorateCors(context, origin);
        return context.res;
      }],
    },
  }, { before: async () => { try { await media?.close(); } finally { objects?.close(); } }, after: async () => { if (!pool.ended) await pool.end(); } });
  if (turns) {
    // Application functions that tools may call, each over the same owned reads as the HTTP boundary.
    const generated = createGeneratedImages(pool, application.checkOwnedConversation, { storage: objects, verifyMedia });
    const collaborators: AgentCollaborators = {
      readWorkspace: createWorkspaceReader(savedWork), saveScript: createAssistantScriptSaver(createAssistantScripts(pool, application.checkOwnedConversation).save),
      readImageInputs: createImageInputReader(savedWork, generated.read), saveGeneratedImage: createGeneratedImageSaver(generated.save),
      // Images are made only where they can be saved: without storage and the checker, no paid call is made.
      ...(turns.images && objects && verifyMedia ? { images: turns.images } : {}),
    };
    bindNativeTurns(mastra, { model: turns.model, tools, limits: turns.limits ?? turnLimits, collaborators });
  }
  return mastra;
}
