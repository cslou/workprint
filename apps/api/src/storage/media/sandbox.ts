import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, mkdtemp, open, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { runMediaChild } from './child.js';
import { MediaProcessError } from './errors.js';
import { MEDIA_IMAGE, nativeMediaPins } from './pins.js';
import { checkJoinInputs, checkJoinPlan, JOIN_LIST, JOIN_OUTPUT, JOIN_PROBE_ARGS, joinArgs, joinClipPath, joinList, MEDIA_JOIN_OUTPUT_BYTES, type MediaJoinPlan } from './join.js';
import { DECODE_ARGS, MEDIA_JOB_BYTES, MEDIA_JOB_MS, MEDIA_LABEL, MEDIA_POSTER_BYTES, mediaContainerArgs, POSTER_ARGS, PROBE_ARGS, type SandboxResource } from './sandbox-config.js';
import { verifyMediaToolchain } from './toolchain.js';

type Job = { owner: string; name: string; id?: string; directory?: string; attempted: boolean; closed: boolean; controller: AbortController; end: number; reason: 'cancelled' | 'deadline'; running: Set<Promise<unknown>>; done: Promise<void>; finish(): void };
export type MediaSandboxSession = Readonly<{ resource: SandboxResource; probe(): Promise<Buffer>; decode(): Promise<Buffer>; poster(): Promise<{ bytes: Buffer; probe: Buffer; decode: Buffer }> }>;
/** A join job: `probe` reads one clip's streams (with codec configuration hashes); `join` makes and decodes the output. */
export type MediaJoinSession = Readonly<{ resource: SandboxResource; probe(index: number): Promise<Buffer>; join(plan: MediaJoinPlan): Promise<{ bytes: Buffer; decode: Buffer }> }>;

