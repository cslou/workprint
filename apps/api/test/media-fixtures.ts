import { readFile } from 'node:fs/promises';
import { runMediaChild } from '../src/storage/media/child.js';
import type { MediaSandbox } from '../src/storage/media/sandbox.js';

export const QUALIFIED_AAC_RATES = [8000,11025,12000,16000,22050,24000,32000,44100,48000] as const;
/** All declared AAC-LC rate/channel combinations, and the no-audio variant. */
export async function qualifiedAudioVariants(sandbox:MediaSandbox,docker:string,video:Buffer){
  return sandbox.use(video,async job=>{
    const exec=async(args:string[])=>(await runMediaChild(docker,['exec',job.resource.id,...args],{timeoutMs:5000})).stdout;
    const fixtures:{bytes:Buffer;probe:Buffer;rate:number;channels:number}[]=[];
    for(const rate of QUALIFIED_AAC_RATES)for(const channels of [1,2]){
      await exec(['/tools/ffmpeg','-nostdin','-v','error','-threads','1','-i','/input.bin','-c:v','copy','-c:a','aac','-ar',String(rate),'-ac',String(channels),'-movflags','+faststart','-y','/work/audio.mp4']);
      fixtures.push({bytes:await exec(['/bin/cat','/work/audio.mp4']),probe:await exec(['/tools/ffprobe','-v','error','-show_streams','-show_format','-of','json','/work/audio.mp4']),rate,channels});
    }
    await exec(['/tools/ffmpeg','-nostdin','-v','error','-i','/input.bin','-an','-c:v','copy','-movflags','+faststart','-y','/work/silent.mp4']);
    fixtures.push({bytes:await exec(['/bin/cat','/work/silent.mp4']),probe:await exec(['/tools/ffprobe','-v','error','-show_streams','-show_format','-of','json','/work/silent.mp4']),rate:0,channels:0});
    return fixtures;
  });
}

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
