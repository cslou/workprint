import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, mkdtemp, open, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { runMediaChild } from './child.js';
import { MediaProcessError } from './errors.js';
import { MEDIA_IMAGE } from './pins.js';
import { DECODE_ARGS, MEDIA_JOB_BYTES, MEDIA_JOB_MS, MEDIA_LABEL, MEDIA_POSTER_BYTES, mediaContainerArgs, POSTER_ARGS, PROBE_ARGS, type SandboxResource } from './sandbox-config.js';
import { verifyMediaToolchain } from './toolchain.js';

type Job = { owner: string; name: string; id?: string; directory?: string; attempted: boolean; closed: boolean; controller: AbortController; end: number; reason: 'cancelled' | 'deadline'; running: Set<Promise<unknown>>; done: Promise<void>; finish(): void };
export type MediaSandboxSession = Readonly<{ resource: SandboxResource; probe(): Promise<Buffer>; decode(): Promise<Buffer>; poster(): Promise<{ bytes: Buffer; probe: Buffer; decode: Buffer }> }>;

/** One bounded mechanical job, never a backend/queue or caller-provided command surface. */
export async function createMediaSandbox(options: { toolchainDirectory: string; archivePath?: string; dockerPath: string; timeoutMs?: number }) {
  const timeoutMs = options.timeoutMs ?? MEDIA_JOB_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MEDIA_JOB_MS || !isAbsolute(options.dockerPath)) throw new MediaProcessError('invalid_input');
  const docker = await realpath(options.dockerPath).catch(() => { throw new MediaProcessError('unavailable'); });
  const tools = await verifyMediaToolchain(options.toolchainDirectory, options.archivePath);
  const control = async (args: string[]) => (await runMediaChild(docker, args, { timeoutMs: 4000 })).stdout.toString().trim();
  const endpoint = await control(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']);
  if (!endpoint.startsWith('unix://')) throw new MediaProcessError('unavailable');
  const image = await control(['image', 'inspect', MEDIA_IMAGE, '--format', '{{json .RepoDigests}}|{{.Os}}|{{.Architecture}}']);
  const [digests, os, arch] = image.split('|');
  let listed: unknown; try { listed = JSON.parse(digests ?? ''); } catch { throw new MediaProcessError('unavailable'); }
  if (os !== 'linux' || arch !== 'arm64' || !Array.isArray(listed) || !listed.includes(MEDIA_IMAGE)) throw new MediaProcessError('unavailable');
  let current: Job | undefined, closed = false;
  const cleanup = async (job: Job) => {
    if (job.attempted) {
      const matches = (await control(['ps', '-a', '--no-trunc', '--filter', job.id ? `id=${job.id}` : `name=^/${job.name}$`, '--format', '{{.ID}}'])).split('\n').filter(Boolean);
      if (matches.length > 1 || (!matches.length && !job.id)) throw new MediaProcessError('cleanup');
      if (matches.length) {
        const id = matches[0]!;
        const identity = await control(['inspect', id, '--format', `{{.Id}}|{{.Name}}|{{index .Config.Labels "${MEDIA_LABEL}"}}`]);
        if (!/^[a-f0-9]{64}$/.test(id) || (job.id && id !== job.id) || identity !== `${id}|/${job.name}|${job.owner}`) throw new MediaProcessError('cleanup');
        job.id = id;
        await control(['rm', '--force', id]);
      }
    }
    if (job.directory) await rm(job.directory, { recursive: true });
  };
  return Object.freeze({
    async use<T>(input: Uint8Array, work: (session: MediaSandboxSession) => Promise<T>, signal?: AbortSignal): Promise<T> {
      if (closed) throw new MediaProcessError('unavailable');
      if (current) throw new MediaProcessError('capacity');
      if (!input.byteLength || input.byteLength > MEDIA_JOB_BYTES) throw new MediaProcessError('invalid_input');
      if (signal?.aborted) throw new MediaProcessError('cancelled');
      const captured = Buffer.from(input), owner = randomUUID(); let finish!: () => void;
      const job: Job = { owner, name: `workprint-media-${owner}`, attempted: false, closed: false, controller: new AbortController(), end: Date.now() + timeoutMs, reason: 'cancelled', running: new Set(), done: new Promise<void>(resolve => { finish = resolve; }), finish: () => finish() }; current = job;
      const onAbort = () => job.controller.abort(); signal?.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => { job.reason = 'deadline'; job.controller.abort(); }, timeoutMs);
      const live = () => { if (job.closed || job.controller.signal.aborted) throw new MediaProcessError(job.reason); if (Date.now() >= job.end) { job.reason = 'deadline'; job.controller.abort(); throw new MediaProcessError('deadline'); } };
      const cli = async (args: string[]) => {
        live(); const pending = runMediaChild(docker, args, { timeoutMs: Math.max(1, job.end - Date.now()), signal: job.controller.signal }); job.running.add(pending);
        try { return (await pending).stdout; } finally { job.running.delete(pending); }
      };
      let result!: T, failure: unknown, callbackFailure: unknown;
      try {
        job.directory = await realpath(await mkdtemp(join(tmpdir(), 'workprint-media-')));
        if (/[,\n\0]/.test(job.directory)) throw new MediaProcessError('unavailable');
        const inputFile = join(job.directory, 'input'), posterFile = join(job.directory, 'poster');
        await writeFile(inputFile, captured, { mode: 0o444 }); await writeFile(posterFile, '', { mode: 0o600 }); await chmod(posterFile, 0o666);
        await writeFile(join(job.directory, 'resource.json'), JSON.stringify({ owner, name: job.name, image: MEDIA_IMAGE, deadline: job.end }), { mode: 0o600 });
        job.attempted = true;
        const id = (await cli(mediaContainerArgs(job, { tools, input: inputFile, poster: posterFile }, job.end))).toString().trim();
        if (!/^[a-f0-9]{64}$/.test(id)) throw new MediaProcessError('unavailable'); job.id = id;
        await writeFile(join(job.directory, 'resource.json'), JSON.stringify({ owner, name: job.name, id, image: MEDIA_IMAGE, deadline: job.end }), { mode: 0o600 });
        const identity = (await cli(['inspect', id, '--format', `{{.Id}}|{{.Name}}|{{index .Config.Labels "${MEDIA_LABEL}"}}`])).toString().trim();
        if (identity !== `${id}|/${job.name}|${job.owner}`) throw new MediaProcessError('cleanup');
        await cli(['start', id]);
        const execute = async (tool: 'ffmpeg' | 'ffprobe', args: string[]) => { live(); if (job.running.size) throw new MediaProcessError('capacity'); return cli(['exec', id, `/tools/${tool}`, ...args]); };
        const session: MediaSandboxSession = Object.freeze({ resource: Object.freeze({ owner, name: job.name, id }), probe: () => execute('ffprobe', [...PROBE_ARGS, '/input.bin']), decode: () => execute('ffmpeg', DECODE_ARGS), poster: async () => {
          await execute('ffmpeg', POSTER_ARGS); const probe = await execute('ffprobe', [...PROBE_ARGS, '/poster.png']); const decode = await execute('ffmpeg', DECODE_ARGS.map(arg => arg === '/input.bin' ? '/poster.png' : arg)); live();
          const file = await open(posterFile, constants.O_RDONLY | constants.O_NOFOLLOW);
          try { const stat = await file.stat(); if (!stat.isFile() || stat.nlink !== 1 || !stat.size || stat.size > MEDIA_POSTER_BYTES) throw new MediaProcessError('failed'); return { bytes: await file.readFile(), probe, decode }; } finally { await file.close(); }
        } });
        const interrupted = new Promise<never>((_, reject) => { job.controller.signal.addEventListener('abort', () => reject(new MediaProcessError(job.reason)), { once: true }); });
        live(); const task = Promise.resolve().then(() => work(session)).catch(error => { callbackFailure = error; throw error; });
        result = await Promise.race([task, interrupted]);
      } catch (error) { failure = error instanceof MediaProcessError || (callbackFailure instanceof Error && error === callbackFailure) ? error : new MediaProcessError('failed'); }
      finally {
        job.closed = true; job.controller.abort(); clearTimeout(timer); signal?.removeEventListener('abort', onAbort); await Promise.allSettled([...job.running]);
        try { await cleanup(job); current = undefined; }
        catch { failure = new AggregateError([...(failure ? [failure] : []), new MediaProcessError('cleanup')], 'Media job cleanup failed; owned resource reference retained'); }
        job.finish();
      }
      if (failure) throw failure; return result;
    },
    async close() { closed = true; const job = current; if (!job) return; job.controller.abort(); await job.done; if (current === job) { await cleanup(job); current = undefined; } },
  });
}
export type MediaSandbox = Awaited<ReturnType<typeof createMediaSandbox>>;
