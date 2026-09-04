import type {
  BoolSchema,
  CharSchema,
  EnumSchema,
  Field,
  Fields,
  FloatSchema,
  IgnoredSchema,
  Infer,
  IntSchema,
  IntTy,
  MapSchema,
  NewtypeSchema,
  OptionSchema,
  Schema,
  StringSchema,
  StructSchema,
  VecSchema,
} from "./schema"

export interface FieldOptions<S extends Schema> {
  /** `#[serde(rename = "...")]` — the name looked up in the environment. */
  readonly rename?: string
  /** `#[serde(default)]` / `#[serde(default = "...")]` — used only when the key is absent. */
  readonly default?: () => Infer<S>
}

export interface StructOptions {
  /** `#[serde(deny_unknown_fields)]`. Off by default, matching serde. */
  readonly denyUnknownFields?: boolean
}

const int = <TY extends IntTy>(ty: TY): IntSchema<TY> => ({ kind: "int", ty })

export const t = {
  bool: (): BoolSchema => ({ kind: "bool" }),
  string: (): StringSchema => ({ kind: "string" }),
  char: (): CharSchema => ({ kind: "char" }),
  ignored: (): IgnoredSchema => ({ kind: "ignored" }),

  u8: () => int("u8"),
  u16: () => int("u16"),
  u32: () => int("u32"),
  u64: () => int("u64"),
  u128: () => int("u128"),
  i8: () => int("i8"),
  i16: () => int("i16"),
  i32: () => int("i32"),
  i64: () => int("i64"),
  i128: () => int("i128"),

  f32: (): FloatSchema<"f32"> => ({ kind: "float", ty: "f32" }),
  f64: (): FloatSchema<"f64"> => ({ kind: "float", ty: "f64" }),

  option: <S extends Schema>(inner: S): OptionSchema<S> => ({ kind: "option", inner }),
  vec: <S extends Schema>(inner: S): VecSchema<S> => ({ kind: "vec", inner }),
  map: <S extends Schema>(value: S): MapSchema<S> => ({ kind: "map", value }),

  newtype: <S extends Schema>(name: string, inner: S): NewtypeSchema<S> => ({
    kind: "newtype",
    name,
    inner,
  }),

  enumUnit: <const V extends readonly string[]>(name: string, variants: V): EnumSchema<V> => ({
    kind: "enum",
    name,
    variants,
  }),

  struct: <const F extends Fields>(
    name: string,
    fields: F,
    options?: StructOptions,
  ): StructSchema<F> => ({
    kind: "struct",
    name,
    fields,
    denyUnknownFields: options?.denyUnknownFields ?? false,
  }),

  field: <S extends Schema>(schema: S, options: FieldOptions<NoInfer<S>>): Field<S> => ({
    kind: "field",
    schema,
    rename: options.rename,
    getDefault: options.default,
  }),
} as const
