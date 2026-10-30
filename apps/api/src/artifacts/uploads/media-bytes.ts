import { crc32 } from 'node:zlib';
import { UploadError } from './errors.js';

const invalid = () => new UploadError('invalid_input');
const unsupported = () => new UploadError('unsupported');
/** Closed positively-qualified container/image variants, not MIME or filename inference. */
export function inspectMediaBytes(bytes: Uint8Array, kind: 'image' | 'video', contentType: string): { width?: number; height?: number } {
  const b=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if (!b.length || b.length>(kind==='image'?10:100)*1024**2) throw unsupported();
  if(kind==='image' && contentType==='image/png') {
    if(b.length<33 || !b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw invalid();
    let p=8,count=0,seenData=false,ended=false,width=0,height=0;
    while(p<b.length) {
      if(++count>4096 || p+12>b.length)throw invalid();const n=b.readUInt32BE(p),type=b.toString('ascii',p+4,p+8);if(n>b.length-p-12 || !['IHDR','IDAT','IEND','pHYs'].includes(type))throw unsupported();
      if(crc32(b.subarray(p+4,p+8+n))!==b.readUInt32BE(p+8+n))throw invalid();
      if(type==='IHDR'){if(count!==1 || n!==13)throw invalid();width=b.readUInt32BE(p+8);height=b.readUInt32BE(p+12);if(b[p+16]!==8 || ![2,6].includes(b[p+17]!) || b[p+18]!==0 || b[p+19]!==0 || b[p+20]!==0)throw unsupported();}
      else if(!width || !height)throw invalid();
      if(type==='IDAT')seenData=true;if(type==='pHYs' && n!==9)throw invalid();
      if(type==='IEND'){if(n!==0 || !seenData || p+12!==b.length)throw invalid();ended=true;}
      p+=n+12;
    }
    if(!ended)throw invalid();if(width>4096 || height>4096)throw unsupported();return{width,height};
  }
  if(kind==='image' && contentType==='image/jpeg') {
    if(b.length<4 || b.readUInt16BE(0)!==0xffd8 || b.readUInt16BE(b.length-2)!==0xffd9)throw invalid();
    let p=2,width=0,height=0;
    while(p<b.length-2){if(b[p++]!==255)throw invalid();while(b[p]===255)p++;const marker=b[p++]!;if(marker===0xda)break;if(p+2>b.length)throw invalid();const n=b.readUInt16BE(p);if(n<2 || p+n>b.length)throw invalid();
      if([0xe1,0xe2].includes(marker) || (marker>=0xc0 && marker<=0xcf && ![0xc0,0xc4,0xc8,0xcc].includes(marker)))throw unsupported();
      if(marker===0xc0){if(width || n!==17 || b[p+2]!==8 || b[p+7]!==3)throw unsupported();height=b.readUInt16BE(p+3);width=b.readUInt16BE(p+5);}p+=n;
    }
    if(!width || !height)throw invalid();if(width>4096 || height>4096)throw unsupported();return{width,height};
  }
  if(kind==='video' && contentType==='video/mp4') {
    let p=0;const boxes:string[]=[];
    while(p<b.length){if(boxes.length>64 || p+8>b.length)throw invalid();const n=b.readUInt32BE(p),type=b.toString('ascii',p+4,p+8);if(n<8 || n>b.length-p)throw invalid();if(!['ftyp','moov','mdat','free'].includes(type))throw unsupported();
      if(type==='ftyp'){if(p!==0 || n<16 || n%4 || b.toString('ascii',p+8,p+12)!=='isom')throw unsupported();for(let q=p+16;q<p+n;q+=4)if(!['isom','iso2','avc1','mp41'].includes(b.toString('ascii',q,q+4)))throw unsupported();}
      boxes.push(type);p+=n;
    }
    if(['ftyp','moov','mdat'].some(t=>boxes.filter(x=>x===t).length!==1))throw invalid();return{};
  }
  throw unsupported();
}
