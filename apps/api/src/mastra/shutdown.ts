import type { Server } from 'node:http';
import { performance } from 'node:perf_hooks';
import type { Mastra } from '@mastra/core';

export const shutdownLimits = Object.freeze({ httpMs: 2000, totalMs: 7000 });

/** HTTP and native shutdown spend one absolute budget, never sequential budgets. */
export function installServerShutdown(server: Server, mastra: Mastra, configuredDrainMs: number, beforeNativeShutdown?: () => Promise<void>) {
  let startedAt: number | undefined;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (startedAt !== undefined) {
      if (performance.now() - startedAt >= 250) process.exit(1);
      return;
    }
    startedAt = performance.now();
    const deadline = startedAt + shutdownLimits.totalMs;
    const remaining = () => Math.max(0, deadline - performance.now());
    const logger = mastra.getLogger();
    const force = () => {
      logger.error('Total shutdown deadline exceeded; forcing exit', { timeoutMs: shutdownLimits.totalMs });
      process.exit(1);
    };
    const totalTimer = setTimeout(force, remaining());
    let exitCode = 0;
    logger.info('Shutting down Mastra server', { signal });
    try {
      const httpMs = Math.min(configuredDrainMs, shutdownLimits.httpMs, remaining());
      const drained = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      const closeIdle = () => server.closeIdleConnections();
      closeIdle();
      const sweep = setInterval(closeIdle, 100);
      sweep.unref();
      let httpTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        const complete = await Promise.race([
          drained.then(() => true),
          new Promise<false>(resolve => { httpTimer = setTimeout(() => resolve(false), httpMs); }),
        ]);
        if (!complete) {
          logger.warn('Mastra server drain timed out; closing remaining HTTP connections', { timeoutMs: httpMs });
          server.closeAllConnections();
        }
      } finally {
        clearTimeout(httpTimer);
        clearInterval(sweep);
      }
    } catch (error) {
      exitCode = 1;
      logger.error('Error while draining Mastra server', { error });
    }
    try {
      await beforeNativeShutdown?.();
    } catch (error) {
      exitCode = 1;
      logger.error('Error while settling owned native work', { error });
    }
    try {
      await mastra.shutdown({ drainTimeout: Math.min(configuredDrainMs, remaining()) });
    } catch (error) {
      exitCode = 1;
      logger.error('Error during Mastra shutdown', { error });
    }
    if (remaining() === 0) force();
    clearTimeout(totalTimer);
    process.exit(exitCode);
  };
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
}
