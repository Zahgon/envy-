import { fromEnvSafe, t } from "../dist/index.js"

const config = t.struct("Config", { size: t.option(t.u32()) })

const result = fromEnvSafe(config)
if (result.ok) {
  console.log(`provided config.size ${inspect(result.value.size)}`)
} else {
  console.log(`error parsing config from env: ${result.error.message}`)
}

function inspect(value) {
  return value === undefined ? "None" : `Some(${value})`
}
