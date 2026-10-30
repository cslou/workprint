import assert from 'node:assert/strict';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { runMediaChild } from '../src/storage/media/child.js';
import { createMediaSandbox } from '../src/storage/media/sandbox.js';
import { MEDIA_ARCHIVE } from '../src/storage/media/pins.js';
import { MEDIA_LABEL } from '../src/storage/media/sandbox-config.js';

const toolchainDirectory = resolve(`outputs/toolchains/ffmpeg-${MEDIA_ARCHIVE.sha256}`);

test('owned media sandbox enforces real isolation, resources, deadlines and shutdown without a queue', { timeout: 90000 }, async t => {
  const docker = await realpath('/usr/local/bin/docker');
  const cli = async (args: string[], timeoutMs = 5000) => (await runMediaChild(docker, args, { timeoutMs })).stdout;
  const inspect = async (id: string) => JSON.parse((await cli(['inspect', id])).toString()) as { Id: string; Name: string; State: { OOMKilled: boolean }; Config: { Labels: Record<string, string>; User: string }; HostConfig: { Memory: number; MemorySwap: number; NanoCpus: number; PidsLimit: number; ReadonlyRootfs: boolean; NetworkMode: string; CapDrop: string[] }; Mounts: { Source: string; Destination: string; Type: string; RW: boolean }[] }[];
  const sandbox = await createMediaSandbox({ toolchainDirectory, dockerPath: docker });
  const input = await readFile('apps/web/test/fixtures/library-tile.png');
  try {
    await t.test('real probe/decode and immutable input with exact ownership and hard kernel limits', async () => {
      const captured = Buffer.from(input); let held!: () => void, resume!: () => void;
      const ready = new Promise<void>(resolve => { held = resolve; }), gate = new Promise<void>(resolve => { resume = resolve; });
      const operation = sandbox.use(captured, async job => {
        const [info] = await inspect(job.resource.id); assert.ok(info);
        assert.equal(info.Config.Labels[MEDIA_LABEL], job.resource.owner); assert.equal(info.Name, '/'+job.resource.name); assert.equal(info.Config.User, '65534:65534');
        assert.deepEqual([info.HostConfig.Memory, info.HostConfig.MemorySwap, info.HostConfig.NanoCpus, info.HostConfig.PidsLimit], [768*1024**2,768*1024**2,1000000000,64]);
        assert.equal(info.HostConfig.ReadonlyRootfs, true); assert.equal(info.HostConfig.NetworkMode, 'none'); assert.deepEqual(info.HostConfig.CapDrop, ['ALL']);
        assert.deepEqual(info.Mounts.filter(m => m.RW && m.Type === 'bind').map(m => m.Destination), ['/poster.png']);
        assert.equal(info.Mounts.some(m => m.Destination.includes('sock')), false);
        held(); await gate;
        const probe = JSON.parse((await job.probe()).toString()) as { streams: { codec_name: string; width: number; height: number }[] };
        assert.equal(probe.streams[0]?.codec_name, 'png'); assert.equal(probe.streams[0]?.width, 240); assert.equal(probe.streams[0]?.height, 240); await job.decode();
        return job.resource;
      });
      const settled = Promise.allSettled([operation]);
      try { await Promise.race([ready, operation]); captured.fill(0); await assert.rejects(sandbox.use(input, async () => {}), { code: 'capacity' }); }
      finally { resume(); }
      const [result] = await settled; assert.equal(result!.status, 'fulfilled');
      if (result!.status === 'fulfilled') assert.equal((await cli(['ps','-a','--filter',`name=^/${result!.value.name}$`,'--format','{{.ID}}'])).length, 0);
    });
    await t.test('read-only paths and tmpfs capacity reject actual writes without host directory access', async () => {
      await sandbox.use(input, async job => {
        const code = "const fs=require('node:fs');const facts={};for(const p of ['/escape','/input.bin']){try{fs.writeFileSync(p,'x')}catch(e){facts[p]=e.code}}const b=Buffer.alloc(8*1048576);try{for(let i=0;i<30;i++)fs.writeFileSync('/work/full'+i,b)}catch(e){facts.temp=e.code}facts.memory=fs.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim();facts.pids=fs.readFileSync('/sys/fs/cgroup/pids.max','utf8').trim();process.stdout.write(JSON.stringify(facts));";
        const facts = JSON.parse((await cli(['exec',job.resource.id,'/usr/local/bin/node','-e',code])).toString()) as Record<string,string>;
        assert.deepEqual(facts, { '/escape':'EROFS','/input.bin':'EROFS',temp:'ENOSPC',memory:String(768*1024**2),pids:'64' });
      });
    });
    await t.test('poster output is kernel file-size bounded and media-child errors expose no stderr', async () => {
      await sandbox.use(input, async job => {
        await assert.rejects(cli(['exec',job.resource.id,'/usr/local/bin/node','-e',"require('node:fs').writeFileSync('/poster.png',Buffer.alloc(9*1024*1024))"]), { code: 'failed' });
        const [info] = await inspect(job.resource.id); const path=info!.Mounts.find(m=>m.Destination==='/poster.png')!.Source;
        assert.ok((await stat(path)).size <= 8*1024**2);
      });
    });
    await t.test('real cgroup OOM terminates the memory offender and owned cleanup still completes', async () => {
      await sandbox.use(input, async job => {
        await assert.rejects(cli(['exec',job.resource.id,'/usr/local/bin/node','-e',"const a=[];for(;;)a.push(Buffer.alloc(64*1024*1024,1));"]), { code: 'failed' });
        const [state] = await inspect(job.resource.id);
        if (!state!.State.OOMKilled) assert.match((await cli(['exec',job.resource.id,'/bin/cat','/sys/fs/cgroup/memory.events'])).toString(), /oom_kill [1-9]/);
      });
    });
    await t.test('real PID exhaustion is contained and descendants disappear with the container', async () => {
      await sandbox.use(input, async job => {
        const source = "const {spawn}=require('node:child_process');let errors=[];for(let i=0;i<90;i++){const c=spawn('/bin/sleep',['10'],{stdio:'ignore'});c.on('error',e=>errors.push(e.code))}setTimeout(()=>{process.stdout.write(JSON.stringify(errors));process.exit(0)},400);";
        const codes = JSON.parse((await cli(['exec',job.resource.id,'/usr/local/bin/node','-e',source])).toString()) as string[]; assert.ok(codes.includes('EAGAIN'));
      });
    });
    await t.test('late session calls cannot outlive cancellation and capacity returns only after cleanup', async () => {
      const controller = new AbortController(); let started!: () => void, release!: () => void;
      const ready = new Promise<void>(resolve => { started=resolve; }), gate = new Promise<void>(resolve => { release=resolve; });
      let late: (() => Promise<Buffer>) | undefined;
      const pending = sandbox.use(input, async job => { late=job.probe; started(); await gate; return job.resource; }, controller.signal); const result=Promise.allSettled([pending]);
      await Promise.race([ready, pending]); controller.abort(); await result; release(); await assert.rejects(late!(), { code: 'cancelled' });
      await sandbox.use(input, async job => { await job.probe(); });
    });
  } finally { await sandbox.close(); }
  await assert.rejects(createMediaSandbox({ toolchainDirectory: '/missing-owned-toolchain', dockerPath: docker }), { code: 'unavailable' });
  await assert.rejects(createMediaSandbox({ toolchainDirectory, archivePath: '/missing-owned-archive', dockerPath: docker }), { code: 'unavailable' });
  await assert.rejects(createMediaSandbox({ toolchainDirectory, dockerPath: docker, timeoutMs: 30001 }), { code: 'invalid_input' });
  const guarded = await createMediaSandbox({ toolchainDirectory, dockerPath: docker });
  let renamed: { id: string; name: string; owner: string } | undefined;
  try {
    await assert.rejects(guarded.use(input, async job => { renamed = job.resource; await cli(['rename', job.resource.id, job.resource.name+'-moved']); }), error => error instanceof AggregateError);
    assert.ok(renamed); const [retained] = await inspect(renamed.id); assert.equal(retained!.Config.Labels[MEDIA_LABEL], renamed.owner);
    await assert.rejects(guarded.use(input, async () => {}), { code: 'capacity' });
  } finally {
    if (renamed) { const [info] = await inspect(renamed.id); assert.equal(info!.Config.Labels[MEDIA_LABEL], renamed.owner); await cli(['rename', renamed.id, renamed.name]); }
    await guarded.close();
  }
  const short = await createMediaSandbox({ toolchainDirectory, dockerPath: docker, timeoutMs: 1500 });
  try { await assert.rejects(short.use(input, async () => new Promise<void>(()=>{})), { code: 'deadline' }); }
  finally { await short.close(); }
  const closing = await createMediaSandbox({ toolchainDirectory, dockerPath: docker }); let started!: () => void;
  const ready=new Promise<void>(resolve=>{started=resolve;});
  const pending=closing.use(input,async()=>{started();await new Promise<void>(()=>{});});const settled=Promise.allSettled([pending]);
  await Promise.race([ready, pending]); await closing.close(); const [result]=await settled; assert.equal(result!.status,'rejected');
  await assert.rejects(closing.use(input,async()=>{}),{code:'unavailable'});
});
