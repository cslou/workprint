import { readFile } from 'node:fs/promises';
import { runMediaChild } from '../src/storage/media/child.js';
import type { MediaSandbox } from '../src/storage/media/sandbox.js';

/** Trusted synthetic fixture generation only; never exposed as product conversion. */
export async function qualifiedMediaFixtures(sandbox: MediaSandbox, docker: string) {
  const png=await readFile('apps/web/test/fixtures/library-tile.png');
  return sandbox.use(png,async job=>{
    const exec=async(args:string[])=>(await runMediaChild(docker,['exec',job.resource.id,...args],{timeoutMs:5000})).stdout;
    await exec(['/tools/ffmpeg','-nostdin','-v','error','-threads','1','-filter_threads','1','-i','/input.bin','-frames:v','1','-pix_fmt','yuvj420p','-y','/work/still.jpg']);
    await exec(['/tools/ffmpeg','-nostdin','-v','error','-threads','1','-filter_threads','1','-f','lavfi','-i','testsrc2=size=320x180:rate=24:duration=1','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=1','-map','0:v','-map','1:a','-c:v','libopenh264','-pix_fmt','yuv420p','-b:v','100k','-c:a','aac','-ac','2','-b:a','64k','-movflags','+faststart','-t','1','-y','/work/clip.mp4']);
    const jpeg=await exec(['/bin/cat','/work/still.jpg']),video=await exec(['/bin/cat','/work/clip.mp4']);
    const progress=await exec(['/tools/ffmpeg','-nostdin','-v','error','-xerror','-err_detect','explode','-threads','1','-i','/work/clip.mp4','-map','0:v:0','-map','0:a?','-progress','pipe:1','-nostats','-f','null','-']);
    return {png,jpeg,video,progress};
  });
}
