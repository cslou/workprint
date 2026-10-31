import type { Page, TestInfo } from '@playwright/test';
import { expect, type MaterialNetwork } from './material-network.js';
import type { OperationResponse } from '../../packages/contracts/src/index.js';
import { captureVerifiedUploadPair } from './verified-upload-pair.js';

export type RecoveryPlan = { authorization: 'normal'|'expired'; put: 'normal'|'interrupt'; confirmation: 'normal'|'damaged' };
/** Real chooser/controller against the owned backend; only transport loss and browser clock skew are controlled. */
export async function verifyUploadRecovery(page:Page,info:TestInfo,network:MaterialNetwork,input:{origin:string;conversation:string;png:Buffer;visual:boolean;plan:RecoveryPlan;grant():OperationResponse<'requestUpload'>}) {
  const {origin,conversation,png,visual,plan}=input;
  const capture = async (state:Parameters<typeof captureVerifiedUploadPair>[2],name:string,size:number) => { if(visual)await captureVerifiedUploadPair(page,info,state,{name,size,...(state==='expired'?{condition:'controlled-clock-skew' as const}:state==='interrupted'?{condition:'controlled-transport-loss' as const}:{})}); };
  const choose = async (name:string,type:string,buffer:Buffer,request=false) => {
    if(request)network.expectOperations({origin,method:'POST',path:`/v1/conversations/${conversation}/uploads`,query:{},count:1});
    await page.getByLabel('Choose a JPEG or PNG image').setInputFiles({name,mimeType:type,buffer});
  };
  const dismiss = async () => { await page.getByRole('button',{name:'Choose another file',exact:true}).click(); };
  const before=network.entries.filter(entry=>!['GET','HEAD','OPTIONS'].includes(entry.method)).length;
  await choose('unsupported.svg','image/svg+xml',Buffer.from([1,2,3]));
  await expect(page.getByRole('heading',{name:'This image is not supported'})).toBeVisible();
  await capture('rejected-format','unsupported.svg',3); await dismiss();
  const large=Buffer.alloc(10*1024*1024+1);
  await choose('large.png','image/png',large);
  await expect(page.getByRole('heading',{name:'This image is too large'})).toBeVisible();
  await capture('rejected-size','large.png',large.length); await dismiss();
  expect(network.entries.filter(entry=>!['GET','HEAD','OPTIONS'].includes(entry.method))).toHaveLength(before);

  // A real staged PNG with a damaged IHDR CRC reaches real verification and creates no version.
  const damaged=Buffer.from(png);damaged[29]=damaged[29]!^1;plan.confirmation='damaged';
  await choose('damaged.png','image/png',damaged,true);
  await expect(page.getByRole('heading',{name:'This file could not be verified'})).toBeVisible();
  await capture('rejected-damaged','damaged.png',damaged.length); await dismiss();

  // Clock skew exercises client-side expiry without altering a server grant or bypassing authorization.
  // Storage/SQL real expiry is covered separately; this is not an actual S3-expiry claim.
  plan.authorization='expired';
  await choose('expired.png','image/png',png,true);
  await expect(page.getByRole('heading',{name:'Upload link expired'})).toBeVisible();
  await capture('expired','expired.png',png.length);
  const first=input.grant().uploadId,operation=network.entries.filter(entry=>entry.method==='POST'&&entry.url.pathname.endsWith('/uploads')).at(-1)!.body;
  network.expectOperations({origin,method:'POST',path:`/v1/conversations/${conversation}/uploads`,query:{},count:1});
  await page.getByRole('button',{name:'Upload again',exact:true}).click();
  await expect.poll(()=>input.grant().uploadId).not.toBe(first);
  await expect(page.getByRole('heading',{name:'Upload link expired'})).toBeVisible();
  expect(network.entries.filter(entry=>entry.method==='POST'&&entry.url.pathname.endsWith('/uploads')).at(-1)!.body).not.toEqual(operation);
  await page.clock.setFixedTime(new Date());plan.authorization='normal';await dismiss();

  // Explicit retry consumes the same signed PUT and confirmation identity, not another grant.
  plan.put='interrupt';
  await choose('interrupted.png','image/png',png,true);
  await expect(page.getByRole('heading',{name:'Upload interrupted'})).toBeVisible();
  await capture('interrupted','interrupted.png',png.length);
  const grant=input.grant(),requests=network.entries.filter(entry=>entry.method==='POST'&&entry.url.pathname.endsWith('/uploads')).length;
  network.expectObjectTransfer(grant.url);
  await page.getByRole('button',{name:'Try again',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Image saved · Version 1'})).toBeVisible();
  await expect(page.getByRole('img',{name:'Saved image',exact:true})).toBeVisible();
  await expect(page.locator('.wp-main')).toHaveAttribute('aria-busy','false');
  expect(network.entries.filter(entry=>entry.method==='POST'&&entry.url.pathname.endsWith('/uploads'))).toHaveLength(requests);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await expect(page.getByRole('button',{name:'Attach a file',exact:true})).toBeFocused();
  await expect(page.locator('video')).toHaveCount(0);
}