/** One bounded mechanical job, never a backend/queue or caller-provided command surface. */
export async function createMediaSandbox(options: { toolchainDirectory: string; archivePath?: string; dockerPath: string; timeoutMs?: number }) {
  const timeoutMs = options.timeoutMs ?? MEDIA_JOB_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MEDIA_JOB_MS || !isAbsolute(options.dockerPath)) throw new MediaProcessError('invalid_input');
  const docker = await realpath(options.dockerPath).catch(() => { throw new MediaProcessError('unavailable'); });
  const tools = await verifyMediaToolchain(options.toolchainDirectory, options.archivePath);
  const control = async (args: string[]) => (await runMediaChild(docker, args, { timeoutMs: 4000 })).stdout.toString().trim();
  const endpoint = await control(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']);
  if (!endpoint.startsWith('unix://')) throw new MediaProcessError('unavailable');
  const pins = nativeMediaPins();
  const daemon = await control(['info', '--format', '{{.OSType}}|{{.Architecture}}']);
  const native = pins.architecture === 'amd64' ? ['amd64', 'x86_64'] : ['arm64', 'aarch64'];
  if (!native.some(arch => daemon === `linux|${arch}`)) throw new MediaProcessError('unavailable');
  const image = await control(['image', 'inspect', MEDIA_IMAGE, '--format', '{{json .RepoDigests}}|{{.Os}}|{{.Architecture}}']);
  const [digests, os, arch] = image.split('|');
  let listed: unknown; try { listed = JSON.parse(digests ?? ''); } catch { throw new MediaProcessError('unavailable'); }
  if (os !== 'linux' || arch !== pins.architecture || !Array.isArray(listed) || !listed.includes(MEDIA_IMAGE)) throw new MediaProcessError('unavailable');
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
  /** A file the job writes at `dst`, or one the host fills before a step reads it (`host`). */
  type JobFile = Readonly<{ name: string; dst: string; mode: 'input' | 'output' | 'host'; bytes?: Buffer }>;
  type JobContext = Readonly<{ resource: SandboxResource; execute(tool: 'ffmpeg' | 'ffprobe', args: string[]): Promise<Buffer>; read(name: string, limit: number): Promise<Buffer>; fill(name: string, text: string): Promise<void> }>;
  /** Runs `work` in one owned container with `files` mounted; every exit path removes the container and its files. */
  const run = async <T>(files: readonly JobFile[], fsize: number, work: (job: JobContext) => Promise<T>, signal?: AbortSignal): Promise<T> => {
    const owner = randomUUID(); let finish!: () => void;
    const job: Job = { owner, name: `workprint-media-${owner}`, attempted: false, closed: false, controller: new AbortController(), end: Date.now() + timeoutMs, reason: 'cancelled', running: new Set(), done: new Promise<void>(resolve => { finish = resolve; }), finish: () => finish() }; current = job;
    const onAbort = () => job.controller.abort(); signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => { job.reason = 'deadline'; job.controller.abort(); }, timeoutMs);
    const live = () => { if (job.closed || job.controller.signal.aborted) throw new MediaProcessError(job.reason); if (Date.now() >= job.end) { job.reason = 'deadline'; job.controller.abort(); throw new MediaProcessError('deadline'); } };
    const cli = async (args: string[]) => {
      live(); const pending = runMediaChild(docker, args, { timeoutMs: Math.max(1, job.end - Date.now()), signal: job.controller.signal }); job.running.add(pending);
      // The job's own deadline aborts a docker command in flight; that is the deadline, not a Stop.
      try { return (await pending).stdout; }
      catch (error) { throw job.reason === 'deadline' && error instanceof MediaProcessError && error.code === 'cancelled' ? new MediaProcessError('deadline') : error; }
      finally { job.running.delete(pending); }
    };
    let result!: T, failure: unknown, callbackFailure: unknown;
    try {
      job.directory = await realpath(await mkdtemp(join(tmpdir(), 'workprint-media-')));
      if (/[,\n\0]/.test(job.directory)) throw new MediaProcessError('unavailable');
      const path = (name: string) => join(job.directory!, name);
      for (const file of files) {
        if (file.mode === 'input') await writeFile(path(file.name), file.bytes!, { mode: 0o444 });
        else { await writeFile(path(file.name), '', { mode: 0o600 }); if (file.mode === 'output') await chmod(path(file.name), 0o666); else await chmod(path(file.name), 0o644); }
      }
      await writeFile(path('resource.json'), JSON.stringify({ owner, name: job.name, image: MEDIA_IMAGE, deadline: job.end }), { mode: 0o600 });
      job.attempted = true;
      const mounts = files.map(file => ({ src: path(file.name), dst: file.dst, readonly: file.mode !== 'output' }));
      const id = (await cli(mediaContainerArgs(job, { tools, mounts, fsize }, job.end))).toString().trim();
      if (!/^[a-f0-9]{64}$/.test(id)) throw new MediaProcessError('unavailable'); job.id = id;
      await writeFile(path('resource.json'), JSON.stringify({ owner, name: job.name, id, image: MEDIA_IMAGE, deadline: job.end }), { mode: 0o600 });
      const identity = (await cli(['inspect', id, '--format', `{{.Id}}|{{.Name}}|{{index .Config.Labels "${MEDIA_LABEL}"}}`])).toString().trim();
      if (identity !== `${id}|/${job.name}|${job.owner}`) throw new MediaProcessError('cleanup');
      await cli(['start', id]);
      const context: JobContext = Object.freeze({
        resource: Object.freeze({ owner, name: job.name, id }),
        execute: async (tool: 'ffmpeg' | 'ffprobe', args: string[]) => { live(); if (job.running.size) throw new MediaProcessError('capacity'); return cli(['exec', id, `/tools/${tool}`, ...args]); },
        // A file the container wrote, read only when it is still the one regular file the job made, within `limit`.
        read: async (name: string, limit: number) => {
          live(); const file = await open(path(name), constants.O_RDONLY | constants.O_NOFOLLOW);
          try { const stat = await file.stat(); if (!stat.isFile() || stat.nlink !== 1 || !stat.size || stat.size > limit) throw new MediaProcessError('failed'); return await file.readFile(); } finally { await file.close(); }
        },
        // Rewrites a host-filled file in place, so its mount still shows it.
        fill: async (name: string, text: string) => {
          live(); const file = await open(path(name), constants.O_WRONLY | constants.O_NOFOLLOW | constants.O_TRUNC);
          try { await file.writeFile(text, 'utf8'); } finally { await file.close(); }
        },
      });
      const interrupted = new Promise<never>((_, reject) => { job.controller.signal.addEventListener('abort', () => reject(new MediaProcessError(job.reason)), { once: true }); });
      live(); const task = Promise.resolve().then(() => work(context)).catch(error => { callbackFailure = error; throw error; });
      result = await Promise.race([task, interrupted]);
    } catch (error) { failure = error instanceof MediaProcessError || (callbackFailure instanceof Error && error === callbackFailure) ? error : new MediaProcessError('failed'); }
    finally {
      job.closed = true; job.controller.abort(); clearTimeout(timer); signal?.removeEventListener('abort', onAbort); await Promise.allSettled([...job.running]);
      try { await cleanup(job); current = undefined; }
      catch { failure = new AggregateError([...(failure ? [failure] : []), new MediaProcessError('cleanup')], 'Media job cleanup failed; owned resource reference retained'); }
      job.finish();
    }
    if (failure) throw failure; return result;
  };
  /** One job at a time: a closed sandbox, a busy one, inputs `check` refuses or a stopped caller starts nothing. */
  const admit = (check: () => void, signal?: AbortSignal) => {
    if (closed) throw new MediaProcessError('unavailable');
    if (current) throw new MediaProcessError('capacity');
    check();
    if (signal?.aborted) throw new MediaProcessError('cancelled');
  };
  return Object.freeze({
    async use<T>(input: Uint8Array, work: (session: MediaSandboxSession) => Promise<T>, signal?: AbortSignal): Promise<T> {
      admit(() => { if (!input.byteLength || input.byteLength > MEDIA_JOB_BYTES) throw new MediaProcessError('invalid_input'); }, signal);
      const files: JobFile[] = [{ name: 'input', dst: '/input.bin', mode: 'input', bytes: Buffer.from(input) }, { name: 'poster', dst: '/poster.png', mode: 'output' }];
      return run(files, MEDIA_POSTER_BYTES, job => work(Object.freeze({
        resource: job.resource, probe: () => job.execute('ffprobe', [...PROBE_ARGS, '/input.bin']), decode: () => job.execute('ffmpeg', DECODE_ARGS),
        poster: async () => {
          await job.execute('ffmpeg', POSTER_ARGS); const probe = await job.execute('ffprobe', [...PROBE_ARGS, '/poster.png']); const decode = await job.execute('ffmpeg', DECODE_ARGS.map(arg => arg === '/input.bin' ? '/poster.png' : arg));
          return { bytes: await job.read('poster', MEDIA_POSTER_BYTES), probe, decode };
        },
      })), signal);
    },
    /**
     * Joins 2 to 20 clips in one job. `work` probes each clip and then asks for the join with a plan built from those
     * probes; the plan's numbers reach the fixed command (`joinArgs`), never caller text.
     */
    async join<T>(clips: readonly Uint8Array[], work: (session: MediaJoinSession) => Promise<T>, signal?: AbortSignal): Promise<T> {
      admit(() => checkJoinInputs(clips), signal);
      const files: JobFile[] = [...clips.map((clip, index) => ({ name: `clip-${index}`, dst: joinClipPath(index), mode: 'input' as const, bytes: Buffer.from(clip) })),
        { name: 'list', dst: JOIN_LIST, mode: 'host' }, { name: 'output', dst: JOIN_OUTPUT, mode: 'output' }];
      return run(files, MEDIA_JOIN_OUTPUT_BYTES, job => work(Object.freeze({
        resource: job.resource,
        probe: (index: number) => { if (!Number.isInteger(index) || index < 0 || index >= clips.length) throw new MediaProcessError('invalid_input'); return job.execute('ffprobe', [...JOIN_PROBE_ARGS, joinClipPath(index)]); },
        join: async (plan: MediaJoinPlan) => {
          checkJoinPlan(plan, clips.length);
          await job.fill('list', joinList(plan));
          await job.execute('ffmpeg', joinArgs(plan));
          const decode = await job.execute('ffmpeg', DECODE_ARGS.map(arg => arg === '/input.bin' ? JOIN_OUTPUT : arg));
          return { bytes: await job.read('output', MEDIA_JOIN_OUTPUT_BYTES), decode };
        },
      })), signal);
    },
    async close() { closed = true; const job = current; if (!job) return; job.controller.abort(); await job.done; if (current === job) { await cleanup(job); current = undefined; } },
  });
}
export type MediaSandbox = Awaited<ReturnType<typeof createMediaSandbox>>;
