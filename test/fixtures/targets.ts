import { t } from "../../src/dsl"
import type { Schema } from "../../src/schema"

const size = t.enumUnit("Size", ["small", "medium", "large"])
const customNewType = t.newtype("CustomNewType", t.u32())

const one = (name: string, v: Schema) => t.struct(name, { v })

export const foo = t.struct("Foo", {
  bar: t.string(),
  baz: t.bool(),
  zoom: t.option(t.u16()),
  doom: t.vec(t.u64()),
  boom: t.vec(t.string()),
  kaboom: t.field(t.u16(), { default: () => 8080 }),
  debug_mode: t.field(t.bool(), { default: () => false }),
  size: t.field(size, { default: () => "medium" as const }),
  provided: t.option(t.string()),
  newtype: customNewType,
})

export const crazyFoo = t.struct("CrazyFoo", {
  bar: t.field(t.string(), { rename: "BaR" }),
  screaming_baz: t.field(t.bool(), { rename: "SCREAMING_BAZ" }),
  zoom: t.option(t.u16()),
})

const defaults = t.struct("DefaultsS", {
  b: t.field(t.bool(), { default: () => false }),
  n: t.field(t.u16(), { default: () => 0 }),
  s: t.field(t.string(), { default: () => "" }),
  v: t.field(t.vec(t.u32()), { default: () => [] }),
  o: t.field(t.option(t.u16()), { default: () => undefined }),
  size: t.field(size, { default: () => "medium" as const }),
})

const TARGETS: Readonly<Record<string, Schema>> = {
  Foo: foo,
  CrazyFoo: crazyFoo,
  DefaultsS: defaults,
  OptStr: t.struct("OptStr", { provided: t.option(t.string()) }),
  Dup: t.struct("Dup", { foo: t.string() }),
  SizeS: t.struct("SizeS", { size }),
  NestedS: t.struct("NestedS", { inner: t.struct("Inner", { a: t.u32() }) }),
  BoolS: one("BoolS", t.bool()),
  CharS: one("CharS", t.char()),
  StrS: one("StrS", t.string()),
  U8S: one("U8S", t.u8()),
  I8S: one("I8S", t.i8()),
  U16S: one("U16S", t.u16()),
  I32S: one("I32S", t.i32()),
  U64S: one("U64S", t.u64()),
  I64S: one("I64S", t.i64()),
  U128S: one("U128S", t.u128()),
  I128S: one("I128S", t.i128()),
  F32S: one("F32S", t.f32()),
  F64S: one("F64S", t.f64()),
  VecU32S: one("VecU32S", t.vec(t.u32())),
  VecStrS: one("VecStrS", t.vec(t.string())),
  VecSizeS: one("VecSizeS", t.vec(size)),
  OptU16S: one("OptU16S", t.option(t.u16())),
  OptVecS: one("OptVecS", t.option(t.vec(t.u32()))),
  NewtypeS: one("NewtypeS", customNewType),
  LoudS: one("LoudS", t.enumUnit("Loud", ["ONE_TWO", "THREE_FOUR"])),
  KebabS: one("KebabS", t.enumUnit("Kebab", ["one-two", "three-four"])),
  PlainS: one("PlainS", t.enumUnit("Plain", ["OneTwo", "ThreeFour"])),
  MapString: t.map(t.string()),
  MapU32: t.map(t.u32()),
  MapVecU32: t.map(t.vec(t.u32())),
  MapValueS: one("MapValueS", t.map(t.u32())),
  TopBool: t.bool(),
  TopString: t.string(),
  TopChar: t.char(),
  TopU16: t.u16(),
  TopF64: t.f64(),
  TopVecU32: t.vec(t.u32()),
  TopOptU16: t.option(t.u16()),
  TopSize: size,
  TopNewtype: customNewType,
}

export function targetSchema(name: string): Schema {
  const schema = TARGETS[name]
  if (schema === undefined) throw new Error(`parity fixture references unknown target ${name}`)
  return schema
}
