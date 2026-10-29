// Independent tracked demo-18 card/r11 viewer/item treatments plus recorded copy substitutions.
export function exportEntryMarkup(disabled = false) {
  return `<style>.export-entry .choice{border-color:var(--border)}</style><div class="export-entry" style="border:1px solid var(--border-strong);border-radius:12px;background:var(--bg);padding:14px;margin-bottom:24px"><p style="font-size:12px;color:var(--fg-subtle);margin:0 0 12px">Chosen source versions</p><div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px"><button class="send" style="line-height:1.5;${disabled ? 'opacity:.45' : ''}">Export</button><button class="choice" style="height:32px;background:transparent;color:var(--fg-muted);line-height:1.5">Export history</button></div></div>`;
}
export function exportReference({ view, entry }: { view: string; entry: string }) {
  document.querySelectorAll('.pv.default,.ptabs a.default').forEach(node => node.classList.remove('default'));
  const panel = document.querySelector('#p-takes');
  if (!panel) throw new Error('Missing tracked Videos reference');
  panel.classList.add('default'); document.querySelector('.ptabs a[href="#p-takes"]')?.classList.add('default');
  if (view === 'entry') {
    panel.innerHTML = entry + '<div class="take-item" style="display:block"><div class="ftitle"><b><span class="sn">1</span>First Shot</b></div><p style="margin:4px 0 6px;font-size:12px;color:var(--fg-subtle)">Version 4</p><div class="th-row" style="display:block;margin-top:0"><button class="use" style="line-height:1.5">Use this version</button></div><details class="take-hist"><summary>Version history</summary></details></div><section><div class="plabel">Generation requests</div><div class="need"><b>Shot 1 · Video request</b><span class="status">Succeeded</span><details class="take-hist"><summary>Request details</summary></details></div><p style="font-size:13px;color:var(--fg-subtle);margin:10px 0 0">Request status does not confirm that remote work or charges have stopped.</p></section>';
    return;
  }
  const unavailable = (first: string, second: string) => `<div class="pempty"><p style="font-size:13px">${first}</p><p style="font-size:13px;margin-top:4px">${second}</p></div>`;
  const card = (status: string, current: string, position: number) => `<div class="need" style="margin:0;grid-template-columns:minmax(0,1fr) auto"><b>Export</b><span class="status">${status}</span><p style="grid-column:1/-1;font-size:12px;color:var(--fg-subtle)">${current}</p><div style="grid-column:1/-1;margin-top:6px"><button class="choice" aria-label="Export details, export ${position} of 2" style="height:32px;background:transparent;color:var(--fg-muted);line-height:1.5">Export details</button></div></div>`;
  const sources = view === 'failed' ? ['Shot 1 · Version 4'] : ['Not in the current Videos list', 'Shot 1 · Version 4'];
  const group = (title: string, body: string) => `<section style="border-top:1px solid var(--border);padding-top:12px"><div style="font-size:12px;color:var(--fg-subtle);margin-bottom:6px">${title}</div>${body}</section>`;
  const fact = `<div class="export-facts" style="display:grid;gap:14px"><div><span class="status">${view === 'failed' ? 'Failed' : 'Succeeded'}</span><p style="font-size:12px;color:var(--fg-subtle);margin-top:6px">${view === 'failed' ? 'Uses your current chosen versions.' : 'Uses earlier chosen versions.'}</p></div>${group('Shots in this export', `<ol style="list-style:none;margin:0;padding:0;display:grid;gap:8px">${sources.map(text => `<li style="font-size:13px;color:var(--fg-muted);border:1px solid var(--border);border-radius:8px;background:var(--bg);padding:10px 12px">${text}</li>`).join('')}</ol>`)}${view === 'failed' ? group("Can't be combined", '<p style="font-size:13px;color:var(--fg-muted)">Shot 1 · Version 4 — Frame rates differ.</p><p style="font-size:13px;color:var(--fg-muted)">Not in the current Videos list — Source is unavailable.</p>') + group('Why it failed', '<p style="font-size:13px;color:var(--fg-muted)">Source streams are incompatible.</p>') : '<button class="choice" style="height:32px;justify-self:start;background:transparent;color:var(--fg-muted);line-height:1.5">Download</button>'}</div>`;
  const body = view === 'history' ? `<div class="export-list" style="display:grid;gap:8px">${card('Succeeded', 'Uses earlier chosen versions.', 1)}${card('Failed', 'Uses your current chosen versions.', 2)}</div>`
    : view === 'detail' || view === 'failed' ? fact
    : view === 'loading' ? '<div class="pempty">Loading export history…</div>'
    : view === 'export' ? unavailable('Export is not available yet.', 'No export was queued and no file was created.')
    : view === 'history-unavailable' ? unavailable('Export history is not available yet.', 'No export records were loaded.')
    : view === 'detail-unavailable' ? unavailable('Export details are not available yet.', 'No export record was loaded.')
    : unavailable('Download is not available yet.', 'No file was downloaded.');
  const title = view === 'export' ? 'Export' : view.includes('history') || view === 'loading' ? 'Export history' : view === 'download' ? 'Download' : 'Export details';
  const style = document.createElement('style'); style.textContent = '.lightbox .choice{border-color:var(--border)}'; document.head.append(style);
  const overlay = document.createElement('div'); overlay.className = 'lightbox'; overlay.style.display = 'flex';
  overlay.innerHTML = `<div class="lb-panel" style="${view === 'detail' || view === 'failed' || view === 'history' ? 'max-height:calc(100vh - 48px);overflow:auto' : ''}"><div class="lb-head"><h2>${title}</h2><a class="qclose" style="display:flex;align-items:flex-start;justify-content:flex-start">×</a></div>${body}</div>`;
  for (const p of overlay.querySelectorAll('.export-facts p')) {
    const text = p.textContent ?? '', boundary = text.indexOf(' — ');
    if (boundary >= 0) p.replaceChildren(document.createTextNode(text.slice(0, boundary)), document.createTextNode(' — '), document.createTextNode(text.slice(boundary + 3)));
  }
  document.documentElement.style.overflow = 'hidden'; document.body.append(overlay);
}
