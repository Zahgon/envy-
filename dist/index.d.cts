/**
 * Port of `envy::Error` (src/error.rs).
 *
 * The Rust crate models failures as a two-variant enum. JavaScript has no enums
 * with payloads, so the variant tag lives in `kind` and the payload in `field`.
 */
type EnvyErrorKind = "MissingValue" | "Custom";
declare class EnvyError extends Error {
    readonly name = "EnvyError";
    /** Discriminant mirroring the Rust `Error` enum. */
    readonly kind: EnvyErrorKind;
    /** Payload of `Error::MissingValue`; `undefined` for `Error::Custom`. */
    readonly field: string | undefined;
    private constructor();
    /** `Error::MissingValue(field)` — displays as `missing value for {field}`. */
    static missingValue(field: string): EnvyError;
    /** `Error::Custom(msg)` — displays as the message verbatim. */
    static custom(message: string): EnvyError;
    /** Structural comparison, mirroring `#[derive(PartialEq)]` on the Rust enum. */
    equals(other: EnvyError): boolean;
}

type IntTy = "u8" | "u16" | "u32" | "u64" | "u128" | "i8" | "i16" | "i32" | "i64" | "i128";
type BigIntTy = "u64" | "u128" | "i64" | "i128";
type FloatTy = "f32" | "f64";
interface BoolSchema {
    readonly kind: "bool";
}
interface StringSchema {
    readonly kind: "string";
}
interface CharSchema {
    readonly kind: "char";
}
interface IgnoredSchema {
    readonly kind: "ignored";
}
interface IntSchema<TY extends IntTy = IntTy> {
    readonly kind: "int";
    readonly ty: TY;
}
interface FloatSchema<TY extends FloatTy = FloatTy> {
    readonly kind: "float";
    readonly ty: TY;
}
interface OptionSchema<S extends Schema = Schema> {
    readonly kind: "option";
    readonly inner: S;
}
interface VecSchema<S extends Schema = Schema> {
    readonly kind: "vec";
    readonly inner: S;
}
interface NewtypeSchema<S extends Schema = Schema> {
    readonly kind: "newtype";
    readonly name: string;
    readonly inner: S;
}
interface MapSchema<S extends Schema = Schema> {
    readonly kind: "map";
    readonly value: S;
}
interface EnumSchema<V extends readonly string[] = readonly string[]> {
    readonly kind: "enum";
    readonly name: string;
    readonly variants: V;
}
interface StructSchema<F extends Fields = Fields> {
    readonly kind: "struct";
    readonly name: string;
    readonly fields: F;
    readonly denyUnknownFields: boolean;
}
/**
 * A struct member carrying the serde attributes that change decoding:
 * `#[serde(rename = "...")]` and `#[serde(default)]` / `#[serde(default = "...")]`.
 */
interface Field<S extends Schema = Schema> {
    readonly kind: "field";
    readonly schema: S;
    readonly rename: string | undefined;
    readonly getDefault: (() => unknown) | undefined;
}
type Fields = Readonly<Record<string, Schema | Field>>;
type Schema = BoolSchema | StringSchema | CharSchema | IgnoredSchema | IntSchema | FloatSchema | OptionSchema | VecSchema | NewtypeSchema | MapSchema | EnumSchema | StructSchema;
type InferMember<X> = X extends Field<infer S> ? Infer<S> : X extends Schema ? Infer<X> : never;
/**
 * Maps a schema to the shape it decodes to, mirroring the Rust target type.
 *
 * `Schema` is recursive, so the leading arm short-circuits the two inputs that
 * carry no shape information — `any` and the un-narrowed `Schema` union itself.
 * Without it those distribute forever and trip TS2589.
 */
