import { spawn } from 'node:child_process';
import { open } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

export async function command(command: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv; log: string; timeout?: number }) {
  const running = await start(command, args, options);
  const timer = setTimeout(() => { void running.stop(); }, options.timeout ?? 120000);
  try {
    const code = await running.exited;
    if (code !== 0) throw new Error(`${command} exited ${code}; see ${options.log}`);
  } finally {
    clearTimeout(timer);
    await running.stop();
  }
}

export async function start(command: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv; log: string }) {
  const log = await open(options.log, 'a');
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    detached: true,
    stdio: ['ignore', log.fd, log.fd],
  });
  let done = false;
  let stopped = false;
  const lifetime = setTimeout(() => { void stop(); }, 120000);
  const exited = new Promise<number>((resolve, reject) => {
    child.once('error', (error) => { clearTimeout(lifetime); reject(error); });
    child.once('exit', (code) => { clearTimeout(lifetime); done = true; resolve(code ?? 1); });
  });
  await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  await log.close();
  async function stop() {
    if (stopped) return;
    stopped = true;
    const signal = (value: NodeJS.Signals) => {
      try { process.kill(-child.pid!, value); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
    };
    signal('SIGTERM');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([exited, new Promise<void>((resolve) => { timer = setTimeout(resolve, 7000); })]);
      signal('SIGKILL');
      await exited;
    } finally { clearTimeout(timer); }
  }
  return {
    exited,
    stop,
    async response(url: string) {
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        if (done) throw new Error(`Server exited; see ${options.log}`);
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
          if (response.ok) return response;
        } catch { /* A bound listener is not ready yet. */ }
        await delay(100);
      }
      throw new Error(`Startup deadline exceeded; see ${options.log}`);
    },
  };
}

export async function unusedPort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No TCP address');
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}
