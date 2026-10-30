import { MEDIA_IMAGE } from './pins.js';

export const MEDIA_JOB_BYTES = 100 * 1024 * 1024;
export const MEDIA_POSTER_BYTES = 8 * 1024 * 1024;
export const MEDIA_JOB_MS = 30000;
export const MEDIA_LABEL = 'workprint.media';
// Trusted fixed code, not caller JavaScript or a shell. Late starts do no work.
export const MEDIA_WATCHDOG = "const end=Number(process.argv[1]);const left=end-Date.now();if(!Number.isSafeInteger(end)||left<=0||left>30000)process.exit(124);process.on('SIGTERM',()=>process.exit(143));setTimeout(()=>process.exit(124),left);";
export type SandboxResource = Readonly<{ owner: string; name: string; id: string }>;

export function mediaContainerArgs(resource: Omit<SandboxResource, 'id'>, files: { tools: string; input: string; poster: string }, deadline: number): string[] {
  return ['create', '--name', resource.name, '--label', `${MEDIA_LABEL}=${resource.owner}`, '--platform', 'linux/arm64', '--pull', 'never', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '65534:65534', '--memory', '768m', '--memory-swap', '768m', '--pids-limit', '64', '--cpus', '1', '--ulimit', 'cpu=30:30', '--ulimit', 'nofile=64:64', '--ulimit', `fsize=${MEDIA_POSTER_BYTES}:${MEDIA_POSTER_BYTES}`, '--shm-size', '1m', '--tmpfs', '/work:rw,noexec,nosuid,nodev,size=134217728,uid=65534,gid=65534,mode=0700', '--mount', `type=bind,src=${files.tools},dst=/tools,readonly`, '--mount', `type=bind,src=${files.input},dst=/input.bin,readonly`, '--mount', `type=bind,src=${files.poster},dst=/poster.png`, '--env', 'TMPDIR=/work', '--env', 'OMP_NUM_THREADS=1', '--workdir', '/work', '--log-driver', 'none', '--entrypoint', '/usr/local/bin/node', MEDIA_IMAGE, '-e', MEDIA_WATCHDOG, String(deadline)];
}
export const PROBE_ARGS = ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,png_pipe,jpeg_pipe', '-show_streams', '-show_format', '-of', 'json'];
export const DECODE_ARGS = ['-nostdin', '-v', 'error', '-xerror', '-err_detect', 'explode', '-max_alloc', '67108864', '-threads', '1', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,png_pipe,jpeg_pipe', '-i', '/input.bin', '-map', '0:v:0', '-map', '0:a?', '-progress', 'pipe:1', '-nostats', '-f', 'null', '-'];
export const POSTER_ARGS = ['-nostdin', '-v', 'error', '-xerror', '-max_alloc', '67108864', '-threads', '1', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov', '-i', '/input.bin', '-map', '0:v:0', '-frames:v', '1', '-c:v', 'png', '-y', '/poster.png'];
