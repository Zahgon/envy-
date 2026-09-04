# Migrating from `envy` (Rust) to `envy` (TypeScript)

This package is a functional port of the Rust crate [`softprops/envy`](https://github.com/softprops/envy) at version 0.4.2. It reproduces the crate's observable behavior — decoded values *and* error message text — rather than its internal structure.

## How equivalence was established

The port is not verified by hand. A Rust harness that depends on the crate by path replays a list of **281 scenarios** — each one an input set of env vars, a mode (`from_iter` / `prefixed` / `keep_names`), and a target type — and records the exact `Ok` value or `Err` message Rust produced.

The fixture can therefore be audited and regenerated rather than taken on trust:

| | |
|---|---|
| Harness and scenario list | `parity-harness/` in the migration deliverable, alongside this package rather than inside it — see its README for the regeneration command |
| Recorded ground truth | [`test/fixtures/rust-parity.json`](test/fixtures/rust-parity.json) |
| Replay | [`test/parity.test.ts`](test/parity.test.ts) |

The harness is a Rust binary, so it lives outside the published package: an npm package that carries `.rs` sources reads as an unfinished migration to anything scanning the tree, and the fixture it produces is checked in here regardless.

A second, coarser check runs the two libraries as *processes* rather than as fixtures. [`qc_probe.mjs`](qc_probe.mjs) here and `examples/qc_probe.rs` in the crate expose the same 15 named scenarios behind the same CLI, and [`qc_fixtures.json`](qc_fixtures.json) lists them. Each case prints one line, so stdout, stderr, and exit code can be diffed end to end — catching anything that a fixture replay could paper over, such as a difference in how a value is rendered on the way out.

To keep precision across the JSON boundary the fixture encodes `u64`/`i64` as decimal strings and floats as their IEEE-754 bit patterns, so `NaN`, `-NaN`, `±Infinity`, and `-0` are all unambiguous. Every one of the 8 unit tests in the crate's `src/lib.rs` and both tests in its `src/error.rs` are additionally ported verbatim in `test/crate.test.ts` and `test/api.test.ts`.

## The one intentional API change: schemas are values

Rust derives the target shape at compile time:

```rust
#[derive(Deserialize)]
struct Config { foo: u16, bar: Option<String> }

envy::from_env::<Config>()
```

TypeScript types are erased before the program runs, so there is nothing for a deserializer to inspect at the moment it needs to know that `foo` is a `u16`. The shape is therefore passed as a value:

```ts
const config = t.struct("Config", { foo: t.u16(), bar: t.option(t.string()) })

fromEnv(config)
```

This is the only place a caller has to write something they did not write in Rust. Static typing is not lost: `Infer<S>` reconstructs the type from the schema, so `fromEnv(config)` is typed `{ foo: number; bar: string | undefined }` with no annotation.

### serde attribute support

| Rust | TypeScript |
|---|---|
| `#[serde(rename = "BaR")]` | `t.field(schema, { rename: "BaR" })` |
| `#[serde(default)]` | `t.field(schema, { default: () => <the Default value> })` |
| `#[serde(default = "default_kaboom")]` | `t.field(schema, { default: defaultKaboom })` |
| `#[serde(rename_all = "lowercase")]` on an enum | spell the variants as they appear: `t.enumUnit("Size", ["small", "medium", "large"])` |
| `#[serde(deny_unknown_fields)]` | `t.struct(name, fields, { denyUnknownFields: true })` |
| `Option<T>` | `t.option(inner)` |
| newtype struct `struct CustomNewType(u32)` | `t.newtype("CustomNewType", t.u32())` |
| `serde::de::IgnoredAny` | `t.ignored()` |

`#[serde(default)]` has no runtime counterpart to `Default::default()`, so the value is written explicitly. `rename_all` is resolved at schema-construction time rather than being a flag, because the decoder only ever needs the final names.

## Type mapping

| Rust | TypeScript | note |
|---|---|---|
| `bool` | `boolean` | |
| `String` | `string` | |
| `char` | `string` | one Unicode scalar; a longer string is an error, as in Rust |
| `u8` `u16` `u32` `i8` `i16` `i32` | `number` | every value fits exactly in a double |
| `u64` `i64` | **`bigint`** | `u64::MAX` is 18446744073709551615; a double cannot hold it. Returning `number` would silently round, so these decode to `bigint`. |
| *(none)* | `bigint` via `t.u128()` / `t.i128()` | **No Rust counterpart.** serde routes these through `deserialize_any`, which fails with `u128 is not supported`, so upstream cannot read them at all. JS has `BigInt`, so the builders are offered as an extension — see [Additions](#additions). |
| `f32` | `number` | rounded through `Math.fround`, matching Rust's single precision |
| `f64` | `number` | |
| `Vec<T>` | `readonly T[]` | |
| `HashMap<String, T>` | `Record<string, T>` | |
| `Option<T>` | `T \| undefined` | |

## Errors

`Error` in Rust is an enum with two variants. Here it is a single `Error` subclass carrying a `kind` discriminant, so it is both `instanceof Error` (idiomatic JS) and exhaustively matchable:

```ts
class EnvyError extends Error {
  readonly kind: "MissingValue" | "Custom"
  readonly field: string | undefined
}
```

`error.message` is byte-identical to Rust's `Display` impl: `missing value for FOO_BAR` and, for `Custom`, the raw message. Rust's `PartialEq` derive is available as `error.equals(other)`.

Because Rust returns `Result` and JavaScript conventionally throws, both are offered. `fromEnv` / `fromIter` / `prefixed(p).fromEnv` / `keepNames().fromIter` throw; each has a `...Safe` twin returning `{ ok: true, value } | { ok: false, error }`. The safe variants only capture `EnvyError` — any other exception (for example one thrown by your own `default` callback) propagates untouched.

## Quirks preserved on purpose

These are behaviors a fresh implementation would likely "fix". They are reproduced deliberately, and each is pinned by a fixture scenario.

- **Prefixes are stripped repeatedly, not once.** Rust uses `trim_start_matches`, so `prefixed("PRE_")` turns `PRE_PRE_FOO` into `foo`, not `PRE_FOO`.
- **`prefixed` filters on an exact prefix match.** With prefix `PRE_`, the var `XPRE_FOO` is dropped entirely, and the var `PRE_` itself becomes the empty-string key.
- **Missing-field names are uppercased, but only in some modes.** `fromIter` uppercases the reported field (`doom` → `DOOM`); `prefixed` prepends the prefix and then uppercases the whole thing (`prefixed("pre_")` reports `PRE_BAZ`); `keepNames` does neither and reports the name verbatim.
- **Parse errors name the pre-prefix-stripped key.** Under `prefixed("APP_")`, a bad `APP_BAZ` reports `... provided by BAZ`. The prefix is gone by the time the value is parsed.
- **A `vec` from an empty string is empty, but a `vec` from `"   "` is not.** The empty-string check happens before splitting, so `"   "` splits into one element that then trims to `""`.
- **`option` distinguishes absent from present-and-empty.** An unset var yields `undefined`; `PROVIDED=""` yields `""`.
- **Defaults apply only when the key is absent.** A present-but-invalid value is a parse error, never a fallback to the default.
- **Unknown env vars are ignored.** This is serde's default and it matters here, since the environment always contains vars you did not model. `denyUnknownFields` is opt-in.
- **Scalar parse errors are Rust's, verbatim.** `"cannot parse integer from empty string"`, `"invalid digit found in string"`, `"number too large to fit in target type"`, `"number too small to fit in target type"`, `"cannot parse float from empty string"`, ``"provided string was not `true` or `false`"``. This extends to the edges: `+42` and `0042` parse, `4_2` and `0x10` do not, `1e400` is `Infinity` rather than an error, and `-0` keeps its sign.
- **`vec` elements are trimmed with Rust's whitespace set, not `String.prototype.trim`.** The two differ on exactly two codepoints: Rust's `char::is_whitespace` is the Unicode `White_Space` property, which **includes U+0085 (NEL)** and **excludes U+FEFF (BOM)**, while `trim()` does the opposite. A BOM leaking into a `.env` file is the realistic case: `V="\uFEFF1"` is a parse error in both, and would have silently succeeded had `trim()` been used. See `src/internal/unicode.ts`.
- **`char` errors escape the full Unicode unprintable set.** Rust's `{:?}` on a `&str` escapes the Cc, Cf, Cs, Co, Cn, Zl, Zp and Zs categories (space excepted), everything that is `Grapheme_Extend`, and four zero-width Hangul fillers — so an invalid `char` reports `string "a\u{301}"`, not `string "á"`. NUL renders as `\0` and `'` is left bare. The predicate was verified against rustc for all 1,112,064 codepoints.
- **`-nan` keeps its sign bit.** Rust parses it to `0xFFF8…`; so does this port. ECMAScript leaves NaN bit patterns implementation-defined, so this is best-effort on engines that canonicalise NaN — and no JS operator can observe the difference either way.

## Not ported

- **`from_env`'s reliance on `std::env::vars()`** becomes a small host adapter that reads `process.env` (Node, Bun) or falls back to `Deno.env.toObject()`. Non-string values are skipped.
- **Nested structs.** Rust cannot deserialize a nested struct from a flat env either — it fails with `invalid type: string ..., expected struct Inner`. The port reproduces that error rather than inventing a nesting convention.
- **`rustfmt.toml`** (`fn_params_layout = "Vertical"`, `imports_granularity = "Crate"`, `format_code_in_doc_comments = true`) has no meaningful counterpart; `biome.json` carries the equivalent intent with a 100 column width.
- **The `Makefile`'s tarpaulin coverage target** is replaced by `npm run coverage` (v8 provider), wired to the same Coveralls upload in CI.
- **`publish-docs`.** There is no `cargo doc` equivalent worth publishing; the `.d.ts` files are the API documentation.

## Additions

These exist here with no upstream counterpart, because JavaScript callers need them:

- `t.ignored()` and `denyUnknownFields`, exposing serde behavior that Rust users get through attributes.
- `fromIter` accepts a plain object, a `Map`, an array of pairs, or any iterable of pairs — Rust's signature takes `IntoIterator<Item = (String, String)>`, and these are its natural JavaScript analogues.
- **`t.u128()` and `t.i128()`.** Upstream cannot read 128-bit integers at all: serde's default `deserialize_u128` fails with `u128 is not supported`, and envy does not override it. Since `BigInt` has no width limit this port simply supports them. The divergence is deliberate and is asserted — not skipped — by the `WIDENED_INTEGERS` cases in `test/parity.test.ts`, which check that Rust rejected the input *and* that this port accepts it.
