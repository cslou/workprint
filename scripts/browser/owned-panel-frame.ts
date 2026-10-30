import type { Page } from '@playwright/test';

// Inert surroundings only; no application component or content rule is overridden.
const framing = '.preview-note{margin:0;padding:12px 20px;font-size:12px;line-height:1.4;color:var(--color-text-secondary);background:var(--color-bg-canvas);border-bottom:1px solid var(--color-border-default)}.preview-note strong{font-weight:600}.preview-note p{margin:4px 0 0}.preview-stage{padding:24px;display:flex;justify-content:center}.preview-panel{flex:none;width:var(--size-layout-panel);border:1px solid var(--color-border-default)}@media(max-width:820px){.preview-stage{padding:16px 4px}.preview-panel{width:100%}}';
export async function ownedPanelFrame(page: Page, html: string) {
  await page.addStyleTag({ content: framing });
  await page.evaluate(html => {
    const root = document.getElementById('root'); if (!root) throw new Error('Actual consumer root missing');
    const source = new DOMParser().parseFromString(html, 'text/html');
    const body = document.importNode(source.body, true); document.body.replaceChildren(...body.childNodes);
    const panel = document.querySelector('.preview-panel'); if (!panel) throw new Error('Approved inert frame missing');
    panel.replaceChildren(root);
  }, html);
}
