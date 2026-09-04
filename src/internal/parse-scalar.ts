import type { IntTy } from "../schema"

export type ParseOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string }

const BOOL_INVALID = "provided string was not `true` or `false`"
const INT_EMPTY = "cannot parse integer from empty string"
const INT_INVALID_DIGIT = "invalid digit found in string"
const INT_TOO_LARGE = "number too large to fit in target type"
const INT_TOO_SMALL = "number too small to fit in target type"
const FLOAT_EMPTY = "cannot parse float from empty string"
const FLOAT_INVALID = "invalid float literal"

interface IntLimits {
  readonly min: bigint
  readonly max: bigint
  readonly signed: boolean
}

export const INT_LIMITS: Readonly<Record<IntTy, IntLimits>> = {
  u8: { min: 0n, max: 255n, signed: false },
  u16: { min: 0n, max: 65535n, signed: false },
  u32: { min: 0n, max: 4294967295n, signed: false },
  u64: { min: 0n, max: 18446744073709551615n, signed: false },
  u128: { min: 0n, max: 340282366920938463463374607431768211455n, signed: false },
  i8: { min: -128n, max: 127n, signed: true },
  i16: { min: -32768n, max: 32767n, signed: true },
  i32: { min: -2147483648n, max: 2147483647n, signed: true },
  i64: { min: -9223372036854775808n, max: 9223372036854775807n, signed: true },
  i128: {
    min: -170141183460469231731687303715884105728n,
    max: 170141183460469231731687303715884105727n,
    signed: true,
  },
}

const BIG_INT_TYPES: Readonly<Record<IntTy, boolean>> = {
  u8: false,
  u16: false,
  u32: false,
  u64: true,
  u128: true,
  i8: false,
  i16: false,
  i32: false,
  i64: true,
  i128: true,
}

/** `u64`/`u128`/`i64`/`i128` exceed `Number.MAX_SAFE_INTEGER` and decode to `bigint`. */
export function isBigIntType(ty: IntTy): boolean {
  return BIG_INT_TYPES[ty]
}

function failure<T>(message: string): ParseOutcome<T> {
  return { ok: false, message }
}

/** Mirrors `str::parse::<bool>()`. */
export function parseRustBool(text: string): ParseOutcome<boolean> {
  if (text === "true") return { ok: true, value: true }
  if (text === "false") return { ok: true, value: false }
  return failure(BOOL_INVALID)
}

/**
 * Mirrors `str::parse::<{integer}>()`, including its sign handling: a leading
 * `+` is accepted by every type, a leading `-` only by signed types (for
 * unsigned types the `-` falls through and trips the digit check), and a sign
 * with no digits after it is an invalid digit rather than an empty string.
 */
export function parseRustInt(text: string, ty: IntTy): ParseOutcome<bigint> {
  if (text.length === 0) return failure(INT_EMPTY)

  const limits = INT_LIMITS[ty]
  const sign = text[0]
  let start = 0
  let negative = false
  if (sign === "+" || sign === "-") {
    if (text.length === 1) return failure(INT_INVALID_DIGIT)
    if (sign === "+") {
      start = 1
    } else if (limits.signed) {
      start = 1
      negative = true
    }
  }

  let magnitude = 0n
  for (let index = start; index < text.length; index += 1) {
    const digit = text.charCodeAt(index) - 0x30
    if (digit < 0 || digit > 9) return failure(INT_INVALID_DIGIT)
    magnitude = magnitude * 10n + BigInt(digit)
  }

  const value = negative ? -magnitude : magnitude
  if (value > limits.max) return failure(INT_TOO_LARGE)
  if (value < limits.min) return failure(INT_TOO_SMALL)
  return { ok: true, value }
}

const FLOAT_BODY = /^(?:\d+|\d+\.\d*|\d*\.\d+)(?:[eE][+-]?\d+)?$/

/**
 * `"-nan"` parses to a sign-bit-set NaN in Rust. ECMAScript leaves NaN bit
 * patterns implementation-defined, so this is best-effort: engines that
 * canonicalise NaN drop the sign, which no JS operator can observe anyway.
 */
function negativeNaN(): number {
  const view = new DataView(new ArrayBuffer(8))
  view.setBigUint64(0, 0xfff8000000000000n)
  return view.getFloat64(0)
}

/**
 * Mirrors `str::parse::<f64>()`. Rust accepts `inf`/`infinity`/`nan`
 * case-insensitively, allows a bare leading or trailing decimal point, and
 * saturates to infinity on overflow instead of erroring.
 */
export function parseRustFloat(text: string): ParseOutcome<number> {
  if (text.length === 0) return failure(FLOAT_EMPTY)

  const signum = text.startsWith("-") ? -1 : 1
  const body = text.startsWith("-") || text.startsWith("+") ? text.slice(1) : text

  const lowered = body.toLowerCase()
  if (lowered === "inf" || lowered === "infinity") {
    return { ok: true, value: signum * Number.POSITIVE_INFINITY }
  }
  if (lowered === "nan") return { ok: true, value: signum < 0 ? negativeNaN() : Number.NaN }

  if (!FLOAT_BODY.test(body)) return failure(FLOAT_INVALID)
  return { ok: true, value: signum * Number(body) }
}
