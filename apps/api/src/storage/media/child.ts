import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { MediaProcessError } from './errors.js';

export const CHILD_OUTPUT_BYTES = 65536;
/** Trusted executable/argv only. Never retain raw process errors, credentials or unbounded output. */
export function runMediaChild(executable: string, args: readonly string[], options: { timeoutMs: number; signal?: AbortSignal; outputBytes?: number }): Promise<{ stdout: Buffer; stderr: Buffer }> {
  const limit = options.outputBytes ?? CHILD_OUTPUT_BYTES;
  if (!isAbsolute(executable) || executable.includes('\0') || args.length > 128 || args.some(arg => arg.includes('\0') || arg.length > 4096) || !Number.isInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 30000 || !Number.isInteger(limit) || limit < 1 || limit > CHILD_OUTPUT_BYTES) return Promise.reject(new MediaProcessError('invalid_input'));
  if (options.signal?.aborted) return Promise.reject(new MediaProcessError('cancelled'));
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], { shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: '/usr/local/bin:/usr/bin:/bin', ...(process.env.HOME ? { HOME: process.env.HOME } : {}), LANG: 'C.UTF-8' } });
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    let outBytes = 0, errBytes = 0, failure: MediaProcessError | undefined, closed = false;
    const stop = (code: MediaProcessError['code']) => {
      failure ??= new MediaProcessError(code);
      if (!closed && child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') failure = new MediaProcessError('cleanup'); }
      }
    };
    const abort = () => stop('cancelled');
    const timer = setTimeout(() => stop('deadline'), options.timeoutMs);
    options.signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => { outBytes += chunk.length; if (outBytes > limit) stop('output_limit'); else if (!failure) stdout.push(chunk); });
    child.stderr.on('data', (chunk: Buffer) => { errBytes += chunk.length; if (errBytes > limit) stop('output_limit'); else if (!failure) stderr.push(chunk); });
    child.once('error', () => stop('unavailable'));
    child.once('close', code => {
      closed = true; clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new MediaProcessError('failed'));
      else resolve({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
    });
  });
}
