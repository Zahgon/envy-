import { afterEach, describe, expect, it, vi } from "vitest"
import { EnvyError } from "../src/error"
import { fromEnv, fromEnvSafe, fromIter, fromIterSafe, keepNames, prefixed, t } from "../src/index"

const port = t.struct("Port", { port: t.u16() })

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("EnvyError", () => {
  it("error_impl_std_error", () => {
    expect(EnvyError.missingValue("FOO_BAR")).toBeInstanceOf(Error)
    expect(EnvyError.custom("whoops")).toBeInstanceOf(Error)
  })

  it("error_display", () => {
    expect(EnvyError.missingValue("FOO_BAR").message).toBe("missing value for FOO_BAR")
    expect(EnvyError.custom("whoops").message).toBe("whoops")
  })

  it("compares structurally, like the Rust PartialEq derive", () => {
    expect(EnvyError.missingValue("A").equals(EnvyError.missingValue("A"))).toBe(true)
    expect(EnvyError.missingValue("A").equals(EnvyError.missingValue("B"))).toBe(false)
    expect(EnvyError.missingValue("A").equals(EnvyError.custom("missing value for A"))).toBe(false)
  })
})

describe("environment sources", () => {
  it("reads the ambient environment", () => {
    vi.stubEnv("PORT", "8080")

    expect(fromEnv(port)).toEqual({ port: 8080 })
    expect(prefixed("").fromEnv(port)).toEqual({ port: 8080 })
    expect(keepNames().fromEnv(t.struct("Port", { PORT: t.u16() }))).toEqual({ PORT: 8080 })
  })

  it("accepts a plain record", () => {
    expect(fromIter({ PORT: "1" }, port)).toEqual({ port: 1 })
  })

  it("accepts a Map", () => {
    expect(fromIter(new Map([["PORT", "2"]]), port)).toEqual({ port: 2 })
  })

  it("accepts a generator of pairs", () => {
    function* pairs(): Generator<readonly [string, string]> {
      yield ["PORT", "3"]
    }

    expect(fromIter(pairs(), port)).toEqual({ port: 3 })
  })
})

describe("safe variants", () => {
  it("returns the decoded value on success", () => {
    vi.stubEnv("PORT", "8080")

    expect(fromEnvSafe(port)).toEqual({ ok: true, value: { port: 8080 } })
    expect(fromIterSafe({ PORT: "1" }, port)).toEqual({ ok: true, value: { port: 1 } })
  })

  it("returns the error instead of throwing", () => {
    const result = fromIterSafe({}, port)

    expect(result.ok).toBe(false)
    expect(result).toEqual({ ok: false, error: EnvyError.missingValue("PORT") })
  })

  it("is available on every scope", () => {
    expect(prefixed("APP_").fromIterSafe({ APP_PORT: "1" }, port)).toEqual({
      ok: true,
      value: { port: 1 },
    })
    expect(keepNames().fromIterSafe({}, port)).toEqual({
      ok: false,
      error: EnvyError.missingValue("port"),
    })
    vi.stubEnv("PORT", "9")
    expect(prefixed("").fromEnvSafe(port)).toEqual({ ok: true, value: { port: 9 } })
    expect(keepNames().fromEnvSafe(t.struct("Port", { PORT: t.u16() }))).toEqual({
      ok: true,
      value: { PORT: 9 },
    })
  })
})

describe("schema extensions beyond the Rust crate", () => {
  it("rejects unknown variables when denyUnknownFields is set", () => {
    const strict = t.struct("Strict", { port: t.u16() }, { denyUnknownFields: true })

    const result = (): unknown => fromIter({ PORT: "1", EXTRA: "x" }, strict)

    expect(result).toThrowError("unknown field `extra`, expected `port`")
  })

  it("skips values the schema marks as ignored", () => {
    const schema = t.struct("Ignoring", { port: t.u16(), noise: t.ignored() })

    expect(fromIter({ PORT: "1", NOISE: "anything" }, schema)).toEqual({
      port: 1,
      noise: undefined,
    })
  })

  it("refuses a top-level schema that is not a struct or a map", () => {
    const result = (): unknown => fromIter({}, t.u16())

    expect(result).toThrowError("invalid type: map, expected u16")
  })

  it("lets a non-envy failure escape the safe variants instead of wrapping it", () => {
    const exploding = t.struct("Exploding", {
      a: t.field(t.u16(), {
        default: () => {
          throw new RangeError("boom")
        },
      }),
    })

    expect(() => fromIterSafe({}, exploding)).toThrowError(RangeError)
  })

  it("decodes the wide integer types as bigint", () => {
    const wide = t.struct("Wide", { a: t.u128(), b: t.i128() })

    expect(fromIter({ A: "340282366920938463463374607431768211455", B: "-17" }, wide)).toEqual({
      a: 340282366920938463463374607431768211455n,
      b: -17n,
    })
  })
})

describe("schemas built by untyped callers", () => {
  const bogus = JSON.parse('{"kind":"u1024"}')

  it("rejects an unknown kind at the top level", () => {
    expect(() => fromIter({ V: "1" }, bogus)).toThrowError(
      new TypeError('not a schema: {"kind":"u1024"}'),
    )
  })

  it("rejects an unknown kind inside a struct field", () => {
    expect(() => fromIter({ V: "1" }, t.struct("S", { v: bogus }))).toThrowError(
      new TypeError('not a schema: {"kind":"u1024"}'),
    )
  })

  it("does not let a malformed schema masquerade as an environment failure", () => {
    expect(() => fromIterSafe({ V: "1" }, bogus)).toThrowError(TypeError)
  })
})
