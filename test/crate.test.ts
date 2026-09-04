import { describe, expect, it } from "vitest"
import { EnvyError } from "../src/error"
import { fromIter, keepNames, prefixed, t } from "../src/index"
import { crazyFoo, foo } from "./fixtures/targets"

describe("fromIter", () => {
  it("deserialize_from_iter", () => {
    const data = [
      ["BAR", "test"],
      ["BAZ", "true"],
      ["DOOM", "1, 2, 3 "],
      ["BOOM", ""],
      ["SIZE", "small"],
      ["PROVIDED", "test"],
      ["NEWTYPE", "42"],
    ] as const

    const actual = fromIter(data, foo)

    expect(actual).toEqual({
      bar: "test",
      baz: true,
      zoom: undefined,
      doom: [1n, 2n, 3n],
      boom: [],
      kaboom: 8080,
      debug_mode: false,
      size: "small",
      provided: "test",
      newtype: 42,
    })
  })

  it("fails_with_missing_value", () => {
    const data = [
      ["BAR", "test"],
      ["BAZ", "true"],
    ] as const

    const result = (): unknown => fromIter(data, foo)

    expect(result).toThrowError(EnvyError.missingValue("DOOM"))
  })

  it("fails_with_invalid_type", () => {
    const data = [
      ["BAR", "test"],
      ["BAZ", "notabool"],
      ["DOOM", "1,2,3"],
    ] as const

    const result = (): unknown => fromIter(data, foo)

    expect(result).toThrowError(
      "provided string was not `true` or `false` while parsing value 'notabool' provided by BAZ",
    )
  })
})

describe("prefixed", () => {
  it("deserializes_from_prefixed_fieldnames", () => {
    const data = [
      ["APP_BAR", "test"],
      ["APP_BAZ", "true"],
      ["APP_DOOM", ""],
      ["APP_BOOM", "4,5"],
      ["APP_SIZE", "small"],
      ["APP_PROVIDED", "test"],
      ["APP_NEWTYPE", "42"],
    ] as const

    const actual = prefixed("APP_").fromIter(data, foo)

    expect(actual).toEqual({
      bar: "test",
      baz: true,
      zoom: undefined,
      doom: [],
      boom: ["4", "5"],
      kaboom: 8080,
      debug_mode: false,
      size: "small",
      provided: "test",
      newtype: 42,
    })
  })

  it("prefixed_fails_with_missing_value", () => {
    const data = [
      ["PREFIX_BAR", "test"],
      ["PREFIX_BAZ", "true"],
    ] as const

    const result = (): unknown => prefixed("PREFIX_").fromIter(data, foo)

    expect(result).toThrowError(EnvyError.missingValue("PREFIX_DOOM"))
  })

  it("prefixed_strips_prefixes", () => {
    const actual = prefixed("PRE_").fromIter([["PRE_FOO", "bar"]], t.map(t.string()))

    expect(actual).toEqual({ foo: "bar" })
  })

  it("prefixed_doesnt_parse_non_prefixed", () => {
    const data = [
      ["FOO", "asd"],
      ["PRE_FOO", "12"],
    ] as const

    const actual = prefixed("PRE_").fromIter(data, t.map(t.i32()))

    expect(actual).toEqual({ foo: 12 })
  })
})

describe("keepNames", () => {
  it("keep_names_from_iter", () => {
    const data = [
      ["BaR", "test"],
      ["SCREAMING_BAZ", "true"],
      ["zoom", "8080"],
    ] as const

    const actual = keepNames().fromIter(data, crazyFoo)

    expect(actual).toEqual({ bar: "test", screaming_baz: true, zoom: 8080 })
  })
})
