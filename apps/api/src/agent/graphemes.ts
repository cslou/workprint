const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Whole characters as people see them, so an emoji or accented letter is never cut in half. */
export const graphemes = (text: string): string[] => [...segmenter.segment(text)].map(part => part.segment);
