// Browser-side substitutions for labelled exact-version, read-only prerequisites.
// Tracked r74 markup/r82 patterns and recorded edit/feedback approval remain authoritative.
export const referenceFonts = ':root{--font-sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--font-display:Georgia,"Times New Roman",serif}b,strong{font-weight:600}';
export function scriptPrerequisite(view: 'script' | 'edit' | 'history' | 'save' | 'use') {
  const required = (selector: string) => { const element = document.querySelector(selector); if (!element) throw new Error(`Missing reference ${selector}`); return element; };
  required('#p-script > section:first-child > p').textContent = 'Mercer and Vale sit side by side on the gallery bench.';
  required('.breakdown li:first-child p').textContent = 'Both of them, seen together from the front.';
  required('.breakdown li:nth-child(2) p').textContent = 'Close on Vale as he recognises Mercer.';
  required('.breakdown li:nth-child(3)').remove();
  required('#p-script > section:nth-child(2) .edit').remove();
  document.querySelectorAll('#p-script .chip .x,#p-script .chip.add,.ptabs .dot').forEach((element) => element.matches('.dot') ? element.classList.remove('dot') : element.remove());
  required('#p-script').insertAdjacentHTML('beforeend', `<details class="take-hist" ${view === 'history' || view === 'use' ? 'open' : ''}><summary>Version history · 1 earlier</summary><div class="th-row" style="grid-template-columns:1fr auto"><span class="ftitle"><b>Version 6</b></span><button class="use" ${view === 'use' ? '' : 'disabled style="opacity:.45"'}>Use this version</button>${view === 'use' ? '<p class="approved-feedback" style="grid-column:1/-1">Using this version is not available yet. The current selection is unchanged.</p>' : ''}</div></details>`);
  if (view === 'edit' || view === 'save') {
    required('#p-script > section:first-child > p').outerHTML = `<textarea rows="6" aria-label="What happens" style="display:block;width:100%;padding:8px 12px;border:1px solid var(--input-border);border-radius:10px;background:var(--bg);color:var(--fg);font:inherit;font-size:14px;line-height:1.5;resize:none">${view === 'save' ? 'Mercer stays still, then gives a small nod.' : 'Mercer and Vale sit side by side on the gallery bench.'}</textarea><div class="approved-edit-actions" style="display:flex;align-items:center;gap:8px;margin-top:10px"><button class="choice">Cancel</button><button class="send" ${view === 'edit' ? 'disabled' : ''}>Save</button></div>${view === 'save' ? '<p class="approved-feedback">Saving is not available yet. Your unsaved text is retained.</p>' : ''}`;
    required('#p-script > section:first-child .edit').remove();
  }
}
export function assetPrerequisite({ view, source }: { view: 'assets' | 'viewer'; source: string }) {
  const required = (selector: string, root: ParentNode = document) => { const element = root.querySelector(selector); if (!element) throw new Error(`Missing reference ${selector}`); return element; };
  const tracked = new DOMParser().parseFromString(source, 'text/html');
  const row = required('#p-assets .need.asset', tracked).cloneNode(true) as Element;
  required('b', row).textContent = 'Vale reference'; required('small', row).textContent = 'Character sheet';
  required('img', row).setAttribute('alt', 'Vale thumbnail');
  required('#p-assets').replaceChildren(row);
  document.querySelectorAll('.ptabs .dot').forEach((element) => element.classList.remove('dot'));
  location.hash = 'p-assets';
  if (view === 'viewer') {
    const modal = required('#sheet-vale', tracked).cloneNode(true) as HTMLElement;
    modal.style.display = 'flex';
    required('.lb-head h2', modal).textContent = 'Vale reference';
    required('.lb-foot', modal).remove();
    required('.livesheet', modal).innerHTML = '<header><p class="kicker">Character reference</p><h2>Vale</h2><p class="ssum">Dark navy overcoat · charcoal suit</p><span class="status ready">Ready</span></header><div class="sgrid"><section class="ssec hero"><h3>Identity</h3><figure class="sfig"><img src="assets/media-placeholder.svg" alt="Vale front view"><figcaption>Front · neutral expression</figcaption></figure><p class="snotes">Late forties, light stubble.</p></section><section class="ssec"><h3>Wardrobe</h3><p class="snotes">Navy overcoat over a charcoal suit.</p></section><section class="ssec"><h3>Missing views</h3><p class="snotes">Side and back views are not supplied.</p></section></div>';
    required('.lb-scroll', modal).insertAdjacentHTML('afterend', '<details class="take-hist"><summary>Version history</summary></details>');
    document.body.append(modal);
  }
}
