import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { runMediaChild } from '../src/storage/media/child.js';
import { createMediaSandbox } from '../src/storage/media/sandbox.js';
import { MEDIA_ARCHIVE } from '../src/storage/media/pins.js';
import { MEDIA_LABEL, mediaContainerArgs } from '../src/storage/media/sandbox-config.js';

test('absolute worker deadline fences late startup and kills work without a live host observer', { timeout: 15000 }, async () => {
  const docker = await realpath('/usr/local/bin/docker'), tools = resolve(`outputs/toolchains/ffmpeg-${MEDIA_ARCHIVE.sha256}/bin`);
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'watchdog-owned-')));
  const cli = async (args: string[]) => (await runMediaChild(docker, args, { timeoutMs: 5000 })).stdout.toString().trim();
  const input=join(directory,'input'),poster=join(directory,'poster'); await writeFile(input,'synthetic');await writeFile(poster,'');await chmod(poster,0o666);
  try {
    for (const late of [true,false]) {
      const owner=randomUUID(),name='workprint-media-watchdog-'+owner;
      const id=await cli(mediaContainerArgs({owner,name},{tools,input,poster},Date.now()+(late?-1000:1500)));
      try {
        const identity=await cli(['inspect',id,'--format',`{{.Id}}|{{.Name}}|{{index .Config.Labels "${MEDIA_LABEL}"}}`]);assert.equal(identity,`${id}|/${name}|${owner}`);
        await cli(['start',id]);
        if (!late) await assert.rejects(runMediaChild(docker,['exec',id,'/usr/local/bin/node','-e','setInterval(()=>{},1000)'],{timeoutMs:5000}),{code:'failed'});
        assert.equal(await cli(['wait',id]),'124','Worker lifetime is enforced inside the container, not by the host observer');
      } finally {
        assert.equal(await cli(['inspect',id,'--format',`{{.Id}}|{{.Name}}|{{index .Config.Labels "${MEDIA_LABEL}"}}`]),`${id}|/${name}|${owner}`);
        await cli(['rm','--force',id]);
      }
    }
  } finally {await rm(directory,{recursive:true});}
});

test('real CPU cgroup throttles parallel work and sandbox cleanup contains output floods', { timeout: 15000 }, async () => {
  const docker=await realpath('/usr/local/bin/docker');const sandbox=await createMediaSandbox({toolchainDirectory:resolve(`outputs/toolchains/ffmpeg-${MEDIA_ARCHIVE.sha256}`),dockerPath:docker});
  const input=await readFile('apps/web/test/fixtures/library-tile.png');
  try {
    await sandbox.use(input,async job=>{
      const source="const {Worker}=require('node:worker_threads');const fs=require('node:fs');const stat=()=>Object.fromEntries(fs.readFileSync('/sys/fs/cgroup/cpu.stat','utf8').trim().split('\\n').map(x=>x.split(' ')).map(([k,v])=>[k,Number(v)]));const before=stat();const started=performance.now();let n=4;for(let i=0;i<4;i++){const w=new Worker('const end=performance.now()+1000;while(performance.now()<end){}',{eval:true});w.on('exit',()=>{if(!--n)process.stdout.write(JSON.stringify({before,after:stat(),ms:performance.now()-started}))})}";
      const result=JSON.parse((await runMediaChild(docker,['exec',job.resource.id,'/usr/local/bin/node','-e',source],{timeoutMs:5000})).stdout.toString()) as {before:Record<string,number>;after:Record<string,number>;ms:number};
      assert.ok(result.after.nr_throttled!>result.before.nr_throttled!);assert.ok(result.after.usage_usec!-result.before.usage_usec!<result.ms*1300,'Aggregate CPU cannot scale with the four busy workers');
    });
    for(const stream of ['stdout','stderr']) await assert.rejects(sandbox.use(input,async job=>{
      await runMediaChild(docker,['exec',job.resource.id,'/usr/local/bin/node','-e',`process.${stream}.write('x'.repeat(65537));setInterval(()=>{},1000)`],{timeoutMs:5000});
    }),{code:'output_limit'});
    await sandbox.use(input,async job=>{await job.probe();});
  } finally {await sandbox.close();}
});
