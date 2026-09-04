# envy [![Github Actions](https://github.com/softprops/envy/workflows/Main/badge.svg)](https://github.com/softprops/envy/actions) [![Coverage Status](https://coveralls.io/repos/github/softprops/envy/badge.svg?branch=master)](https://coveralls.io/github/softprops/envy?branch=master) [![Software License](https://img.shields.io/badge/license-MIT-brightgreen.svg)](LICENSE) [![npm](https://img.shields.io/npm/v/envy)](https://www.npmjs.com/package/envy)

> deserialize environment variables into typesafe structs

## 📦  install

Run `npm add envy` or add the following to your `package.json` file.

```json
{
  "dependencies": {
    "envy": "0.4"
  }
}
```

envy has zero runtime dependencies and ships both ESM and CommonJS builds. It runs on Node 18+, Bun, and Deno.

## 🤸 usage

A typical envy usage looks like the following. Assuming your program looks something like this...

> 💡 These examples use envy's schema builder, `t`. Unlike Rust, JavaScript has no
> types at runtime, so the shape you want back is described with a value instead of
> a `#[derive(Deserialize)]` annotation. See [MIGRATION.md](MIGRATION.md) for details.

```ts
import { fromEnv, t } from "envy"

const config = t.struct("Config", {
  foo: t.u16(),
  bar: t.bool(),
  baz: t.string(),
  boom: t.option(t.u64()),
})

try {
  console.log(fromEnv(config))
} catch (error) {
  throw error
}
```

... export some environment variables

```bash
$ FOO=8080 BAR=true BAZ=hello yourapp
```

You should be able to access a completely typesafe config object deserialized from env vars. `Infer` derives the
static type from the schema, so `fromEnv(config)` above is typed
`{ foo: number; bar: boolean; baz: string; boom: bigint | undefined }` with no annotations of your own.

Envy assumes an env var exists for each field with a matching name in all uppercase letters. i.e. A field `foo_bar` would map to an env var named `FOO_BAR`.

Fields with an `option` type will successfully be deserialized when their associated env var is absent.

Envy also supports deserializing `vec`s from comma separated env var values.

Because envy mirrors serde's behavior, the field attributes you would reach for in Rust have direct equivalents, applied through `t.field`.

For instance let's say your app requires a field but would like a sensible default when one is not provided.

```ts
import { t } from "envy"

/** provides default value for zoom if ZOOM env var is not set */
const defaultZoom = () => 32

const config = t.struct("Config", {
  foo: t.u16(),
  bar: t.bool(),
  baz: t.string(),
  boom: t.option(t.u64()),
  zoom: t.field(t.u16(), { default: defaultZoom }),
})
```

The following will yield an application configured with a zoom of 32

```bash
$ FOO=8080 BAR=true BAZ=hello yourapp
```

The following will yield an application configured with a zoom of 10

```bash
$ FOO=8080 BAR=true BAZ=hello ZOOM=10 yourapp
```

The common pattern for prefixing env var names for a specific app is supported using
the `prefixed(prefix)` interface. Assuming your env vars are prefixed with `APP_`
the above example may instead look like

```ts
import { prefixed, t } from "envy"

const config = t.struct("Config", {
  foo: t.u16(),
  bar: t.bool(),
  baz: t.string(),
  boom: t.option(t.u64()),
})

console.log(prefixed("APP_").fromEnv(config))
```

the expectation would then be to export the same environment variables prefixed with `APP_`

```bash
$ APP_FOO=8080 APP_BAR=true APP_BAZ=hello yourapp
```

### 🧰 the schema builder

| builder | decodes to | Rust equivalent |
|---|---|---|
| `t.bool()` | `boolean` | `bool` |
| `t.string()` | `string` | `String` |
| `t.char()` | `string` (one scalar) | `char` |
| `t.u8/u16/u32()`, `t.i8/i16/i32()` | `number` | `u8`/`u16`/`u32`, `i8`/`i16`/`i32` |
| `t.u64()`, `t.i64()` | `bigint` | `u64`, `i64` |
| `t.u128()`, `t.i128()` | `bigint` | none — serde rejects `u128`/`i128` here, so this is an extension |
| `t.f32()`, `t.f64()` | `number` | `f32`, `f64` |
| `t.option(inner)` | `T \| undefined` | `Option<T>` |
| `t.vec(inner)` | `readonly T[]` | `Vec<T>` |
| `t.map(value)` | `Record<string, T>` | `HashMap<String, T>` |
| `t.enumUnit(name, variants)` | the variant union | unit-variant `enum` |
| `t.newtype(name, inner)` | `T` | newtype struct |
| `t.struct(name, fields)` | the object | `struct` |
| `t.ignored()` | `undefined` | `IgnoredAny` |
| `t.field(schema, { rename, default })` | — | `#[serde(rename = ..., default = ...)]` |

### 🙅 errors without throwing

Every entry point has a `Safe` twin that returns a discriminated result instead of throwing,
for codebases that prefer Rust's `Result` shape over exceptions:

```ts
import { fromEnvSafe, t } from "envy"

const result = fromEnvSafe(t.struct("Config", { foo: t.u16() }))
if (result.ok) {
  console.log(result.value.foo)
} else {
  console.log(result.error.message)
}
```

`fromEnvSafe`, `fromIterSafe`, `prefixed(p).fromEnvSafe`, and `keepNames().fromEnvSafe` are all available.

### 🔤 keeping names verbatim

`keepNames()` skips the lowercasing step, matching env var names exactly as they are exported:

```ts
import { keepNames, t } from "envy"

keepNames().fromIter({ BaR: "test" }, t.struct("Config", { BaR: t.string() }))
```

> 👭 Consider this package a cousin of [envy-store](https://github.com/softprops/envy-store), a crate for deserializing AWS parameter store values into typesafe structs and [recap](https://github.com/softprops/recap), a crate for deserializing named regex capture groups into typesafe structs.

Doug Tangren (softprops) 2016-2024
