import { Server, type ServerOptions } from 'node:http';
import { serve } from '@hono/node-server';
import type { Mastra } from '@mastra/core';
import { MastraServer, type HonoVariables } from '@mastra/hono';
import { Hono, type MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { timeout } from 'hono/timeout';
import { createAssistantModel, nativeTurnLimits, turnLimits } from '../agent/index.js';
import { createMetaImageClient } from '../generation/index.js';
import { createBackend } from './backend.js';
import { loadServerConfig } from './config.js';
import { createIngress } from './ingress.js';
import { isTurnStreamRoute } from './native-turns.js';
import { installServerShutdown } from './shutdown.js';

/** A turn stream route may run this long past the turn deadline before the route timeout ends it. */
export const turnRouteMarginMs = 60_000;

/**
 * Node's own server timeouts. On Node 22 the defaults are 300 s for the request, 60 s for headers and 5 s
 * keep-alive; each bounds only receiving a request or the idle gap between requests, never a response
 * already streaming, so none is changed. They are options so a test can shrink them.
 */
export interface NodeServerTimeouts {
  readonly requestTimeout?: number;
  readonly headersTimeout?: number;
  readonly keepAliveTimeout?: number;
  /** How often Node checks request and headers timeouts; 30 s by default. */
  readonly connectionsCheckingInterval?: number;
}

export interface StartOptions {
  /** Trusted composition hooks that run before ingress; they may short-circuit. */
  readonly beforeMastra?: readonly MiddlewareHandler[];
  readonly beforeNativeShutdown?: () => Promise<void>;
  /** Every route but the turn streams; defaults to the Mastra server `timeout`, else 180 s. */
  readonly routeTimeoutMs?: number;
  readonly node?: NodeServerTimeouts;
}

const timerMs = (name: string, value: number) => {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) throw new RangeError(`${name} must be a whole number of milliseconds between 1 and 2147483647`);
  return value;
};

/**
 * The route timeout. Hono's timeout races only until a handler returns its Response, so a stream already
 * returned is never cut. A turn stream route (send, subscribe, observe) is still bounded by the turn
 * deadline plus a margin instead of the general limit, so none is cut while its turn may run. Stop and
 * every other route keep the general limit.
 */
export function routeTimeouts(routeMs: number, turnRouteMs: number): MiddlewareHandler {
  const general = timeout(routeMs), turns = timeout(turnRouteMs);
  return (context, next) => (isTurnStreamRoute(context) ? turns : general)(context, next);
}

function nodeTimeouts(node: NodeServerTimeouts = {}): ServerOptions {
  const checked: { -readonly [Name in keyof NodeServerTimeouts]: number } = {};
  for (const name of ['requestTimeout', 'headersTimeout', 'keepAliveTimeout', 'connectionsCheckingInterval'] as const) {
    const value = node[name];
    if (value !== undefined) checked[name] = timerMs(name, value);
  }
  return checked;
}

/** One listener and execution owner, shared by production and isolated compositions. */
export async function startServer(mastra: Mastra, start: StartOptions = {}) {
  const { beforeMastra = [], beforeNativeShutdown } = start;
  const options = mastra.getServer();
  const drainTimeout = options?.drainTimeout ?? 5000;
  if (!Number.isFinite(drainTimeout) || drainTimeout < 0 || drainTimeout > 2147483647) {
    throw new RangeError('server.drainTimeout must be a finite number between 0 and 2147483647 milliseconds');
  }
  const app = new Hono<{ Variables: HonoVariables }>();
  // Trusted composition hooks may short-circuit; everything reaching Mastra passes ingress.
  for (const guard of beforeMastra) app.use('*', guard);
  app.use('*', createIngress(mastra));
  app.get('/health', (context) => context.json({ success: true }));
  app.notFound((context) => context.json({ error: { code: 'not_found', message: 'Not found' } }, 404));
  app.onError((error, context) => {
    if (options?.onError) return options.onError(error, context);
    if (error instanceof HTTPException) return context.json({ error: error.message }, error.status);
    mastra.getLogger().error('HTTP request failed', { error });
    return context.json({ error: 'Internal Server Error' }, 500);
  });
  const routeMs = timerMs('routeTimeoutMs', start.routeTimeoutMs ?? options?.timeout ?? 180000);
  const turnRouteMs = timerMs('turn route timeout', (nativeTurnLimits(mastra)?.turnMs ?? turnLimits.turnMs) + turnRouteMarginMs);
  // Match generated ordering: context, existing programmatic middleware, global timeout.
  mastra.setServerMiddleware([
    ...mastra.getServerMiddleware(),
    { path: '*', handler: routeTimeouts(routeMs, turnRouteMs) },
  ]);
  await new MastraServer({ app, mastra, prefix: options?.apiPrefix ?? '/api' }).init();
  const listener = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: options?.port ?? 4111, serverOptions: nodeTimeouts(start.node) }, () => {
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

  if (options?.handleShutdownSignals !== false) installServerShutdown(server, mastra, drainTimeout, beforeNativeShutdown);
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
  const { assistant, images } = loadServerConfig(process.env);
  await startServer(await createBackend([], { model: createAssistantModel(assistant), images: createMetaImageClient(images) }));
}
