import type { ReactNode } from 'react';
import type { MaterialPresentation } from './presentation.js';
import './sheet.css';
/**
 * A reference sheet: kicker, name, description and sections, then its views in a grid when it has any. No status
 * pill: nothing approves a sheet yet.
 */
export function ReferenceSheet({ sheet, description, views }: { description?: ReactNode; sheet: NonNullable<MaterialPresentation['sheet']>; views?: ReactNode }) {
  return <div className="wp-sheet-scroll"><article className="wp-reference-sheet" data-no-images={(!views && sheet.sections.every(section => !section.figures?.length)) || undefined}><header><p className="wp-sheet-kicker">{sheet.kicker}</p><h2>{sheet.name}</h2>{description ?? <p>{sheet.summary}</p>}</header><div className="wp-sheet-grid">{sheet.sections.map((section) => <section className={`wp-sheet-section${section.layout ? ` wp-sheet-${section.layout}` : ''}`} key={section.title}><h3>{section.title}</h3>{section.figures?.map((figure) => <figure key={figure.src + figure.alt}><img src={figure.src} alt={figure.alt} />{figure.caption && <figcaption>{figure.caption}</figcaption>}</figure>)}{section.text && <p>{section.text}</p>}</section>)}{views && <section className="wp-sheet-section wp-sheet-wide"><h3>Views</h3><div className="wp-sheet-views">{views}</div></section>}</div></article></div>;
}
