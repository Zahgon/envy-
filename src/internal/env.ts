import { EnvyError } from "../error"
import type { Entries } from "./deserialize"

const NO_ENV = "no process environment is available on this platform"

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null
}

function stringEntries(source: Readonly<Record<string, unknown>>): Entries {
  const out: (readonly [string, string])[] = []
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") out.push([key, value])
  }
  return out
}

function nodeEnv(host: Readonly<Record<string, unknown>>): Entries | undefined {
  const process = host["process"]
  if (!isRecord(process)) return undefined
  const env = process["env"]
  return isRecord(env) ? stringEntries(env) : undefined
}

function denoEnv(host: Readonly<Record<string, unknown>>): Entries | undefined {
  const deno = host["Deno"]
  if (!isRecord(deno)) return undefined
  const env = deno["env"]
  if (!isRecord(env)) return undefined
  const toObject = env["toObject"]
  if (typeof toObject !== "function") return undefined
  const snapshot: unknown = toObject.call(env)
  return isRecord(snapshot) ? stringEntries(snapshot) : undefined
}

export function hostEnv(host: unknown): Entries {
  if (!isRecord(host)) throw EnvyError.custom(NO_ENV)
  return nodeEnv(host) ?? denoEnv(host) ?? raise()
}

/** Reads the ambient environment, standing in for Rust's `std::env::vars()`. */
export function readEnv(): Entries {
  return hostEnv(globalThis)
}

function raise(): never {
  throw EnvyError.custom(NO_ENV)
}
