import { runMediaChild } from '../src/storage/media/child.js';
import type { MediaSandbox } from '../src/storage/media/sandbox.js';

/** Trusted local encoders only. Late SPS changes are after the default native probe window. */
export async function changingParameterFixture(sandbox:MediaSandbox,docker:string,png:Buffer,changedSize='1922x1080'){
  return sandbox.use(png,async job=>{
    const exec=async(args:string[])=>(await runMediaChild(docker,['exec',job.resource.id,...args],{timeoutMs:10000})).stdout;
    for(const [name,size,duration]of [['first','320x180','8'],['wide',changedSize,'1']] as const){
      await exec(['/tools/ffmpeg','-nostdin','-v','error','-threads','1','-filter_threads','1','-f','lavfi','-i',`color=size=${size}:rate=24:duration=${duration}`,'-c:v','libopenh264','-g','1000','-pix_fmt','yuv420p','-b:v','100k','-f','h264','-y',`/work/${name}.h264`]);
    }
    const second=changedSize==='320x180'?'first':'wide';
    await exec(['/usr/local/bin/node','-e',`const f=require('node:fs');f.writeFileSync('/work/change.h264',Buffer.concat([f.readFileSync('/work/first.h264'),f.readFileSync('/work/${second}.h264')]));`]);
    await exec(['/tools/ffmpeg','-nostdin','-v','error','-fflags','+genpts','-r','24','-i','/work/change.h264','-c:v','copy','-movflags','+faststart','-y','/work/change.mp4']);
    const bytes=await exec(['/bin/cat','/work/change.mp4']);
    const initial=await exec(['/tools/ffprobe','-v','error','-show_streams','-show_format','-of','json','/work/change.mp4']);
    const frames=await exec(['/tools/ffprobe','-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=width,height,pix_fmt','-of','csv=p=0','/work/change.mp4']);
    return{bytes,initial,frames};
  });
}

/** Real Baseline JPEG with restart markers and stuffed entropy bytes. */
export async function entropyJpegFixture(sandbox:MediaSandbox,docker:string,png:Buffer){
  return sandbox.use(png,async job=>{
    const exec=async(args:string[])=>(await runMediaChild(docker,['exec',job.resource.id,...args],{timeoutMs:5000})).stdout;
    await exec(['/tools/ffmpeg','-nostdin','-v','error','-threads','2','-filter_threads','1','-f','lavfi','-i','testsrc2=size=240x240:rate=1','-frames:v','1','-c:v','mjpeg','-thread_type','slice','-slices','2','-pix_fmt','yuvj420p','-y','/work/restart.jpg']);
    return exec(['/bin/cat','/work/restart.jpg']);
  });
}

export function postScanExif(jpeg:Buffer){
  // Valid minimal little-endian TIFF with an empty IFD, in a legal APP1 segment after the scan.
  const payload=Buffer.from('45786966000049492a0008000000000000000000','hex'),segment=Buffer.alloc(payload.length+4);
  segment.writeUInt16BE(0xffe1);segment.writeUInt16BE(payload.length+2,2);payload.copy(segment,4);
  return Buffer.concat([jpeg.subarray(0,-2),segment,jpeg.subarray(-2)]);
}
