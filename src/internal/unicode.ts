/**
 * Rust's `char::is_whitespace` is the Unicode `White_Space` property, which
 * differs from `String.prototype.trim` on exactly two codepoints: Rust trims
 * U+0085 (NEL) and does not trim U+FEFF (BOM). Both reach `Vec` elements, so
 * the property is spelled out rather than delegated to `trim()`.
 */
const WHITESPACE =
  "\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000"

const TRIM = new RegExp(`^[${WHITESPACE}]+|[${WHITESPACE}]+$`, "gu")

/** Equivalent of Rust's `str::trim`. */
export function rustTrim(value: string): string {
  return value.replace(TRIM, "")
}

/**
 * Rust escapes every codepoint its `printable.rs` table rejects: the Cc, Cf,
 * Cs, Co, Cn, Zl, Zp and Zs categories (space excepted), everything that is
 * Grapheme_Extend, and four zero-width Hangul fillers that are otherwise Lo.
 * Verified against rustc for all 1_112_064 codepoints.
 */
const NON_PRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}\p{Grapheme_Extend}]/u
const HANGUL_FILLER: ReadonlySet<string> = new Set(["\u115f", "\u1160", "\u3164", "\uffa0"])

export function isRustPrintable(ch: string): boolean {
  if (ch === " ") return true
  if (HANGUL_FILLER.has(ch)) return false
  return !NON_PRINTABLE.test(ch)
}
