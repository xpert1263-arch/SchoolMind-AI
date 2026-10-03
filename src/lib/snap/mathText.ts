/* ------------------------------------------------------------------
   Maths display without a formula engine.

   The model is told to write plain Unicode maths. This is the safety
   net for when it reaches for LaTeX or markdown anyway: it converts
   the handful of constructs that actually show up in school algebra
   and strips the rest, so a student never sees a raw \\frac{}{}.

   A real renderer (KaTeX) would be ~270 kB for occasional output that
   we are already asking the model not to produce.
   ------------------------------------------------------------------ */

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  n: 'ⁿ',
};

const SYMBOLS: Array<[RegExp, string]> = [
  [/\\times/g, '×'],
  [/\\cdot/g, '·'],
  [/\\div/g, '÷'],
  [/\\pm/g, '±'],
  [/\\leq?\b/g, '≤'],
  [/\\geq?\b/g, '≥'],
  [/\\neq/g, '≠'],
  [/\\approx/g, '≈'],
  [/\\infty/g, '∞'],
  [/\\alpha/g, 'α'],
  [/\\beta/g, 'β'],
  [/\\pi/g, 'π'],
  [/\\Delta/g, 'Δ'],
  [/\\degree/g, '°'],
];

export function normaliseMath(input: string): string {
  let out = input;

  // Display and inline maths delimiters.
  out = out.replace(/\\\[|\\\]|\\\(|\\\)/g, '');
  out = out.replace(/\$\$?([^$]*)\$\$?/g, '$1');

  // Fractions and roots, innermost first.
  for (let i = 0; i < 3; i += 1) {
    out = out.replace(/\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)');
    out = out.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)');
  }
  out = out.replace(/\\sqrt\s*(\w)/g, '√$1');

  for (const [pattern, replacement] of SYMBOLS) out = out.replace(pattern, replacement);

  // Exponents: x^{2} and x^2.
  out = out.replace(/\^\{([0-9n])\}/g, (_, d: string) => SUPERSCRIPT[d] ?? `^${d}`);
  out = out.replace(/\^([0-9n])(?![0-9])/g, (_, d: string) => SUPERSCRIPT[d] ?? `^${d}`);

  // Leftover LaTeX scaffolding and markdown emphasis.
  out = out.replace(/\\left|\\right|\\,|\\;|\\!/g, '');
  out = out.replace(/\\text\s*\{([^{}]*)\}/g, '$1');
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/(^|\s)\*([^*\n]+)\*(?=\s|$)/g, '$1$2');
  out = out.replace(/`([^`]*)`/g, '$1');
  out = out.replace(/^#{1,6}\s+/gm, '');

  return out.replace(/[ \t]{2,}/g, ' ').trim();
}
