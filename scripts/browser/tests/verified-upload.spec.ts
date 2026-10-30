import { realpath,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test,expect } from '../material-network.js';
import { browserOrigin } from '../origin.js';
import type { Request as BrowserRequest } from '@playwright/test';
import type { verifyBuiltAdmission as Verify } from '../../../apps/api/test/auth-built-fixture.js';
import type { isolatedObjectStorage as Storage } from '../../../apps/api/test/object-storage.js';
import type { qualifiedMediaFixtures as Fixtures } from '../../../apps/api/test/media-fixtures.js';
import type { createMediaSandbox as Sandbox } from '../../../apps/api/src/storage/index.js';
import type { createNativeConversation as Conversation } from '../../../apps/api/test/native-conversations.js';
import type { OperationResponse } from '../../../packages/contracts/src/index.js';
import type { query as Query } from '../../../apps/api/test/postgres.js';
test.use({trace:'off',video:'off'});
test('actual file chooser saves an image and a video poster with credential-free private PUT/GET',async({page,context,materialNetwork})=>{
  test.setTimeout(180000);const load=(path:string)=>import(pathToFileURL(resolve(`apps/api/.test-build/${path}.js`)).href);
  const {verifyBuiltAdmission}=await load('test/auth-built-fixture') as {verifyBuiltAdmission:typeof Verify};const {isolatedObjectStorage}=await load('test/object-storage') as {isolatedObjectStorage:typeof Storage};const {qualifiedMediaFixtures}=await load('test/media-fixtures') as {qualifiedMediaFixtures:typeof Fixtures};const {createMediaSandbox}=await load('src/storage/index') as {createMediaSandbox:typeof Sandbox};const {createNativeConversation}=await load('test/native-conversations') as {createNativeConversation:typeof Conversation};const {query}=await load('test/postgres') as {query:typeof Query};
  const service=await isolatedObjectStorage([browserOrigin]),cleanup:(()=>void|Promise<void>)[]=[];const media={toolchainDirectory:resolve('outputs/toolchains/ffmpeg-6a601112e0d032676f2048205fabe998900d44bac2a57f7ca35619c705326002'),dockerPath:await realpath('/usr/local/bin/docker')};const sandbox=await createMediaSandbox(media);let fixtures:Awaited<ReturnType<typeof qualifiedMediaFixtures>>;try{fixtures=await qualifiedMediaFixtures(sandbox,media.dockerPath);}finally{await sandbox.close();}let account='',conversation='',otherAccount='',otherConversation='';
  try{await verifyBuiltAdmission({diagnostic(){},after(fn){cleanup.push(fn);}},async target=>{
    await context.addCookies([{name:'storage-cookie-control',value:'owned-synthetic-cookie',url:service.endpoint}]);expect((await context.cookies(service.endpoint)).some(c=>c.name==='storage-cookie-control')).toBe(true);
    type Transport={method:string;headersReady:boolean;bearer:boolean;cookie:boolean;responses:number;failures:number;status?:number;cors?:string|null;failure?:string};
    const observed:Transport[]=[],byRequest=new WeakMap<BrowserRequest,Transport>(),headers:Promise<void>[]=[];
    context.on('request',request=>{if(new URL(request.url()).origin!==service.endpoint)return;const row:Transport={method:request.method(),headersReady:false,bearer:false,cookie:false,responses:0,failures:0};observed.push(row);byRequest.set(request,row);headers.push(request.allHeaders().then(h=>{row.headersReady=true;row.bearer=Object.hasOwn(h,'authorization');row.cookie=Object.hasOwn(h,'cookie');}));});
    context.on('response',response=>{const row=byRequest.get(response.request());if(row){row.responses++;row.status=response.status();row.cors=response.headers()['access-control-allow-origin']??null;}});
    context.on('requestfailed',request=>{const row=byRequest.get(request);if(row){row.failures++;const failure=request.failure()?.errorText??'';row.failure=/^net::[A-Z_]+$/.test(failure)?failure:'redacted failure';}});
    let lastUpload='',mode:'normal'|'lost'|'held'='normal',held!:()=>void,release!:()=>void,gate:Promise<void>=Promise.resolve();let lostVersion='';const pinned:{image?:string;video?:string}={};
    const heldConfirmation=()=>{mode='held';gate=new Promise<void>(r=>{release=r;});return new Promise<void>(r=>{held=r;});};
    await page.route(url=>url.origin===target.origin && url.pathname.endsWith('/uploads'),async route=>{const response=await route.fetch(),grant=await response.json() as OperationResponse<'requestUpload'>;lastUpload=grant.uploadId;materialNetwork.expectObjectTransfer(grant.url);materialNetwork.expectOperations({origin:target.origin,method:'POST',path:`/v1/uploads/${grant.uploadId}/confirm`,query:{},count:1});await route.fulfill({response});});
    await page.route(url=>url.origin===target.origin && url.pathname.endsWith('/confirm'),async route=>{const response=await route.fetch(),saved=await response.json() as OperationResponse<'confirmUpload'>;expect(response.status()).toBe(200);if((saved.version.kind==='image'||saved.version.kind==='video')&&!pinned[saved.version.kind])pinned[saved.version.kind]=saved.version.id;
      if(mode==='lost'){mode='normal';lostVersion=saved.version.id;await route.abort('failed');return;}
      if(mode==='held'){mode='normal';held();await gate;try{await route.fulfill({response});}catch(error){if(!route.request().failure())throw error;}return;}
      if(lostVersion){expect(saved.version.id).toBe(lostVersion);lostVersion='';}
      materialNetwork.expectOperations({origin:target.origin,method:'GET',path:`/v1/versions/${saved.version.id}/media`,query:{},count:1});await route.fulfill({response});});
    await page.route(url=>url.origin===target.origin && url.pathname.endsWith('/media'),async route=>{const response=await route.fetch(),access=await response.json() as OperationResponse<'media'>;materialNetwork.expectObjectTransfer(access.poster??access.url,1,'GET');await route.fulfill({response});});
    await page.goto('/uploads.html');await page.waitForFunction(()=>!!(window as unknown as {uploadsTest:unknown}).uploadsTest);
    await page.evaluate(input=>(window as unknown as {uploadsTest:{configure(input:unknown):void}}).uploadsTest.configure(input),{apiOrigin:target.origin,token:target.accessTokens[0]!,accountId:account,conversationId:conversation});
    for(const [kind,bytes,type] of [['Image',fixtures.png,'image/png'],['Video',fixtures.video,'video/mp4']] as const){materialNetwork.expectOperations({origin:target.origin,method:'POST',path:`/v1/conversations/${conversation}/uploads`,query:{},count:1});await page.getByLabel('Choose an image or video').setInputFiles({name:type==='image/png'?'synthetic.png':'synthetic.mp4',mimeType:type,buffer:bytes});await expect(page.getByRole('heading',{name:`${kind} saved · Version 1`})).toBeVisible();await expect(page.getByRole('img',{name:kind==='Video'?'Saved video poster':'Saved image'})).toBeVisible();await expect(page.locator('video')).toHaveCount(0);await page.getByRole('button',{name:'Close',exact:true}).click();}
    const selectImage=async(name:string)=>{materialNetwork.expectOperations({origin:target.origin,method:'POST',path:`/v1/conversations/${conversation}/uploads`,query:{},count:1});await page.getByLabel('Choose an image or video').setInputFiles({name,mimeType:'image/png',buffer:fixtures.png});};
    const expectSaved=async()=>{await expect(page.getByRole('heading',{name:'Image saved · Version 1'})).toBeVisible();await expect(page.getByRole('img',{name:'Saved image',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close',exact:true}).click();};
    mode='lost';await selectImage('response-loss.png');await expect(page.getByRole('heading',{name:'Save could not be confirmed'})).toBeVisible();
    materialNetwork.expectOperations({origin:target.origin,method:'POST',path:`/v1/uploads/${lastUpload}/confirm`,query:{},count:1});await page.getByRole('button',{name:'Retry confirmation'}).click();await expectSaved();
    const atStopped=heldConfirmation();await selectImage('stopped.png');await atStopped;await page.getByRole('button',{name:'Stop waiting',exact:true}).click();await expect(page.getByRole('heading',{name:'Stopped waiting for this upload'})).toBeVisible();release();
    materialNetwork.expectOperations({origin:target.origin,method:'POST',path:`/v1/uploads/${lastUpload}/confirm`,query:{},count:1});await page.getByRole('button',{name:'Check upload'}).click();await expectSaved();
    const atLate=heldConfirmation();await selectImage('late-scope.png');await atLate;
    await page.evaluate(input=>(window as unknown as {uploadsTest:{configure(input:unknown):void}}).uploadsTest.configure(input),{apiOrigin:target.origin,token:target.accessTokens[1]!,accountId:otherAccount,conversationId:otherConversation});
    await expect(page.getByRole('heading',{name:'Upload closed after scope change'})).toBeVisible();release();await expect(page.getByRole('region',{name:'Upload status'})).not.toContainText('late-scope.png');await expect(page.getByRole('img')).toHaveCount(0);
    // Reload reads real persisted uses; no upload/controller state or seeded media verdict survives.
    await page.goto('/saved-work.html');await page.waitForFunction(()=>!!(window as unknown as {savedWorkTest:unknown}).savedWorkTest);
    materialNetwork.expectOperations({origin:target.origin,method:'GET',path:`/v1/conversations/${conversation}/workspace`,query:{},count:1},{origin:target.origin,method:'GET',path:`/v1/conversations/${conversation}/generation-requests`,query:{},count:1});
    const unavailableStatus=page.waitForResponse(response=>new URL(response.url()).pathname===`/v1/conversations/${conversation}/generation-requests`);
    await page.evaluate(input=>(window as unknown as {savedWorkTest:{configure(input:unknown):void}}).savedWorkTest.configure(input),{apiOrigin:target.origin,token:target.accessTokens[0]!,accountId:account,conversationId:conversation});
    const status=await unavailableStatus;expect(status.status()).toBe(501);expect((await status.json() as {error:{code:string}}).error.code).toBe('not_implemented');
    await page.getByRole('tab',{name:'Assets',exact:true}).click();
    for(const kind of ['image','video'] as const){const id=pinned[kind];expect(id).toBeTruthy();const row=page.locator(`.wp-asset-row[data-media-version-id="${id}"]`);await expect(row).toBeVisible();materialNetwork.expectOperations({origin:target.origin,method:'GET',path:`/v1/versions/${id}/media`,query:{},count:1});await row.click();const dialog=page.getByRole('dialog');await expect(dialog.locator(`[data-media-version-id="${id}"]`)).toBeVisible();await expect(dialog.getByRole('img',{name:kind==='video'?'Saved video poster':'Saved image',exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:/Approve|Choose|Use this/})).toHaveCount(0);await dialog.getByRole('button',{name:'Close',exact:true}).last().click();}
    await Promise.all(headers);const evidence=test.info().outputPath('redacted-private-request-results.json');await writeFile(evidence,JSON.stringify(observed,null,2));await test.info().attach('redacted-private-request-results',{path:evidence,contentType:'application/json'});
    expect(observed.map(v=>v.method)).toEqual(['PUT','GET','PUT','GET','PUT','GET','PUT','GET','PUT','GET','GET']);
    expect(observed.every(v=>v.headersReady&&!v.bearer&&!v.cookie)).toBe(true);
    expect(observed.every(v=>v.responses===1&&v.status===200&&v.cors===browserOrigin)).toBe(true);
    // Cancelling the unused PUT response body can emit requestfailed after HTTP200.
    // It is not another request or another transfer. Only that correlated abort is allowed.
    expect(observed.every(v=>v.failures===0||(v.failures===1&&v.method==='PUT'&&v.status===200&&v.failure==='net::ERR_ABORTED'))).toBe(true);materialNetwork.assertSafe();
  },{media,browserOrigin,storage:{endpoint:service.endpoint,bucket:service.bucket,region:'us-east-1',credentials:service.credentials},prepareSavedWork:async setup=>{account=setup.accountIds[0]!;otherAccount=setup.accountIds[1]!;conversation=(await createNativeConversation(setup.native,account)).id;otherConversation=(await createNativeConversation(setup.native,otherAccount)).id;},verifySavedEffects:async url=>{expect((await query(url,"SELECT (SELECT count(*)::int FROM artifacts.versions) AS versions,(SELECT count(*)::int FROM artifacts.media_objects) AS pointers,(SELECT count(*)::int FROM artifacts.conversation_uses WHERE state='draft') AS drafts,(SELECT count(*)::int FROM artifacts.manual_changes) AS approvals")).rows).toEqual([{versions:5,pointers:5,drafts:5,approvals:0}]);}});
  }finally{for(const close of cleanup.reverse())await close();await service.close();}
});
