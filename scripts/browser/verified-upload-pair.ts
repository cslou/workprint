import { createHash } from 'node:crypto';
import { readFile, realpath, mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep, join } from 'node:path';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { capturePairSide } from './capture-pair.js';
import { compare } from './compare.js';

const states = ['image-only-ready','video-unavailable','authorizing','uploading','verifying','image-saved','expired','interrupted','confirmation-unknown','stopped','rejected-format','rejected-size','rejected-damaged','image-loading','image-error','image-expired','scope-cleared'] as const;
export type VerifiedUploadState = typeof states[number];
type Facts = { name?: string; size?: number; image?: Buffer; video?: boolean; condition?: 'controlled-transport-loss'|'controlled-clock-skew-and-transport-loss'|'controlled-clock-skew' };
/** Independently authored tracked cards in the frozen shell, never rendered-application baselines. */
export async function captureVerifiedUploadPair(actual: Page, info: TestInfo, state: VerifiedUploadState, facts: Facts, persisted = false) {
  if (!states.includes(state)) throw new Error('Unsupported upload reference');
  const root = await realpath(process.cwd()), hashes: Record<string,string> = {};
  const load = async (relative: string) => {
    const path = await realpath(resolve(root,relative));
    if (!path.startsWith(root+sep)) throw new Error('Reference escaped its repository');
    const content = await readFile(path,'utf8'); hashes[relative] = createHash('sha256').update(content).digest('hex'); return content;
  };
  const source = await load(`docs/design/verified-uploads-r1/${persisted ? `persisted-${facts.video ? 'poster' : 'image'}` : state}.html`);
  const guidance = await load('docs/design/verified-uploads-r1/image-only-guidance.html');
  const surroundings = await load('docs/design/verified-uploads-r1/persisted-context.html');
  await load('docs/design/flow2-step1-r73.html'); await load('docs/design/app-r11.css'); await load('docs/design/brand-book/book.css');
  const styles = await Promise.all(['assets/tokens.css','assets/foundations.css','preview.css','frame.css'].map(path=>load(`docs/design/verified-uploads-r1/${path}`)));
  const reference = await actual.context().newPage();
  try {
    const image = facts.image;
    if (image) await reference.route('**/__verified_reference_fixture',route=>route.fulfill({contentType:'image/png',body:image}));
    for (const width of [1440,390,820,821]) {
      const viewport = {width,height:width===390?844:900}; await actual.setViewportSize(viewport); await reference.setViewportSize(viewport);
      await reference.goto('/references/flow2-step1-r73.html');
      for (const content of styles) await reference.addStyleTag({content});
      await reference.addStyleTag({content:':root{--font-sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--font-display:Georgia,"Times New Roman",serif}'});
      await reference.evaluate(({source,surroundings,guidance,facts,state,persisted})=>{
        document.querySelector('.section')!.insertAdjacentHTML('beforeend','<span class="navitem">Open conversation</span>');
        if (persisted) {
          const context = new DOMParser().parseFromString(surroundings,'text/html');
          document.querySelector('#p-assets')!.replaceChildren(...context.querySelector('.receipt-assets')!.children);
          document.querySelectorAll('.pv.default,.ptabs .default').forEach(node=>node.classList.remove('default'));
          document.querySelector('#p-assets')!.classList.add('default'); document.querySelector('.ptabs a[href="#p-assets"]')!.classList.add('default');
        }
        const doc = new DOMParser().parseFromString(source,'text/html');
        const note = new DOMParser().parseFromString(guidance,'text/html').querySelector('.preview-guidance')!;
        document.querySelector('.composer')!.after(note);
        if(state==='image-only-ready')return;
        if (['authorizing','uploading','verifying'].includes(state)) document.querySelector('.composer .attach')!.setAttribute('aria-disabled','true');
        const node = doc.querySelector(persisted ? '.wp-modal-overlay' : '.preview-upload');
        if (!node) throw new Error('Missing tracked upload placement');
        const card = node.matches('.preview-upload') ? node : node.querySelector('.preview-upload')!;
        const heading = card.querySelector('h3')!;
        if (state==='authorizing'||state==='uploading') heading.textContent=`${state==='authorizing'?'Preparing':'Uploading'} ${facts.name}…`;
        const meta = card.querySelector('.preview-meta');
        if (meta && facts.size!==undefined) meta.textContent=`${persisted ? facts.video?'MP4':'PNG' : facts.name} · ${facts.size>=1024**2?`${(facts.size/1024**2).toFixed(1)} MiB`:`${(facts.size/1024).toFixed(1)} KiB`}`;
        const image = card.querySelector('img');
        if (image) { image.setAttribute('src','/__verified_reference_fixture'); image.setAttribute('alt',facts.video?'Synthetic native poster fixture':'Synthetic PNG fixture'); }
        const measured = card.querySelector('.wp-status + .preview-meta');
        if (measured) measured.textContent = facts.video ? ' · 320 × 180 · 0:01 · AAC audio' : ' · 240 × 240 · PNG';
        if (persisted) document.body.append(node); else note.after(node);
      },{source,surroundings,guidance,facts:{name:facts.name,size:facts.size,video:facts.video},state,persisted});
      const label = `${persisted?'persisted':'main'}-${state}-${width}`, folder=info.outputPath(label); await mkdir(folder,{recursive:true});
      const nested = {...info,outputPath:(...parts:string[])=>join(folder,...parts)} as TestInfo;
      const refCard=state==='image-only-ready'?'.preview-guidance':'.preview-upload',actualCard=state==='image-only-ready'?'.wp-upload-guidance':'.wp-upload-status';
      const refSelectors = persisted?['.wp-modal','.preview-upload']:['.main','.composer',refCard];
      const actualSelectors = persisted?['.wp-modal','.wp-upload-status']:['.wp-main','.wp-opening-composer',actualCard];
      // Mobile Shell is the existing naturally scrolling page, not a fixed-height card stage.
      // Prove every receipt control is reachable, and neither page nor card overflows horizontally.
      const reachability = async (page:Page,selector:string) => {
        const card=page.locator(selector);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        expect(await card.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
        for(const button of await card.getByRole('button').all()) {
          await button.evaluate(node=>node.scrollIntoView({block:'center',inline:'nearest'})); const box=await button.boundingBox(); expect(box).not.toBeNull();
          expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y+box!.height).toBeLessThanOrEqual(viewport.height);
        }
      };
      await reachability(reference,refCard); await reachability(actual,actualCard);
      const expected = await capturePairSide(reference,nested,refSelectors,'reference',persisted?'.wp-modal':'.main',persisted?'.wp-modal':undefined);
      const observed = await capturePairSide(actual,nested,actualSelectors,'actual',persisted?'.wp-modal':'.wp-main',persisted?'.wp-modal':undefined);
      const changedPixels = await compare(expected.image,observed.image,join(folder,'comparison'));
      await writeFile(join(folder,'geometry.json'),JSON.stringify({reference:expected.geometry,actual:observed.geometry},null,2));
      await writeFile(join(folder,'result.json'),JSON.stringify({state,persisted,width,changedPixels,tolerance:0,revision:info.config.metadata,sourceHashes:hashes,fixtureSha256:facts.image?createHash('sha256').update(facts.image).digest('hex'):null,substitutions:{name:facts.name,size:facts.size,video:facts.video,condition:facts.condition},context:{reference:expected.context,actual:observed.context},reachability:'Every receipt button scrolled into the viewport on both sides; page/card horizontal overflow rejected. Mobile main retains approved natural page scrolling.',scope:persisted?'Entire existing viewer; full Shell context captured on both sides':'Entire main width including welcome, composer and receipt; no crop to a centred specimen'},null,2));
      expect(observed.geometry,label).toEqual(expected.geometry); expect(changedPixels,label).toBe(0);
    }
  } finally { await reference.close(); }
  await actual.setViewportSize({width:1440,height:900});
}
