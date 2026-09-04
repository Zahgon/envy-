import { describe, expect, it } from "vitest"
import { t } from "../src/dsl"
import { EnvyError } from "../src/error"
import { hostEnv } from "../src/internal/env"
import {
  expecting,
  oneOf,
  rustDebugStr,
  unknownField,
  unknownVariant,
} from "../src/internal/format"
import { rustTrim } from "../src/internal/unicode"

describe("rustDebugStr", () => {
  it("escapes the characters Rust's `{:?}` escapes for &str", () => {
    expect(rustDebugStr('a"b')).toBe('"a\\"b"')
    expect(rustDebugStr("a\\b")).toBe('"a\\\\b"')
    expect(rustDebugStr("a\nb")).toBe('"a\\nb"')
    expect(rustDebugStr("a\rb")).toBe('"a\\rb"')
    expect(rustDebugStr("a\tb")).toBe('"a\\tb"')
  })

  it("gives NUL the short form and other controls \\u{..}", () => {
    expect(rustDebugStr("\u0000")).toBe('"\\0"')
    expect(rustDebugStr("\u001b")).toBe('"\\u{1b}"')
    expect(rustDebugStr("\u007f")).toBe('"\\u{7f}"')
    expect(rustDebugStr("\u009f")).toBe('"\\u{9f}"')
  })

  it("leaves the single quote unescaped, unlike Rust's char formatting", () => {
    expect(rustDebugStr("'")).toBe(`"'"`)
  })

  it("escapes format, private-use and combining characters", () => {
    expect(rustDebugStr("a\u0301")).toBe('"a\\u{301}"')
    expect(rustDebugStr("a\u09be")).toBe('"a\\u{9be}"')
    expect(rustDebugStr("a\u200d")).toBe('"a\\u{200d}"')
    expect(rustDebugStr("a\u00ad")).toBe('"a\\u{ad}"')
    expect(rustDebugStr("a\ufeff")).toBe('"a\\u{feff}"')
    expect(rustDebugStr("a\ue000")).toBe('"a\\u{e000}"')
    expect(rustDebugStr("a\u2028")).toBe('"a\\u{2028}"')
    expect(rustDebugStr("a\u00a0")).toBe('"a\\u{a0}"')
  })

  it("escapes the four zero-width Hangul fillers Rust treats as unprintable", () => {
    for (const filler of ["\u115f", "\u1160", "\u3164", "\uffa0"]) {
      const codePoint = (filler.codePointAt(0) ?? 0).toString(16)
      expect(rustDebugStr(filler)).toBe(`"\\u{${codePoint}}"`)
    }
  })

  it("leaves printable, precomposed and non-BMP characters alone", () => {
    expect(rustDebugStr("héllo 🎉")).toBe('"héllo 🎉"')
    expect(rustDebugStr("á")).toBe('"á"')
    expect(rustDebugStr("a\u0e33")).toBe('"a\u0e33"')
    expect(rustDebugStr("a\u{1d15f}")).toBe('"a\u{1d15f}"')
  })
})

describe("rustTrim", () => {
  it("trims every codepoint in Unicode White_Space", () => {
    for (const cp of [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x2028, 0x3000]) {
      expect(rustTrim(`${String.fromCodePoint(cp)}x${String.fromCodePoint(cp)}`)).toBe("x")
    }
  })

  it("keeps the two codepoints where String.trim disagrees with Rust", () => {
    expect(rustTrim("\u0085x")).toBe("x")
    expect("\u0085x".trim()).toBe("\u0085x")
    expect(rustTrim("\ufeffx")).toBe("\ufeffx")
    expect("\ufeffx".trim()).toBe("x")
  })

  it("keeps zero-width and format characters that are not White_Space", () => {
    for (const ch of ["\u180e", "\u200b", "\u200c", "\u200d", "\u2060"]) {
      expect(rustTrim(`${ch}x`)).toBe(`${ch}x`)
    }
  })
})

describe("oneOf", () => {
  it("renders one, two, and many names the way serde's OneOf does", () => {
    expect(oneOf(["a"])).toBe("`a`")
    expect(oneOf(["a", "b"])).toBe("`a` or `b`")
    expect(oneOf(["a", "b", "c"])).toBe("one of `a`, `b`, `c`")
  })
})

describe("unknownVariant / unknownField", () => {
  it("reports the empty case the way serde does", () => {
    expect(unknownVariant("x", [])).toBe("unknown variant `x`, there are no variants")
    expect(unknownField("x", [])).toBe("unknown field `x`, there are no fields")
  })

  it("lists the expected names otherwise", () => {
    expect(unknownVariant("x", ["a", "b"])).toBe("unknown variant `x`, expected `a` or `b`")
    expect(unknownField("x", ["a"])).toBe("unknown field `x`, expected `a`")
  })
})

describe("expecting", () => {
  it("borrows the numeric type or the schema's own name", () => {
    expect(expecting(t.u8())).toBe("u8")
    expect(expecting(t.i16())).toBe("i16")
    expect(expecting(t.i128())).toBe("i128")
    expect(expecting(t.f32())).toBe("f32")
    expect(expecting(t.struct("Foo", {}))).toBe("struct Foo")
    expect(expecting(t.enumUnit("Size", ["small"]))).toBe("enum Size")
    expect(expecting(t.newtype("Id", t.u32()))).toBe("tuple struct Id")
  })

  it("answers for every remaining kind, whose wording rust-parity.json pins", () => {
    const kinds = [
      t.bool(),
      t.string(),
      t.char(),
      t.ignored(),
      t.option(t.bool()),
      t.vec(t.bool()),
      t.map(t.bool()),
    ]

    for (const schema of kinds) {
      expect(expecting(schema).length).toBeGreaterThan(0)
    }
  })
})

describe("hostEnv", () => {
  it("reads process.env when the host exposes it", () => {
    const host = { process: { env: { FOO: "bar", NOPE: 7 } } }

    expect(hostEnv(host)).toEqual([["FOO", "bar"]])
  })

  it("falls back to Deno.env.toObject() when there is no process.env", () => {
    const host = { Deno: { env: { toObject: () => ({ FOO: "bar" }) } } }

    expect(hostEnv(host)).toEqual([["FOO", "bar"]])
  })

  it.each([
    ["host is not an object", null],
    ["process is not an object", { process: "nope" }],
    ["process.env is not an object", { process: { env: "nope" } }],
    ["Deno is not an object", { Deno: "nope" }],
    ["Deno.env is not an object", { Deno: { env: "nope" } }],
    ["Deno.env.toObject is not callable", { Deno: { env: { toObject: "nope" } } }],
    ["Deno.env.toObject returns a non-object", { Deno: { env: { toObject: () => "nope" } } }],
  ])("throws when %s", (_name, host) => {
    expect(() => hostEnv(host)).toThrow(
      EnvyError.custom("no process environment is available on this platform"),
    )
  })
})
