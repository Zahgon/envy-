/**
 * Port of `envy::Error` (src/error.rs).
 *
 * The Rust crate models failures as a two-variant enum. JavaScript has no enums
 * with payloads, so the variant tag lives in `kind` and the payload in `field`.
 */
export type EnvyErrorKind = "MissingValue" | "Custom"

export class EnvyError extends Error {
  override readonly name = "EnvyError"

  /** Discriminant mirroring the Rust `Error` enum. */
  readonly kind: EnvyErrorKind

  /** Payload of `Error::MissingValue`; `undefined` for `Error::Custom`. */
  readonly field: string | undefined

  private constructor(kind: EnvyErrorKind, message: string, field: string | undefined) {
    super(message)
    this.kind = kind
    this.field = field
    Object.setPrototypeOf(this, EnvyError.prototype)
  }

  /** `Error::MissingValue(field)` — displays as `missing value for {field}`. */
  static missingValue(field: string): EnvyError {
    return new EnvyError("MissingValue", `missing value for ${field}`, field)
  }

  /** `Error::Custom(msg)` — displays as the message verbatim. */
  static custom(message: string): EnvyError {
    return new EnvyError("Custom", message, undefined)
  }

  /** Structural comparison, mirroring `#[derive(PartialEq)]` on the Rust enum. */
  equals(other: EnvyError): boolean {
    return this.kind === other.kind && this.field === other.field && this.message === other.message
  }
}
