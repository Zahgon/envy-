import { assertNever } from "../../src/internal/format"
import { isBigIntType } from "../../src/internal/parse-scalar"
import type { Schema, StructSchema } from "../../src/schema"

const scratch = new DataView(new ArrayBuffer(8))

/** The Rust harness emits floats as their IEEE-754 bit pattern so that NaN,
 * the infinities and negative zero survive the JSON round trip unambiguously. */
function floatBits(value: number): string {
  scratch.setFloat64(0, value)
  return scratch.getBigUint64(0).toString()
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null
}

function isList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

function structWire(value: unknown, schema: StructSchema): unknown {
  if (!isRecord(value)) return value
  const out: Record<string, unknown> = {}
  for (const [prop, def] of Object.entries(schema.fields)) {
    const isField = def.kind === "field"
    out[isField && def.rename !== undefined ? def.rename : prop] = toWire(
      value[prop],
      isField ? def.schema : def,
    )
  }
  return out
}

/** Re-encodes a decoded value into the exact JSON shape `serde_json` produced
 * for the equivalent Rust value, so fixtures can be compared with `toEqual`. */
export function toWire(value: unknown, schema: Schema): unknown {
  if (value === undefined) return null
  switch (schema.kind) {
    case "int":
      return isBigIntType(schema.ty) ? String(value) : value
    case "float":
      return typeof value === "number" ? floatBits(value) : value
    case "option":
    case "newtype":
      return toWire(value, schema.inner)
    case "vec":
      return isList(value) ? value.map((item) => toWire(item, schema.inner)) : value
    case "map":
      return isRecord(value)
        ? Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, toWire(item, schema.value)]),
          )
        : value
    case "struct":
      return structWire(value, schema)
    case "bool":
    case "string":
    case "char":
    case "enum":
    case "ignored":
      return value
    default:
      return assertNever(schema)
  }
}
