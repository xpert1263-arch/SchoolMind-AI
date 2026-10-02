import { subjects } from '@/data/school';
import type { ID } from '@/data/types';
import { SUBJECT_ALIASES } from './lexicon';
import { normalise } from './text';

/** Every way a subject can be named, longest first so "ona tili"
 *  wins over a shorter accidental match. */
const SUBJECT_PATTERNS: Array<{ id: ID; stem: string }> = subjects
  .flatMap((subject) =>
    [
      normalise(subject.name.uz),
      normalise(subject.name.ru),
      ...(SUBJECT_ALIASES[subject.id] ?? []),
    ].map((stem) => ({ id: subject.id, stem: normalise(stem) })),
  )
  /* Four characters minimum, and no three-letter subject codes: "ONA"
     would otherwise match inside "xonada" ("in which room"). */
  .filter((entry) => entry.stem.length >= 4)
  .sort((a, b) => b.stem.length - a.stem.length);

/** The subject a question refers to, if any. */
export function detectSubjectId(normalisedText: string): ID | undefined {
  return SUBJECT_PATTERNS.find((entry) => normalisedText.includes(entry.stem))?.id;
}
