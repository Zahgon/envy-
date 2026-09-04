import { prefixed, t } from "../dist/index.js"

const config = t.struct("Config", { bar: t.option(t.string()) })

const result = prefixed("FOO_").fromEnvSafe(config)
if (result.ok) {
  console.log(`provided config.bar ${inspect(result.value.bar)}`)
} else {
  console.log(`error parsing config from env: ${result.error.message}`)
}

function inspect(value) {
  return value === undefined ? "None" : `Some(${JSON.stringify(value)})`
}