type Infer<S extends Schema> = Schema extends S ? unknown : S extends BoolSchema ? boolean : S extends StringSchema ? string : S extends CharSchema ? string : S extends IgnoredSchema ? undefined : S extends IntSchema<infer TY> ? TY extends BigIntTy ? bigint : number : S extends FloatSchema ? number : S extends OptionSchema<infer I> ? Infer<I> | undefined : S extends VecSchema<infer I> ? readonly Infer<I>[] : S extends NewtypeSchema<infer I> ? Infer<I> : S extends MapSchema<infer I> ? Readonly<Record<string, Infer<I>>> : S extends EnumSchema<infer V> ? V[number] : S extends StructSchema<infer F> ? {
    readonly [K in keyof F]: InferMember<F[K]>;
} : never;

interface FieldOptions<S extends Schema> {
    /** `#[serde(rename = "...")]` — the name looked up in the environment. */
    readonly rename?: string;
    /** `#[serde(default)]` / `#[serde(default = "...")]` — used only when the key is absent. */
    readonly default?: () => Infer<S>;
}
interface StructOptions {
    /** `#[serde(deny_unknown_fields)]`. Off by default, matching serde. */
    readonly denyUnknownFields?: boolean;
}
declare const t: {
    readonly bool: () => BoolSchema;
    readonly string: () => StringSchema;
    readonly char: () => CharSchema;
    readonly ignored: () => IgnoredSchema;
    readonly u8: () => IntSchema<"u8">;
    readonly u16: () => IntSchema<"u16">;
    readonly u32: () => IntSchema<"u32">;
    readonly u64: () => IntSchema<"u64">;
    readonly u128: () => IntSchema<"u128">;
    readonly i8: () => IntSchema<"i8">;
    readonly i16: () => IntSchema<"i16">;
    readonly i32: () => IntSchema<"i32">;
    readonly i64: () => IntSchema<"i64">;
    readonly i128: () => IntSchema<"i128">;
    readonly f32: () => FloatSchema<"f32">;
    readonly f64: () => FloatSchema<"f64">;
    readonly option: <S extends Schema>(inner: S) => OptionSchema<S>;
    readonly vec: <S extends Schema>(inner: S) => VecSchema<S>;
    readonly map: <S extends Schema>(value: S) => MapSchema<S>;
    readonly newtype: <S extends Schema>(name: string, inner: S) => NewtypeSchema<S>;
    readonly enumUnit: <const V extends readonly string[]>(name: string, variants: V) => EnumSchema<V>;
    readonly struct: <const F extends Fields>(name: string, fields: F, options?: StructOptions) => StructSchema<F>;
    readonly field: <S extends Schema>(schema: S, options: FieldOptions<NoInfer<S>>) => Field<S>;
};

/** Anything a set of environment variables can arrive as. */
type EnvSource = Readonly<Record<string, string>> | Iterable<readonly [string, string]>;
type Result<T> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
    readonly error: EnvyError;
};
interface Scoped {
    readonly fromEnv: <S extends Schema>(schema: S) => Infer<S>;
    readonly fromIter: <S extends Schema>(source: EnvSource, schema: S) => Infer<S>;
    readonly fromEnvSafe: <S extends Schema>(schema: S) => Result<Infer<S>>;
    readonly fromIterSafe: <S extends Schema>(source: EnvSource, schema: S) => Result<Infer<S>>;
}
declare function fromEnv<S extends Schema>(schema: S): Infer<S>;
declare function fromIter<S extends Schema>(source: EnvSource, schema: S): Infer<S>;
declare function fromEnvSafe<S extends Schema>(schema: S): Result<Infer<S>>;
declare function fromIterSafe<S extends Schema>(source: EnvSource, schema: S): Result<Infer<S>>;
/** Scopes decoding to variables carrying `prefix`, which is stripped from each key. */
declare function prefixed(prefix: string): Scoped;
/** Scopes decoding to verbatim variable names, skipping the lowercasing step. */
declare function keepNames(): Scoped;

export { type BigIntTy, type EnvSource, EnvyError, type EnvyErrorKind, type Field, type FieldOptions, type Fields, type FloatTy, type Infer, type IntTy, type Result, type Schema, type Scoped, type StructOptions, fromEnv, fromEnvSafe, fromIter, fromIterSafe, keepNames, prefixed, t };
