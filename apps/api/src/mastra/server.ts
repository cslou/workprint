import { Server } from 'node:http';
import { serve } from '@hono/node-server';
import type { Mastra } from '@mastra/core';
import { MastraServer, type HonoVariables } from '@mastra/hono';
import { Hono, type MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { timeout } from 'hono/timeout';
import { createBackend } from './backend.js';

/** One listener and execution owner, shared by production and isolated compositions. */
export async function startServer(mastra: Mastra, beforeMastra: readonly MiddlewareHandler[] = []) {
  const options = mastra.getServer();
  const drainTimeout = options?.drainTimeout ?? 5000;
  if (!Number.isFinite(drainTimeout) || drainTimeout < 0 || drainTimeout > 2147483647) {
    throw new RangeError('server.drainTimeout must be a finite number between 0 and 2147483647 milliseconds');
  }
  const app = new Hono<{ Variables: HonoVariables }>();
  app.get('/health', (context) => context.json({ success: true }));
  // Empty in production until bounded intake is qualified. Runs before native cloning/parsing.
  for (const guard of beforeMastra) app.use('*', guard);
  app.notFound((context) => context.json({ error: { code: 'not_found', message: 'Not found' } }, 404));
  app.onError((error, context) => {
    if (options?.onError) return options.onError(error, context);
    if (error instanceof HTTPException) return context.json({ error: error.message }, error.status);
    mastra.getLogger().error('HTTP request failed', { error });
    return context.json({ error: 'Internal Server Error' }, 500);
  });
  // Match generated ordering: context, existing programmatic middleware, global timeout.
  mastra.setServerMiddleware([
    ...mastra.getServerMiddleware(),
    { path: '*', handler: timeout(options?.timeout ?? 180000) },
  ]);
  await new MastraServer({ app, mastra, prefix: options?.apiPrefix ?? '/api' }).init();
  const listener = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: options?.port ?? 4111 }, () => {
    mastra.getLogger().info('Mastra API running', { url: `http://127.0.0.1:${options?.port ?? 4111}${options?.apiPrefix ?? '/api'}` });
    process.send?.({ type: 'server-ready', port: options?.port ?? 4111, host: '127.0.0.1' });
  });
  if (!(listener instanceof Server)) {
    listener.close();
    throw new Error('An HTTP/1.1 listener is required');
  }
  const server = listener;
  if (typeof mastra.startWorkers === 'function') await mastra.startWorkers();
  else await mastra.startEventEngine();

  const timedOut = Symbol('shutdown-timeout');
  const bounded = async (work: Promise<unknown>, milliseconds: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([work, new Promise<typeof timedOut>((resolve) => {
        timer = setTimeout(() => resolve(timedOut), milliseconds);
      })]);
    } finally { clearTimeout(timer); }
  };
  if (options?.handleShutdownSignals !== false) {
    let shutdownStartedAt: number | undefined;
    const shutdown = async (signal: NodeJS.Signals) => {
      if (shutdownStartedAt !== undefined) {
        if (Date.now() - shutdownStartedAt >= 250) process.exit(1);
        return;
      }
      shutdownStartedAt = Date.now();
      const logger = mastra.getLogger();
      logger.info('Shutting down Mastra server', { signal });
      try {
        const drained = new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        const closeIdle = () => server.closeIdleConnections();
        closeIdle();
        const sweep = setInterval(closeIdle, 100);
        sweep.unref();
        try {
          if (await bounded(drained, drainTimeout) === timedOut) {
            logger.warn('Mastra server drain timed out; closing remaining HTTP connections', { timeoutMs: drainTimeout });
            server.closeAllConnections();
          }
        } finally { clearInterval(sweep); }
      } catch (error) { logger.error('Error while draining Mastra server', { error }); }
      try {
        if (await bounded(mastra.shutdown({ drainTimeout }), drainTimeout + 5000) === timedOut) {
          logger.warn('Mastra shutdown timed out; forcing exit', { timeoutMs: drainTimeout + 5000 });
        }
      } catch (error) { logger.error('Error during Mastra shutdown', { error }); }
      process.exit(0);
    };
    process.on('SIGINT', () => { void shutdown('SIGINT'); });
    process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  }
  const recoveries: Promise<unknown>[] = [];
  if (mastra.recoveryConfig?.workflows !== 'off') {
    recoveries.push(mastra.restartAllActiveWorkflowRuns().catch((error: unknown) => {
      mastra.getLogger().error('Failed to restart active workflow runs during server startup', { error });
    }));
  }
  if (mastra.recoveryConfig?.durableAgents === 'auto') {
    recoveries.push(mastra.recoverAllDurableAgents().catch((error: unknown) => {
      mastra.getLogger().error('Failed to recover durable agent runs during server startup', { error });
    }));
  }
  await Promise.all(recoveries);
  return server;
}

if (import.meta.main) {
  await startServer(await createBackend());
}
