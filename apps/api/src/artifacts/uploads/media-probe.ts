import { z } from 'zod';
import { UploadError } from './errors.js';

const stream=z.object({codec_name:z.string().max(64),codec_type:z.enum(['video','audio']),profile:z.string().max(64).optional(),width:z.number().int().positive().optional(),height:z.number().int().positive().optional(),pix_fmt:z.string().max(32).optional(),codec_tag_string:z.string().max(16).optional(),r_frame_rate:z.string().max(32).optional(),avg_frame_rate:z.string().max(32).optional(),sample_aspect_ratio:z.string().max(32).optional(),field_order:z.string().max(32).optional(),duration:z.string().max(32).optional(),nb_frames:z.string().max(32).optional(),sample_rate:z.string().max(16).optional(),channels:z.number().int().optional(),side_data_list:z.array(z.unknown()).max(0).optional(),disposition:z.object({attached_pic:z.literal(0)}),color_primaries:z.literal('unknown').optional(),color_transfer:z.literal('unknown').optional(),color_space:z.string().max(32).optional()});
const schema=z.object({streams:z.array(stream).min(1).max(2),format:z.object({format_name:z.string().max(100),size:z.string().regex(/^\d+$/),duration:z.string().max(32).optional()})});
export function parseMediaProbe(bytes:Buffer){try{if(bytes.length>65536)throw new Error();return schema.parse(JSON.parse(bytes.toString('utf8')));}catch{throw new UploadError('invalid_input');}}
function decimal(s:string|undefined){if(!s || !/^\d+(\.\d+)?$/.test(s))throw new UploadError('unsupported');const n=Number(s);if(!Number.isFinite(n) || n<=0)throw new UploadError('unsupported');return n;}
function rate(s:string|undefined){if(!s || !/^\d{1,10}\/[1-9]\d{0,9}$/.test(s))throw new UploadError('unsupported');const [a,b]=s.split('/').map(Number);return a!/b!;}
export function measureMediaProbe(probe:ReturnType<typeof parseMediaProbe>,kind:'image'|'video',contentType:string,byteSize:number){
  if(Number(probe.format.size)!==byteSize)throw new UploadError('invalid_input');const videos=probe.streams.filter(s=>s.codec_type==='video'),audio=probe.streams.filter(s=>s.codec_type==='audio');const v=videos[0];if(videos.length!==1 || !v?.width || !v.height)throw new UploadError('unsupported');
  if(kind==='image'){
    if(audio.length || probe.streams.length!==1 || v.width>4096 || v.height>4096 || (v.color_space!==undefined && v.color_space!=='unknown' && v.color_space!==(contentType==='image/png'?'gbr':'bt470bg')))throw new UploadError('unsupported');
    if(contentType==='image/png' ? (v.codec_name!=='png' || probe.format.format_name!=='png_pipe' || !['rgb24','rgba'].includes(v.pix_fmt??'')) : (v.codec_name!=='mjpeg' || probe.format.format_name!=='jpeg_pipe' || v.profile!=='Baseline' || v.pix_fmt!=='yuvj420p'))throw new UploadError('unsupported');
    return{width:v.width,height:v.height,frames:1};
  }
  if(probe.format.format_name!=='mov,mp4,m4a,3gp,3g2,mj2' || v.codec_name!=='h264' || v.codec_tag_string!=='avc1' || v.profile!=='Constrained Baseline' || v.pix_fmt!=='yuv420p' || v.sample_aspect_ratio!=='1:1' || v.field_order!=='progressive' || (v.color_space!==undefined && v.color_space!=='unknown') || v.width>1920 || v.height>1080 || audio.length>1)throw new UploadError('unsupported');
  const fps=rate(v.avg_frame_rate),r=rate(v.r_frame_rate),duration=decimal(v.duration),container=decimal(probe.format.duration),frames=decimal(v.nb_frames);
  if(fps<=0 || fps>60 || fps!==r || duration>120 || container>120 || !Number.isSafeInteger(frames) || frames>7200 || Math.abs(frames/fps-duration)>1/fps || Math.abs(container-duration)>1/fps)throw new UploadError('unsupported');
  const a=audio[0];if(a && (a.codec_name!=='aac' || a.profile!=='LC' || !['8000','11025','12000','16000','22050','24000','32000','44100','48000'].includes(a.sample_rate??'') || ![1,2].includes(a.channels??0) || Math.abs(decimal(a.duration)-duration)>1/fps))throw new UploadError('unsupported');
  return{width:v.width,height:v.height,frames,durationMs:Math.round(duration*1000),hasAudio:!!a};
}
/** Final counters are observed decoder output, not trusted container declarations. */
export function verifyDecodedFrames(progress:Buffer,frames:number,durationMs?:number){
  const lines=progress.toString('utf8').trim().split('\n');const last=new Map<string,string>();for(const line of lines){const p=line.indexOf('=');if(p>0)last.set(line.slice(0,p),line.slice(p+1));}
  const actual=Number(last.get('frame')),micros=Number(last.get('out_time_us'));
  if(last.get('progress')!=='end' || actual!==frames || !Number.isSafeInteger(micros) || micros<0 || (durationMs!==undefined && Math.abs(micros/1000-durationMs)>50))throw new UploadError('invalid_input');
}
