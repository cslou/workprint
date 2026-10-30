import type { Page } from '@playwright/test';
import type { MaterialNetwork } from './material-network.js';
import { expect } from './material-network.js';
import { account, signIn, origin, privateForward, privateFulfill } from './account-fixture.js';
import type { fixture } from './account-fixture.js';

type Fixture = Awaited<ReturnType<typeof fixture>>;
export async function holdRealResponse(page: Page, pattern: string) {
  let release!: () => void, observed!: (status: number) => void, finished!: () => void;
  let held = false, released = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const seen = new Promise<number>(resolve => { observed = resolve; });
  const done = new Promise<void>(resolve => { finished = resolve; });
  await page.route(pattern, async route => {
    try {
      const response = await privateForward(route); await response.body();
      held = true; observed(response.status()); await gate;
      await privateFulfill(route, { response });
    } finally { held = false; finished(); }
  });
  return { seen, done, held: () => held && !released, release() { released = true; release(); } };
}

export function allowSignIn(network: MaterialNetwork, authOrigin: string) {
  network.expectOperations({ origin: authOrigin, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: authOrigin, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
}
export async function enter(page: Page, network: MaterialNetwork, fixture: Fixture, user: { email: string; password: string }, id?: string) {
  allowSignIn(network, fixture.auth.url);
  await page.goto(origin + (id ? '?conversation=' + id : '')); await account(page); await signIn(page, user.email, user.password);
  await expect(page.getByRole('dialog')).not.toBeVisible();
}
export function allowHistory(network: MaterialNetwork, api: string, accountId: string, id: string, count = 1, readWorkspace = true) {
  network.expectOperations({ origin: api, method: 'GET', path: `/memory/threads/${id}`, query: {}, count }, { origin: api, method: 'GET', path: `/memory/threads/${id}/messages`, query: { resourceId: accountId, page: '0', perPage: '20' }, count });
  if (readWorkspace) network.expectOperations({ origin: api, method: 'GET', path: `/v1/conversations/${id}/workspace`, query: {}, count });
}
export function allowList(network: MaterialNetwork, api: string, resourceId: string, page = 0, count = 1) {
  network.expectOperations({ origin: api, method: 'GET', path: '/memory/threads', query: { resourceId, page: String(page), perPage: '6' }, count });
}
export async function allowCreates(page: Page, network: MaterialNetwork, api: string, count: number) {
  network.expectOperations({ origin: api, method: 'POST', path: '/memory/threads', query: {}, count });
  await page.route('**/memory/threads', async route => {
    const response = await privateForward(route); const thread = await response.json() as { id: string };
    network.expectOperations({ origin: api, method: 'GET', path: `/v1/conversations/${thread.id}/workspace`, query: {}, count: 1 });
    await privateFulfill(route, { response });
  });
}
export async function observeNavigation(page: Page) {
  await page.route('**/src/api/runtime.ts', route => privateFulfill(route, { contentType: 'text/javascript', body: `
import {createConfiguredBrowserClient as original} from '/src/api/runtime.ts?navigation-observation-original';
export function createConfiguredBrowserClient(provider) {
  const connection=original(provider);
  window.navigationCalls={started:{},settled:{}};
  window.navigationTokenAvailable=async()=> (await provider())!==null;
  if(connection.kind!=='configured')return connection;
  const native=Object.fromEntries(Object.entries(connection.client.native).map(([name,method])=>[name,async(...args)=>{
    window.navigationCalls.started[name]=(window.navigationCalls.started[name]??0)+1;
    try{return await method(...args);}finally{window.navigationCalls.settled[name]=(window.navigationCalls.settled[name]??0)+1;}
  }]));
  return {...connection,client:{...connection.client,native}};
}` }));
}
export function navigationSettled(page: Page, name: string) {
  return page.evaluate(name => (window as unknown as { navigationCalls: { settled: Record<string, number> } }).navigationCalls.settled[name] ?? 0, name);
}
export async function settledFrames(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
