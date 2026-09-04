import { describe, expect, it } from "vitest"
import { EnvyError } from "../src/error"
import { fromIter, keepNames, prefixed } from "../src/index"
import type { Schema } from "../src/schema"
import raw from "./fixtures/rust-parity.json"
import { targetSchema } from "./fixtures/targets"
import { parseScenarios, type Scenario } from "./helpers/scenarios"
import { toWire } from "./helpers/wire"

const scenarios = parseScenarios(raw)

/**
 * serde has no `u128`/`i128` support behind `Deserializer::deserialize_any`, so
 * upstream rejects both outright. JS has `BigInt`, so `t.u128()`/`t.i128()` are
 * offered as an extension; these ids are the scenarios where that is visible.
 */
const WIDENED_INTEGERS: ReadonlyMap<string, bigint> = new Map([
  ["u128_supported", 1n],
  ["i128_supported", -1n],
  ["u128_max", 340282366920938463463374607431768211455n],
  ["i128_min", -170141183460469231731687303715884105728n],
])

function decode(scenario: Scenario, schema: Schema): unknown {
  const mode = scenario.mode
  switch (mode.kind) {
    case "plain":
      return fromIter(scenario.input, schema)
    case "prefixed":
      return prefixed(mode.prefix).fromIter(scenario.input, schema)
    case "keepNames":
      return keepNames().fromIter(scenario.input, schema)
  }
}

describe("parity with the Rust crate", () => {
  it("covers every scenario the Rust harness recorded", () => {
    expect(scenarios).toHaveLength(281)
  })

  for (const scenario of scenarios) {
    it(scenario.id, () => {
      const schema = targetSchema(scenario.target)
      const outcome = scenario.outcome

      const widened = WIDENED_INTEGERS.get(scenario.id)
      if (widened !== undefined) {
        expect(outcome.ok ? "" : outcome.error.message).toMatch(/^[ui]128 is not supported$/)
        expect(decode(scenario, schema)).toEqual({ v: widened })
        return
      }

      if (outcome.ok) {
        expect(toWire(decode(scenario, schema), schema)).toEqual(outcome.value)
        return
      }

      try {
        decode(scenario, schema)
      } catch (error) {
        if (!(error instanceof EnvyError)) throw error
        expect(error.kind).toBe(outcome.error.kind)
        expect(error.message).toBe(outcome.error.message)
        expect(error.field ?? error.message).toBe(outcome.error.payload)
        return
      }
      expect.fail(`expected ${outcome.error.kind} but decoding succeeded`)
    })
  }
})
