const words = new Intl.Segmenter(undefined, { granularity: "word" });
const SYMBOL = /^[\p{Sc}%]$/u;
const INVISIBLE = /[\p{Cf}ـ]/gu;

/**
 * Language-agnostic tokens: NFKC, format characters (soft hyphen, ZWJ, bidi marks)
 * and Arabic tatweel removed, lower-cased, split by Intl word segmentation so
 * CJK/Thai work without spaces. Currency and percent signs are kept as tokens
 * so "$10" and "$100" never compare equal.
 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const { segment, isWordLike } of words.segment(text.normalize("NFKC").replace(INVISIBLE, "").toLowerCase())) {
    if (isWordLike === true || SYMBOL.test(segment)) out.push(segment);
  }
  return out;
}
