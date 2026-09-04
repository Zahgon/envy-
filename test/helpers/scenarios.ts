export interface ScenarioFailure {
  readonly kind: "MissingValue" | "Custom"
  readonly payload: string
  readonly message: string
}

export type ScenarioOutcome =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: ScenarioFailure }

export type ScenarioMode =
  | { readonly kind: "plain" }
  | { readonly kind: "keepNames" }
  | { readonly kind: "prefixed"; readonly prefix: string }

export interface Scenario {
  readonly id: string
  readonly target: string
  readonly mode: ScenarioMode
  readonly input: readonly (readonly [string, string])[]
  readonly outcome: ScenarioOutcome
}

function fail(what: string): never {
  throw new Error(`malformed parity fixture: ${what}`)
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown, where: string): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) fail(`${where} is not an object`)
  return value
}

function asString(value: unknown, where: string): string {
  if (typeof value !== "string") fail(`${where} is not a string`)
  return value
}

function asList(value: unknown, where: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(`${where} is not an array`)
  const items: readonly unknown[] = value
  return items
}

function parseMode(value: unknown): ScenarioMode {
  const record = asRecord(value, "mode")
  const kind = asString(record["kind"], "mode.kind")
  if (kind === "plain") return { kind: "plain" }
  if (kind === "keepNames") return { kind: "keepNames" }
  if (kind === "prefixed") return { kind: "prefixed", prefix: asString(record["prefix"], "prefix") }
  return fail(`unknown mode ${kind}`)
}

function parseInput(value: unknown): readonly (readonly [string, string])[] {
  return asList(value, "input").map((pair) => {
    const cells = asList(pair, "input pair")
    if (cells.length !== 2) fail("input pair is not a key/value couple")
    return [asString(cells[0], "input key"), asString(cells[1], "input value")] as const
  })
}

function parseOutcome(value: unknown): ScenarioOutcome {
  const record = asRecord(value, "outcome")
  if (record["ok"] === true) return { ok: true, value: record["value"] }

  const error = asRecord(record["error"], "outcome.error")
  const kind = asString(error["kind"], "error.kind")
  if (kind !== "MissingValue" && kind !== "Custom") fail(`unknown error kind ${kind}`)
  return {
    ok: false,
    error: {
      kind,
      payload: asString(error["payload"], "error.payload"),
      message: asString(error["message"], "error.message"),
    },
  }
}

export function parseScenarios(raw: unknown): readonly Scenario[] {
  return asList(raw, "root").map((item) => {
    const record = asRecord(item, "scenario")
    return {
      id: asString(record["id"], "id"),
      target: asString(record["target"], "target"),
      mode: parseMode(record["mode"]),
      input: parseInput(record["input"]),
      outcome: parseOutcome(record["outcome"]),
    }
  })
}
