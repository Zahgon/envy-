import { EnvyError } from "../error"
import type { Fields, Infer, MapSchema, Schema, StructSchema } from "../schema"
import { assertNever, expecting, rustDebugStr, unknownField, unknownVariant } from "./format"
import { isBigIntType, parseRustBool, parseRustFloat, parseRustInt } from "./parse-scalar"
import { rustTrim } from "./unicode"

export type Entries = readonly (readonly [string, string])[]

/** A single environment value paired with the *original* key it arrived under. */
interface Val {
  readonly key: string
  readonly value: string
}

type NamedVal = readonly [string, Val]

interface Member {
  readonly prop: string
  readonly name: string
  readonly schema: Schema
  readonly getDefault: (() => unknown) | undefined
}

function members(fields: Fields): readonly Member[] {
  return Object.entries(fields).map(([prop, def]) =>
    def.kind === "field"
      ? { prop, name: def.rename ?? prop, schema: def.schema, getDefault: def.getDefault }
      : { prop, name: prop, schema: def, getDefault: undefined },
  )
}

/** The `{err} while parsing value '{value}' provided by {key}` tail, which the
 * Rust crate adds to scalar parse failures only. */
function scalarError(val: Val, message: string): EnvyError {
  return EnvyError.custom(`${message} while parsing value '${val.value}' provided by ${val.key}`)
}

function decodeVal(val: Val, schema: Schema): unknown {
  switch (schema.kind) {
    case "bool": {
      const parsed = parseRustBool(val.value)
      if (!parsed.ok) throw scalarError(val, parsed.message)
      return parsed.value
    }
    case "int": {
      const parsed = parseRustInt(val.value, schema.ty)
      if (!parsed.ok) throw scalarError(val, parsed.message)
      return isBigIntType(schema.ty) ? parsed.value : Number(parsed.value)
    }
    case "float": {
      const parsed = parseRustFloat(val.value)
      if (!parsed.ok) throw scalarError(val, parsed.message)
      return schema.ty === "f32" ? Math.fround(parsed.value) : parsed.value
    }
    case "char": {
      const chars = [...val.value]
      const only = chars[0]
      if (chars.length !== 1 || only === undefined) {
        const seen = rustDebugStr(val.value)
        throw EnvyError.custom(`invalid value: string ${seen}, expected a character`)
      }
      return only
    }
    case "string":
      return val.value
    case "ignored":
      return undefined
    case "option":
    case "newtype":
      return decodeVal(val, schema.inner)
    case "vec": {
      if (val.value === "") return []
      const inner = schema.inner
      return val.value
        .split(",")
        .map((part) => decodeVal({ key: val.key, value: rustTrim(part) }, inner))
    }
    case "enum":
      if (!schema.variants.includes(val.value)) {
        throw EnvyError.custom(unknownVariant(val.value, schema.variants))
      }
      return val.value
    case "struct":
    case "map":
      throw EnvyError.custom(
        `invalid type: string ${rustDebugStr(val.value)}, expected ${expecting(schema)}`,
      )
    default:
      return assertNever(schema)
  }
}

function decodeStruct(vars: readonly NamedVal[], schema: StructSchema): Record<string, unknown> {
  const declared = members(schema.fields)
  const byName = new Map(declared.map((member) => [member.name, member] as const))
  const seen = new Map<string, unknown>()

  for (const [name, val] of vars) {
    const member = byName.get(name)
    if (member === undefined) {
      if (schema.denyUnknownFields) {
        throw EnvyError.custom(
          unknownField(
            name,
            declared.map((each) => each.name),
          ),
        )
      }
      continue
    }
    if (seen.has(member.prop)) throw EnvyError.custom(`duplicate field \`${member.name}\``)
    seen.set(member.prop, decodeVal(val, member.schema))
  }

  const out: Record<string, unknown> = {}
  for (const member of declared) {
    if (seen.has(member.prop)) {
      out[member.prop] = seen.get(member.prop)
    } else if (member.getDefault !== undefined) {
      out[member.prop] = member.getDefault()
    } else if (member.schema.kind === "option") {
      out[member.prop] = undefined
    } else {
      throw EnvyError.missingValue(member.name)
    }
  }
  return out
}

function decodeMap(vars: readonly NamedVal[], schema: MapSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [name, val] of vars) {
    out[name] = decodeVal(val, schema.value)
  }
  return out
}

export function decode<S extends Schema>(entries: Entries, schema: S, keepNames: boolean): Infer<S>
export function decode(entries: Entries, schema: Schema, keepNames: boolean): unknown {
  const vars: readonly NamedVal[] = entries.map(([key, value]) => [
    keepNames ? key : key.toLowerCase(),
    { key, value },
  ])

  switch (schema.kind) {
    case "struct":
      return decodeStruct(vars, schema)
    case "map":
      return decodeMap(vars, schema)
    default:
      throw EnvyError.custom(`invalid type: map, expected ${expecting(schema)}`)
  }
}
