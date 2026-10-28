/** Test-only inert surroundings from tracked approved references, never production bootstrap. */
export async function loadReference(path: string): Promise<Document> {
  const response = await fetch(`/references/${path}`);
  if (!response.ok) throw new Error(`Reference unavailable: ${path}`);
  const source = new DOMParser().parseFromString(await response.text(), 'text/html');
  source.querySelectorAll('[src]').forEach((element) => element.setAttribute('src', `/references/${element.getAttribute('src')}`));
  document.body.innerHTML = source.body.innerHTML;
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet'; stylesheet.href = '/references/app-r11.css';
  const loaded = new Promise<void>((resolve, reject) => {
    stylesheet.onload = () => resolve();
    stylesheet.onerror = () => reject(new Error('Reference stylesheet unavailable'));
  });
  document.head.prepend(stylesheet);
  await loaded;
  return source;
}
