import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { AccountExample } from './account-examples.js';

/** Inert tracked originals plus explicit runtime input/accessibility substitutions; no product CSS. */
export async function entryReference(page: Page, name: string) {
  const tokens = await readFile('apps/web/src/ui/tokens.css', 'utf8');
  await page.route('**/apps/web/src/ui/tokens.css', route => route.request().resourceType() === 'stylesheet'
    ? route.fulfill({ contentType: 'text/css', body: tokens })
    : route.continue());
  await page.goto('/references/auth-entry/' + name + '.html');
  await page.evaluate(() => {
    document.querySelector('.note')?.remove(); document.querySelector('header a[href="index.html"]')?.remove();
    for (const field of document.querySelectorAll<HTMLElement>('.field')) {
      const input = document.createElement('input'); input.className = 'field';
      input.type = field.previousElementSibling?.textContent === 'Email' ? 'email' : 'password';
      input.placeholder = input.type === 'email' ? 'you@example.com' : 'Password'; field.replaceWith(input);
    }
  });
  await page.addStyleTag({ content: 'body{-webkit-font-smoothing:antialiased}input.field{display:block;width:100%;font:inherit;outline:none}input.field::placeholder{color:var(--color-text-subtle);opacity:1}.row a{display:flex;align-items:center;min-height:44px}' });
}

/** Retained, previously approved recovery/lock controls are not discarded to fit a simplified specimen. */
export async function retainedAccountReference(page: Page, example: AccountExample, title: string) {
  await page.evaluate(({ example, title }) => {
    const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
    const card = document.querySelector('.card'); if (!card) throw new Error('Missing tracked card frame');
    let body = `<h1>${escape(title)}</h1><div class="retained-content">`;
    if (example.intro) body += `<p>${escape(example.intro)}</p>`;
    if (example.notice) body += `<p class="retained-detail">${escape(example.notice)}</p>`;
    for (const [label, value] of example.fields) {
      const placeholder = ['name@example.com', 'Password', 'New password', 'Repeat new password'].includes(value);
      body += `<div class="label">${escape(label)}</div><input class="field" type="${label === 'Email' ? 'email' : 'password'}" ${placeholder ? 'placeholder' : 'value'}="${escape(value === 'name@example.com' ? 'you@example.com' : value)}" ${example.pending ? 'disabled' : ''}>`;
    }
    const actions = [];
    if (example.action) actions.push(`<button class="button" ${example.pending ? 'disabled' : ''}>${escape(example.action[0])}</button>`);
    if (example.secondary) actions.push(`<button class="retained-quiet">${escape(example.secondary[0])}</button>`);
    // Explicit fresh credentials are the only escape from an unconfirmable credential-free revocation retry.
    if (example.id === 'sign-out-failed') actions.push('<button class="retained-quiet">Sign in</button>');
    body += `<div class="retained-actions">${actions.join('')}</div></div>`;
    card.innerHTML = body;
  }, { example, title });
  await page.addStyleTag({ content: '.retained-detail{color:var(--color-text-primary)}.retained-actions{display:flex;justify-content:space-between;gap:0 12px;flex-wrap:wrap}.retained-actions:has(.button){margin-top:24px}.retained-actions .button{margin-top:0;width:100%;border:0;font:600 14px/1.5 var(--font-family-sans)}.retained-quiet{display:flex;align-items:center;min-height:44px;margin-top:16px;padding:0;border:0;background:transparent;color:var(--color-text-link);font:inherit;text-decoration:underline;text-underline-offset:3px}input.field{border-radius:8px}input.field:disabled{opacity:.6}' });
}
