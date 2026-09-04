import type { Schema } from "../schema"
import { isRustPrintable } from "./unicode"

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  "\0": "\\0",
  '"': '\\"',
  "\\": "\\\\",
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
}

/**
 * Reproduces Rust's `{:?}` formatting of a `&str`, which serde uses when it
 * renders `Unexpected::Str` inside `invalid value` / `invalid type` messages.
 * Note that `'` is not escaped here: `str` sets `escape_single_quote: false`.
 */
export function rustDebugStr(value: string): string {
  let out = '"'
  for (const ch of value) {
    const simple = SIMPLE_ESCAPES[ch]
    if (simple !== undefined) {
      out += simple
      continue
    }
    out += isRustPrintable(ch) ? ch : `\\u{${(ch.codePointAt(0) ?? 0).toString(16)}}`
  }
  return `${out}"`
}

/**
 * Reproduces `serde::de::OneOf`, the formatter behind serde's
 * "expected one of ..." message tails.
 */
export function oneOf(names: readonly string[]): string {
  const [first, second] = names
  if (names.length === 1 && first !== undefined) return `\`${first}\``
  if (names.length === 2 && first !== undefined && second !== undefined) {
    return `\`${first}\` or \`${second}\``
  }
  return `one of ${names.map((name) => `\`${name}\``).join(", ")}`
}

/** Reproduces `serde::de::Error::unknown_variant`. */
export function unknownVariant(variant: string, expected: readonly string[]): string {
  if (expected.length === 0) return `unknown variant \`${variant}\`, there are no variants`
  return `unknown variant \`${variant}\`, expected ${oneOf(expected)}`
}

/** Reproduces `serde::de::Error::unknown_field`. */
export function unknownField(field: string, expected: readonly string[]): string {
  if (expected.length === 0) return `unknown field \`${field}\`, there are no fields`
  return `unknown field \`${field}\`, expected ${oneOf(expected)}`
}

/**
 * Proves the schema switches exhaustive at compile time, and catches the
 * untyped JavaScript caller who reaches them anyway with a hand-built object.
 * That is a bug in the caller, not a bad environment, so it throws `TypeError`
 * rather than `EnvyError` and escapes the `*Safe` variants uncaught.
 */
export function assertNever(value: never): never {
  throw new TypeError(`not a schema: ${JSON.stringify(value)}`)
}

const FIXED_EXPECTING = {
  bool: "a boolean",
  string: "a string",
  char: "a character",
  ignored: "anything at all",
  option: "option",
  vec: "a sequence",
  map: "a map",
} as const

/** Reproduces the `Visitor::expecting` string serde derives for each target type. */
export function expecting(schema: Schema): string {
  switch (schema.kind) {
    case "bool":
    case "string":
    case "char":
    case "ignored":
    case "option":
    case "vec":
    case "map":
      return FIXED_EXPECTING[schema.kind]
    case "int":
      return schema.ty
    case "float":
      return schema.ty
    case "struct":
      return `struct ${schema.name}`
    case "enum":
      return `enum ${schema.name}`
    case "newtype":
      return `tuple struct ${schema.name}`
    default:
      return assertNever(schema)
  }
}
