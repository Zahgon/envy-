import { fromIterSafe, keepNames, prefixed, t } from "./dist/index.js"

const size = t.enumUnit("Size", ["small", "medium", "large"])

const basicSchema = t.struct("Basic", {
  bar: t.string(),
  baz: t.bool(),
  zoom: t.option(t.u16()),
  doom: t.vec(t.u64()),
  kaboom: t.field(t.u16(), { default: () => 8080 }),
  size: t.field(size, { default: () => "medium" }),
})

const crazySchema = t.struct("Crazy", {
  bar: t.field(t.string(), { rename: "BaR" }),
  screaming_baz: t.field(t.bool(), { rename: "SCREAMING_BAZ" }),
})

const vecU64Schema = t.struct("VecU64", { v: t.vec(t.u64()) })
const optStrSchema = t.struct("OptStr", { v: t.option(t.string()) })
const sizeSchema = t.struct("SizeS", { v: size })
const f64Schema = t.struct("F64S", { v: t.f64() })
const strSchema = t.struct("StrS", { v: t.string() })

function float(value) {
  if (Number.isNaN(value)) return "nan"
  if (value === Number.POSITIVE_INFINITY) return "inf"
  if (value === Number.NEGATIVE_INFINITY) return "-inf"
  return String(value)
}

function option(value) {
  return value === undefined ? "None" : `Some(${value})`
}

function basic(config) {
  return [
    `bar=${config.bar}`,
    `baz=${config.baz}`,
    `zoom=${option(config.zoom)}`,
    `doom=[${config.doom.join(",")}]`,
    `kaboom=${config.kaboom}`,
    `size=${config.size}`,
  ].join(" ")
}

function show(scope, source, schema, render) {
  const result = scope.fromIterSafe(source, schema)
  console.log(result.ok ? `ok ${render(result.value)}` : `err ${result.error.message}`)
}

const plain = { fromIterSafe }

const PROBES = {
  "from-iter": () =>
    show(
      plain,
      [
        ["BAR", "test"],
        ["BAZ", "true"],
        ["DOOM", "1,2,3"],
        ["SIZE", "small"],
      ],
      basicSchema,
      basic,
    ),
  "missing-value": () => show(plain, [["BAR", "test"]], basicSchema, basic),
  "invalid-type": () =>
    show(
      plain,
      [
        ["BAR", "test"],
        ["BAZ", "notabool"],
        ["DOOM", ""],
      ],
      basicSchema,
      basic,
    ),
  "unknown-var-ignored": () =>
    show(
      plain,
      [
        ["BAR", "test"],
        ["BAZ", "false"],
        ["DOOM", ""],
        ["TOTALLY_UNRELATED", "42"],
      ],
      basicSchema,
      basic,
    ),
  prefixed: () =>
    show(
      prefixed("PREFIX_"),
      [
        ["PREFIX_BAR", "test"],
        ["PREFIX_BAZ", "true"],
        ["PREFIX_DOOM", "4"],
      ],
      basicSchema,
      basic,
    ),
  "prefixed-missing": () => show(prefixed("PREFIX_"), [["PREFIX_BAR", "test"]], basicSchema, basic),
  "keep-names": () =>
    show(
      keepNames(),
      [
        ["BaR", "test"],
        ["SCREAMING_BAZ", "true"],
      ],
      crazySchema,
      (config) => `bar=${config.bar} screaming_baz=${config.screaming_baz}`,
    ),
  "vec-trim-bom": () =>
    show(plain, [["V", "\ufeff1"]], vecU64Schema, (config) => `v=[${config.v.length}]`),
  "vec-trim-nel": () =>
    show(plain, [["V", "\u00851"]], vecU64Schema, (config) => `v=[${config.v.join(",")}]`),
  "vec-empty": () =>
    show(plain, [["V", ""]], vecU64Schema, (config) => `v=[] len=${config.v.length}`),
  "option-absent": () => show(plain, [], optStrSchema, (config) => `v=${option(config.v)}`),
  "option-empty": () => show(plain, [["V", ""]], optStrSchema, (config) => `v=${option(config.v)}`),
  "enum-unknown": () => show(plain, [["V", "huge"]], sizeSchema, (config) => `v=${config.v}`),
  "duplicate-field": () =>
    show(
      plain,
      [
        ["V", "one"],
        ["v", "two"],
      ],
      strSchema,
      (config) => `v=${config.v}`,
    ),
  "float-overflow": () =>
    show(plain, [["V", "1e400"]], f64Schema, (config) => `v=${float(config.v)}`),
}

const name = process.argv[2] ?? ""
const probe = PROBES[name]

if (probe === undefined) {
  console.error(`unknown probe: ${name}`)
  process.exit(1)
}

probe()
