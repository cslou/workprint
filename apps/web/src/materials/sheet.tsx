import { StatusPill } from '../ui/status.js';
import type { MaterialPresentation } from './presentation.js';
import './sheet.css';
export function ReferenceSheet({ sheet, state }: { sheet: NonNullable<MaterialPresentation['sheet']>; state: 'Draft' | 'Ready' }) {
  return <div className="wp-sheet-scroll"><article className="wp-reference-sheet"><header><p className="wp-sheet-kicker">{sheet.kicker}</p><h2>{sheet.name}</h2><p>{sheet.summary}</p><StatusPill state={state === 'Ready' ? 'ready' : 'draft'} /></header><div className="wp-sheet-grid">{sheet.sections.map((section) => <section className={`wp-sheet-section${section.layout ? ` wp-sheet-${section.layout}` : ''}`} key={section.title}><h3>{section.title}</h3>{section.figures?.map((figure) => <figure key={figure.src + figure.alt}><img src={figure.src} alt={figure.alt} />{figure.caption && <figcaption>{figure.caption}</figcaption>}</figure>)}{section.text && <p>{section.text}</p>}</section>)}</div></article></div>;
}
