import type { LibraryDisplayFact } from '../src/library/picker.js';

type MissingSingularLabel = Readonly<{ name: string; category: string }>;
/** Compile-time contract: categorized facts cannot omit their explicit singular tile label. */
export const categoryRequiresTileLabel: MissingSingularLabel extends LibraryDisplayFact ? false : true = true;
