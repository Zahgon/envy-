import { EnvyError } from "./error"
import { decode, type Entries } from "./internal/deserialize"
import { readEnv } from "./internal/env"
import type { Infer, Schema } from "./schema"

export type { FieldOptions, StructOptions } from "./dsl"
export { t } from "./dsl"
export type { EnvyErrorKind } from "./error"
export { EnvyError } from "./error"
export type {
  BigIntTy,
  Field,
  Fields,
  FloatTy,
  Infer,
  IntTy,
  Schema,
} from "./schema"

/** Anything a set of environment variables can arrive as. */
export type EnvSource = Readonly<Record<string, string>> | Iterable<readonly [string, string]>

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: EnvyError }

export interface Scoped {
  readonly fromEnv: <S extends Schema>(schema: S) => Infer<S>
  readonly fromIter: <S extends Schema>(source: EnvSource, schema: S) => Infer<S>
  readonly fromEnvSafe: <S extends Schema>(schema: S) => Result<Infer<S>>
  readonly fromIterSafe: <S extends Schema>(source: EnvSource, schema: S) => Result<Infer<S>>
}

type Run = <S extends Schema>(entries: Entries, schema: S) => Infer<S>

function toEntries(source: EnvSource): Entries {
  if (Symbol.iterator in source) return [...source]
  return Object.entries(source)
}

function attempt<T>(run: () => T): Result<T> {
  try {
    return { ok: true, value: run() }
  } catch (error) {
    if (error instanceof EnvyError) return { ok: false, error }
    throw error
  }
}

function renameMissing<T>(run: () => T, rename: (field: string) => string): T {
  try {
    return run()
  } catch (error) {
    if (error instanceof EnvyError && error.kind === "MissingValue" && error.field !== undefined) {
      throw EnvyError.missingValue(rename(error.field))
    }
    throw error
  }
}

const runPlain: Run = (entries, schema) =>
  renameMissing(
    () => decode(entries, schema, false),
    (field) => field.toUpperCase(),
  )

const runKeepNames: Run = (entries, schema) => decode(entries, schema, true)

function stripPrefix(key: string, prefix: string): string {
  if (prefix === "") return key
  let rest = key
  while (rest.startsWith(prefix)) rest = rest.slice(prefix.length)
  return rest
}

function runPrefixed<S extends Schema>(prefix: string, entries: Entries, schema: S): Infer<S> {
  const scopedEntries: Entries = entries
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, value]) => [stripPrefix(key, prefix), value])
  return renameMissing(
    () => runPlain(scopedEntries, schema),
    (field) => `${prefix}${field}`.toUpperCase(),
  )
}

function scope(run: Run): Scoped {
  return {
    fromEnv: (schema) => run(readEnv(), schema),
    fromIter: (source, schema) => run(toEntries(source), schema),
    fromEnvSafe: (schema) => attempt(() => run(readEnv(), schema)),
    fromIterSafe: (source, schema) => attempt(() => run(toEntries(source), schema)),
  }
}

export function fromEnv<S extends Schema>(schema: S): Infer<S> {
  return runPlain(readEnv(), schema)
}

export function fromIter<S extends Schema>(source: EnvSource, schema: S): Infer<S> {
  return runPlain(toEntries(source), schema)
}

export function fromEnvSafe<S extends Schema>(schema: S): Result<Infer<S>> {
  return attempt(() => fromEnv(schema))
}

export function fromIterSafe<S extends Schema>(source: EnvSource, schema: S): Result<Infer<S>> {
  return attempt(() => fromIter(source, schema))
}

/** Scopes decoding to variables carrying `prefix`, which is stripped from each key. */
export function prefixed(prefix: string): Scoped {
  return scope((entries, schema) => runPrefixed(prefix, entries, schema))
}

/** Scopes decoding to verbatim variable names, skipping the lowercasing step. */
export function keepNames(): Scoped {
  return scope(runKeepNames)
}
