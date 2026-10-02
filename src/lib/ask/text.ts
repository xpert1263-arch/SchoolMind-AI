/* ------------------------------------------------------------------
   Text normalisation for question understanding.

   Uzbek is agglutinative ("dars", "darsim", "darslarim", "darsimga"),
   so most matching is stem containment rather than exact words. A few
   short words would collide inside longer ones, so those are matched
   on word boundaries instead.
   ------------------------------------------------------------------ */

/** Collapses the many apostrophes used for oʻ/gʻ into one form. */
export function normalise(input: string): string {
  return input
    .toLowerCase()
    .replace(/[ʻʼ‘’`´']/g, "'")
    .replace(/[^\p{L}\p{N}'\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when any stem appears anywhere in the text. */
export function hasStem(text: string, stems: readonly string[]): boolean {
  return stems.some((stem) => text.includes(stem));
}

/** True when any term appears as a whole word. */
export function hasWord(text: string, words: readonly string[]): boolean {
  const tokens = new Set(text.split(/[\s-]+/));
  return words.some((word) => tokens.has(word));
}

export function countStems(text: string, stems: readonly string[]): number {
  return stems.reduce((total, stem) => (text.includes(stem) ? total + 1 : total), 0);
}
