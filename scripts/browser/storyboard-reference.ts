// Independent tracked r73 shell plus approved r11 item/disclosure/control substitutions.
export function storyboardReference({ source, view }: { source: string; view: 'storyboard' | 'panel' | 'board' | 'videos' }) {
  const required = (selector: string, root: ParentNode = document) => { const node = root.querySelector(selector); if (!node) throw new Error(`Missing tracked reference ${selector}`); return node; };
  const active = view === 'videos' ? 'p-takes' : 'p-storyboard';
  const tracked = new DOMParser().parseFromString(source, 'text/html');
  document.querySelectorAll('.pv.default,.ptabs a.default').forEach(node => node.classList.remove('default'));
  const target = required('#'+active); target.classList.add('default'); required(`.ptabs a[href="#${active}"]`).classList.add('default');
  if (view === 'videos') {
    target.insertAdjacentHTML('afterbegin','<div class="take-item" style="display:block"><div class="ftitle"><b><span class="sn">1</span>First Shot</b></div><p style="margin:4px 0 6px;font-size:12px;color:var(--fg-subtle)">Version 2 · 5.1 s</p><div class="th-row" style="display:block;margin-top:0"><button class="use" disabled style="opacity:.45;line-height:1.5">Use this version</button></div><details class="take-hist"><summary>Version history</summary></details></div>');
    return;
  }
  // The approved dialog action uses a native button, not prototype hash navigation.
  const prototypeLink = required('#p-storyboard .viewboard', tracked);
  const link = document.createElement('button'); link.type = 'button'; link.className = 'viewboard'; link.innerHTML = prototypeLink.innerHTML; link.style.background = 'transparent'; link.setAttribute('aria-haspopup', 'dialog'); link.setAttribute('aria-expanded', String(view === 'board'));
  const shot = required('#p-storyboard .sb-shot', tracked).cloneNode(true) as Element;
  required('.ftitle b',shot).textContent='First Shot'; required('.ftitle small',shot).textContent='1 panel'; required('.status',shot).remove(); required('.sb-camline',shot).remove();
  (required('summary',shot) as HTMLElement).style.gridTemplateColumns='24px 1fr 16px';
  const panel = required('.sb-panel',shot); required('img',panel).remove(); required('.tm',panel).remove(); required('.cap',panel).textContent='A quiet moment.'; (panel as HTMLElement).style.gridTemplateColumns='1fr';
  panel.insertAdjacentHTML('beforeend','<div style="display:flex;gap:8px;margin-top:6px"><button style="min-height:24px;height:auto;padding:0;border:0;background:transparent;color:var(--fg-muted);font-size:12px;font-weight:400;line-height:1.45">Version 2</button></div>');
  target.replaceChildren(link,shot);
  // Shared modal semantics lock the document scroll, including in this inert reference.
  if (view === 'panel' || view === 'board') document.documentElement.style.overflow = 'hidden';
  if (view === 'panel') {
    const modal = document.createElement('div'); modal.className='lightbox'; modal.style.display='flex';
    modal.innerHTML='<div class="lb-panel wide framev"><div class="lb-head"><h2>Panel 1.1 · Version 2</h2><a class="qclose">×</a></div><p class="notes">Shot 1 · Panel 1.1 · Version 2</p><div class="lb-foot"><button class="choose" disabled>Use this version</button></div></div>';
    document.body.append(modal);
  }
  if (view === 'board') {
    const modal=required('#board',tracked).cloneNode(true) as HTMLElement; modal.style.display='flex'; required('.lb-head h2',modal).textContent='Storyboard'; required('.lb-foot',modal).remove();
    const first=required('.bshot',modal); modal.querySelectorAll('.bshot').forEach(node=>{if(node!==first)node.remove();});
    const pencil='<span style="display:contents"><button class="edit" disabled style="opacity:1"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button></span>';
    const section=(label:string,text:string)=>`<section style="padding:2px 0 14px;border:0"><div class="plabel"><span>${label}</span>${pencil}</div><p style="white-space:pre-wrap">${text}</p></section>`;
    first.innerHTML='<header><span class="sn">1</span><b>First Shot</b></header>'+section('Shot intent','First Shot')+'<div class="bgrid"><section style="min-width:0"><b>1.1</b>'+section('Panel description','A quiet moment.')+'<div style="display:flex;gap:8px;margin-top:6px"><button style="min-height:24px;height:auto;padding:0;border:0;background:transparent;color:var(--fg-muted);font-size:12px;font-weight:400;line-height:1.45">Version 2</button></div></section></div>';
    document.body.append(modal);
  }
}

export function requestReference({ feedback = false }: { feedback?: boolean }) {
  document.querySelectorAll('.pv.default,.ptabs a.default').forEach(node => node.classList.remove('default'));
  const target = document.querySelector('#p-takes');
  if (!target) throw new Error('Missing tracked Videos surface');
  target.classList.add('default'); document.querySelector('.ptabs a[href="#p-takes"]')?.classList.add('default');
  target.innerHTML = '<section><div class="plabel">Generation requests</div>'+['Queued','Submitting','Running','Succeeded','Failed','Cancelled'].map(label => `<div class="need"><b>Shot 1 · Video request</b><span class="status">${label}</span><details class="take-hist"><summary>Request details</summary><p style="margin:10px 0 0;color:var(--fg-subtle)">Shot video · Shot 1</p></details>${['Queued','Submitting','Running'].includes(label)?`<div style="grid-column:1/-1"><button class="choice" ${feedback?'':'disabled'} style="margin-top:6px;${feedback?'':'opacity:.45'}">Cancel request</button></div>`:''}${feedback && label==='Running'?'<p style="grid-column:1/-1;margin:10px 0 0;font-size:13px;color:var(--fg-subtle)">Cancelling this request is not available yet. The last known state is still shown.</p>':''}</div>`).join('')+(feedback?'<div class="pempty"><p style="margin:0;font-size:13px;color:var(--fg-subtle)">Generation requests are not available yet.</p></div>':'')+'<p style="margin:10px 0 0;font-size:13px;color:var(--fg-subtle)">Request status does not confirm that remote work or charges have stopped.</p></section>';
  target.querySelectorAll('.take-hist').forEach(node => (node as HTMLElement).style.gridColumn='1/-1');
}
