import type { Page } from '@playwright/test';
import { ownedReadReference } from './owned-read-reference.js';
import { mountOwnedReadReference } from './owned-read-mount.js';

export const manualStates = ['script-read', 'script-edit', 'script-saving', 'script-rejected', 'script-signin', 'script-unknown', 'script-conflict', 'script-review', 'script-ready', 'script-read-error', 'script-blocked', 'reference-read', 'reference-conflict', 'planning-read', 'planning-conflict'] as const;
export type ManualState = typeof manualStates[number];
export async function manualReference(state: ManualState, repository = process.cwd()) {
  if (!manualStates.includes(state)) throw new Error('Unsupported manual-save reference');
  return { base: await ownedReadReference('script-history', repository), state };
}
export async function mountManualReference(page: Page, reference: Awaited<ReturnType<typeof manualReference>>) {
  const state = reference.state;
  await mountOwnedReadReference(page, { ...reference.base, state: state.startsWith('reference') ? 'text-reference-sheet' : 'script-history' });
  await page.evaluate(({ state, planning, referenceScript }) => {
    const require = (root: ParentNode, selector: string): HTMLElement => { const node = root.querySelector<HTMLElement>(selector); if (!node) throw new Error('Missing tracked manual reference: ' + selector); return node; };
    const label = state.startsWith('reference') ? 'Description' : state.startsWith('planning') ? 'Panel description' : 'What happens';
    if (state.startsWith('planning')) {
      const source = new DOMParser().parseFromString(planning, 'text/html'), modal = require(source, '#board .lb-panel').cloneNode(true) as HTMLElement;
      modal.querySelector('.lb-foot')?.remove();
      require(modal, '.lb-head h2').textContent = 'Storyboard';
      const shot = require(modal, '.bshot'); modal.querySelectorAll('.bshot').forEach(node => { if (node !== shot) node.remove(); });
      shot.innerHTML = '<header><span class="sn">1</span><b>Ada waits for the train.</b></header><section class="ref-shot"><div class="plabel"><span>Shot intent</span></div><p>Ada waits for the train.</p></section><div class="bgrid"><section class="ref-panel"><b>1.1</b><div class="ref-manual"></div><div style="height:6px"></div></section></div>';
      document.querySelector('.preview-note')?.remove();
      const stage = document.querySelector('.preview-stage')!; stage.className = 'preview-modal-stage'; stage.replaceChildren(modal);
      modal.classList.add('ref-board'); require(modal, '.lb-scroll').classList.add('ref-board-scroll');
    }
    let target: HTMLElement;
    if (state.startsWith('reference')) {
      target = require(document, '.ref-description');
      require(document, '.wp-dialog-head h2').textContent = 'Ada reference'; require(document, '.wp-reference-sheet h2').textContent = 'Ada reference';
      const sections = [...document.querySelectorAll('.wp-sheet-section')]; sections[0]!.querySelector('p')!.textContent = 'Keep the green coat.'; sections.find(section => section.querySelector('h3')?.textContent === 'Wardrobe')?.remove();
    }
    else if (state.startsWith('planning')) target = require(document, '.ref-manual');
    else {
      const script = require(document, '.wp-script'); script.querySelectorAll('section:not(:first-child)').forEach(node => node.remove());
      const section = require(script, 'section'); const wrapper = document.createElement('div'); wrapper.className = 'ref-manual'; section.replaceWith(wrapper); target = wrapper;
      const history = require(document, '.wp-version-history'); history.removeAttribute('open'); history.replaceChildren(require(history, 'summary'));
    }
    if (state.startsWith('reference') || state.startsWith('planning')) {
      document.documentElement.style.overflow = 'hidden';
      const modal = require(document, state.startsWith('reference') ? '.preview-reference' : '.ref-board');
      const dialog = document.createElement('div'); dialog.className = 'ref-native-dialog';
      dialog.append(...modal.childNodes); modal.append(dialog);
    }
    target.classList.add('ref-manual');
    const read = state.endsWith('-read');
    const original = state.startsWith('reference') ? 'A traveller with a green coat.' : state.startsWith('planning') ? 'Ada looks toward the arriving train.' : 'Ada waits beside the station clock.';
    const typed = state === 'script-rejected' ? '   ' : state.startsWith('reference') ? 'Ada wears a green wool coat with a repaired cuff. Keep the brass buttons and the small travel case.' : state.startsWith('planning') ? 'Ada looks toward the arriving train. Keep the station clock visible above her shoulder.' : 'Ada pauses beneath the station clock, then turns toward the platform.';
    const section = document.createElement('section'); section.className = 'ref-text-section';
    const heading = document.createElement('div'); heading.className = 'plabel'; heading.innerHTML = '<span></span>'; require(heading, 'span').textContent = label;
    const pencil = new DOMParser().parseFromString(referenceScript, 'text/html');
    if (read) {
      const button = require(pencil, '#p-script .edit').cloneNode(true) as HTMLButtonElement; button.disabled = false; heading.append(button);
      const paragraph = document.createElement('p'); paragraph.className = 'ref-manual-display'; paragraph.textContent = original; section.append(heading, paragraph); target.replaceChildren(section); return;
    }
    const field = document.createElement('textarea'); field.rows = 6; field.className = 'ref-manual-field'; field.setAttribute('aria-label', label); field.value = typed;
    const pending = state === 'script-saving', unknown = state === 'script-unknown';
    field.readOnly = pending || unknown;
    const button = (text: string, className: string) => { const node = document.createElement('button'); node.type = 'button'; node.className = className; node.textContent = text; return node; };
    const actions = document.createElement('div'); actions.className = 'ref-manual-actions'; const cancel = button('Cancel', 'choice'), save = button(unknown ? 'Retry save' : 'Save', 'send'); cancel.disabled = pending; save.disabled = pending || state.includes('conflict') || ['script-review', 'script-read-error', 'script-blocked'].includes(state); actions.append(cancel, save);
    section.append(heading, field, actions);
    const feedback = state === 'script-saving' ? 'Saving changes…' : state === 'script-unknown' ? 'Save could not be confirmed. Retry checks the same save; Cancel does not undo a completed save. Your text is retained.' : state === 'script-signin' ? 'Sign-in required to save. Your unsaved text is retained.' : state === 'script-rejected' ? 'Changes were not saved. Your unsaved text is retained.' : state === 'script-ready' ? 'Editing from version 2. Your text is not saved yet.' : state === 'script-read-error' ? 'The latest version could not be loaded. Your unsaved text is retained.' : state === 'script-blocked' ? 'The saved structure changed. Your text is retained, but it cannot be applied to this version automatically.' : state === 'script-review' ? 'A newer version was saved. Your unsaved text is retained.' : state.includes('conflict') ? 'A newer version was saved. Your unsaved text is retained. Review the latest version before saving again.' : null;
    if (feedback) { const paragraph = document.createElement('p'); paragraph.className = 'ref-manual-feedback'; paragraph.setAttribute('role', 'status'); paragraph.textContent = feedback; section.append(paragraph); }
    if (state.includes('conflict') || ['script-read-error', 'script-blocked'].includes(state)) { const recovery = document.createElement('div'); recovery.className = 'ref-manual-recovery'; recovery.append(button(state === 'script-read-error' ? 'Retry latest read' : 'Review latest version', 'ref-quiet')); section.append(recovery); }
    if (state === 'script-review') {
      const latest = document.createElement('section'); latest.className = 'ref-manual-latest'; latest.innerHTML = '<div class="plabel"><span>Latest saved version · Version 2</span></div><p>Ada walks past the station clock and waits beside the platform entrance.</p><p class="ref-manual-feedback">Continue only keeps your text against this reviewed base. Nothing is saved or approved until you press Save.</p>';
      const choices = document.createElement('div'); choices.className = 'ref-manual-actions'; choices.append(button('Back to my edit', 'ref-quiet'), button('Continue with my text', 'choice')); latest.append(choices); section.append(latest);
    }
    target.replaceChildren(section);
    if (state.startsWith('planning')) require(document, '.ref-panel').style.gridColumn = '1/-1';
  }, { state, planning: reference.base.sources.planning, referenceScript: reference.base.sources.script });
}
