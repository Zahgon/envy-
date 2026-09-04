export type IntTy = "u8" | "u16" | "u32" | "u64" | "u128" | "i8" | "i16" | "i32" | "i64" | "i128"
export type BigIntTy = "u64" | "u128" | "i64" | "i128"
export type FloatTy = "f32" | "f64"

export interface BoolSchema {
  readonly kind: "bool"
}
export interface StringSchema {
  readonly kind: "string"
}
export interface CharSchema {
  readonly kind: "char"
}
export interface IgnoredSchema {
  readonly kind: "ignored"
}
export interface IntSchema<TY extends IntTy = IntTy> {
  readonly kind: "int"
  readonly ty: TY
}
export interface FloatSchema<TY extends FloatTy = FloatTy> {
  readonly kind: "float"
  readonly ty: TY
}
export interface OptionSchema<S extends Schema = Schema> {
  readonly kind: "option"
  readonly inner: S
}
export interface VecSchema<S extends Schema = Schema> {
  readonly kind: "vec"
  readonly inner: S
}
export interface NewtypeSchema<S extends Schema = Schema> {
  readonly kind: "newtype"
  readonly name: string
  readonly inner: S
}
export interface MapSchema<S extends Schema = Schema> {
  readonly kind: "map"
  readonly value: S
}
export interface EnumSchema<V extends readonly string[] = readonly string[]> {
  readonly kind: "enum"
  readonly name: string
  readonly variants: V
}
export interface StructSchema<F extends Fields = Fields> {
  readonly kind: "struct"
  readonly name: string
  readonly fields: F
  readonly denyUnknownFields: boolean
}

/**
 * A struct member carrying the serde attributes that change decoding:
 * `#[serde(rename = "...")]` and `#[serde(default)]` / `#[serde(default = "...")]`.
 */
export interface Field<S extends Schema = Schema> {
  readonly kind: "field"
  readonly schema: S
  readonly rename: string | undefined
  readonly getDefault: (() => unknown) | undefined
}

export type Fields = Readonly<Record<string, Schema | Field>>

export type Schema =
  | BoolSchema
  | StringSchema
  | CharSchema
  | IgnoredSchema
  | IntSchema
  | FloatSchema
  | OptionSchema
  | VecSchema
  | NewtypeSchema
  | MapSchema
  | EnumSchema
  | StructSchema

type InferMember<X> = X extends Field<infer S> ? Infer<S> : X extends Schema ? Infer<X> : never

/**
 * Maps a schema to the shape it decodes to, mirroring the Rust target type.
 *
 * `Schema` is recursive, so the leading arm short-circuits the two inputs that
 * carry no shape information — `any` and the un-narrowed `Schema` union itself.
 * Without it those distribute forever and trip TS2589.
 */
export type Infer<S extends Schema> = Schema extends S
  ? unknown
  : S extends BoolSchema
    ? boolean
    : S extends StringSchema
      ? string
      : S extends CharSchema
        ? string
        : S extends IgnoredSchema
          ? undefined
          : S extends IntSchema<infer TY>
            ? TY extends BigIntTy
              ? bigint
              : number
            : S extends FloatSchema
              ? number
              : S extends OptionSchema<infer I>
                ? Infer<I> | undefined
                : S extends VecSchema<infer I>
                  ? readonly Infer<I>[]
                  : S extends NewtypeSchema<infer I>
                    ? Infer<I>
                    : S extends MapSchema<infer I>
                      ? Readonly<Record<string, Infer<I>>>
                      : S extends EnumSchema<infer V>
                        ? V[number]
                        : S extends StructSchema<infer F>
                          ? { readonly [K in keyof F]: InferMember<F[K]> }
                          : never
