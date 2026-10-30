import type { Page } from '@playwright/test';
import type { AccountExample } from './account-examples.js';

/** Independent tracked reference + approved functional-input/menu/font substitutions. No product markup/CSS. */
export async function accountReference(page: Page, example: AccountExample) {
  await page.goto('/references/flow2-step1-r73.html');
  await page.addStyleTag({ content: `
    :root{--font-sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--font-display:Georgia,"Times New Roman",serif}
    b,strong{font-weight:600}.account-menu{display:none}.avatar{flex:none}.account>span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .lightbox{display:flex}.lb-panel{max-height:calc(100dvh - 48px);overflow:auto}.lb-head{gap:16px}.qclose{flex:none}
    .account-content,.account-fields{display:grid;gap:12px;font-size:13px;color:var(--fg-muted)}.account-content p{margin:0;line-height:1.5}
    .account-field{display:grid;gap:6px}.account-field>span{font-size:12px;font-weight:600}
    .account-field input{box-sizing:border-box;width:100%;min-width:0;min-height:44px;height:auto;padding:10px 12px;border:1px solid var(--fg-subtle);border-radius:8px;background:var(--raised);color:var(--fg);font:14px/1.5 var(--font-sans);outline:none}
    .account-field input::placeholder{color:var(--fg-subtle)}.account-field:has(:disabled){opacity:.6}
    .account-content .identity{color:var(--fg);font-weight:600;overflow-wrap:anywhere}.account-content .account-notice{color:var(--fg)}.account-content .help{font-size:12px;color:var(--fg-subtle)}
    .account-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:4px}.account-actions .choice{display:inline-flex;align-items:center;justify-content:center}
    .account-link{display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:6px 10px;border:0;background:transparent;color:var(--link);font:13px/1.45 var(--font-sans);text-decoration:underline;text-underline-offset:2px}
    @media(max-width:820px){.account-menu{display:block}}
  ` });
  await page.evaluate(example => {
    const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
    const identity = example.id === 'account-long-identity' ? 'alex.very.long.creator.name+review@example.test' : 'alex@example.test';
    document.querySelector('.account')!.innerHTML = `<span class="avatar">${example.signed ? 'A' : ''}</span><span>${example.signed ? identity : 'Account'}</span>`;
    document.querySelector('.navlist')!.insertAdjacentHTML('beforeend', '<button class="choice account-menu" type="button">Menu</button>');
    let body = example.signed ? `<p class="identity">${escape(identity)}</p>` : '';
    if (example.intro) body += `<p>${escape(example.intro)}</p>`;
    if (example.fields.length) body += `<div class="account-fields">${example.fields.map(([label, value]) => {
      const placeholder = ['name@example.com', 'Password', 'New password', 'Repeat new password'].includes(value);
      return `<label class="account-field"><span>${escape(label)}</span><input type="${label === 'Email' ? 'email' : 'password'}" ${placeholder ? 'placeholder' : 'value'}="${escape(value)}" ${example.pending ? 'disabled' : ''}></label>`;
    }).join('')}</div>`;
    if (example.notice) body += `<p class="account-notice">${escape(example.notice)}</p>`;
    let actions = '';
    if (['account-signed-in', 'account-long-identity'].includes(example.id)) actions = '<button class="choice">Sign out</button><button class="choice">Switch account</button>';
    if (example.action) actions += `<button class="choose" ${example.pending ? 'disabled' : ''}>${escape(example.action[0])}</button>`;
    if (example.secondary) actions += `<button class="account-link">${escape(example.secondary[0])}</button>`;
    if (actions) body += `<div class="account-actions">${actions}</div>`;
    if (example.id === 'sign-in') body += '<p class="help">Accounts are provided by your workspace owner.</p>';
    document.body.insertAdjacentHTML('beforeend', `<div class="lightbox"><section class="lb-panel"><div class="lb-head"><h2>${escape(example.title)}</h2><span class="qclose">×</span></div><div class="account-content">${body}</div></section></div>`);
  }, example);
}

export function accountGeometry(page: Page, reference: boolean) {
  return page.evaluate(reference => {
    const selectors = reference ? ['.lb-panel', '.lb-head', '.account-content', '.account-field input', '.account-actions'] : ['.wp-auth-modal', '.wp-auth-modal .wp-dialog-head', '.wp-auth-content', '.wp-auth-field input', '.wp-auth-actions'];
    return { overflow: document.documentElement.scrollWidth > innerWidth, slots: selectors.map(selector => [...document.querySelectorAll(selector)].filter(node => getComputedStyle(node).display !== 'none').map(node => {
      const rect = node.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    })) };
  }, reference);
}
