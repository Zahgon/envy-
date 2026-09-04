// src/error.ts
var EnvyError = class _EnvyError extends Error {
  name = "EnvyError";
  /** Discriminant mirroring the Rust `Error` enum. */
  kind;
  /** Payload of `Error::MissingValue`; `undefined` for `Error::Custom`. */
  field;
  constructor(kind, message, field) {
    super(message);
    this.kind = kind;
    this.field = field;
    Object.setPrototypeOf(this, _EnvyError.prototype);
  }
  /** `Error::MissingValue(field)` — displays as `missing value for {field}`. */
  static missingValue(field) {
    return new _EnvyError("MissingValue", `missing value for ${field}`, field);
  }
  /** `Error::Custom(msg)` — displays as the message verbatim. */
  static custom(message) {
    return new _EnvyError("Custom", message, void 0);
  }
  /** Structural comparison, mirroring `#[derive(PartialEq)]` on the Rust enum. */
  equals(other) {
    return this.kind === other.kind && this.field === other.field && this.message === other.message;
  }
};

// src/internal/unicode.ts
var WHITESPACE = "\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
var TRIM = new RegExp(`^[${WHITESPACE}]+|[${WHITESPACE}]+$`, "gu");
function rustTrim(value) {
  return value.replace(TRIM, "");
}
var NON_PRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}\p{Grapheme_Extend}]/u;
var HANGUL_FILLER = /* @__PURE__ */ new Set(["\u115F", "\u1160", "\u3164", "\uFFA0"]);
function isRustPrintable(ch) {
  if (ch === " ") return true;
  if (HANGUL_FILLER.has(ch)) return false;
  return !NON_PRINTABLE.test(ch);
}

// src/internal/format.ts
var SIMPLE_ESCAPES = {
  "\0": "\\0",
  '"': '\\"',
  "\\": "\\\\",
  "\n": "\\n",
  "\r": "\\r",
  "	": "\\t"
};
function rustDebugStr(value) {
  let out = '"';
  for (const ch of value) {
    const simple = SIMPLE_ESCAPES[ch];
    if (simple !== void 0) {
      out += simple;
      continue;
    }
    out += isRustPrintable(ch) ? ch : `\\u{${(ch.codePointAt(0) ?? 0).toString(16)}}`;
  }
  return `${out}"`;
}
function oneOf(names) {
  const [first, second] = names;
  if (names.length === 1 && first !== void 0) return `\`${first}\``;
  if (names.length === 2 && first !== void 0 && second !== void 0) {
    return `\`${first}\` or \`${second}\``;
  }
  return `one of ${names.map((name) => `\`${name}\``).join(", ")}`;
}
function unknownVariant(variant, expected) {
  if (expected.length === 0) return `unknown variant \`${variant}\`, there are no variants`;
  return `unknown variant \`${variant}\`, expected ${oneOf(expected)}`;
}
function unknownField(field, expected) {
  if (expected.length === 0) return `unknown field \`${field}\`, there are no fields`;
  return `unknown field \`${field}\`, expected ${oneOf(expected)}`;
}
function assertNever(value) {
  throw new TypeError(`not a schema: ${JSON.stringify(value)}`);
}
var FIXED_EXPECTING = {
  bool: "a boolean",
  string: "a string",
  char: "a character",
  ignored: "anything at all",
  option: "option",
  vec: "a sequence",
  map: "a map"
};
function expecting(schema) {
  switch (schema.kind) {
    case "bool":
    case "string":
    case "char":
    case "ignored":
    case "option":
    case "vec":
    case "map":
      return FIXED_EXPECTING[schema.kind];
    case "int":
      return schema.ty;
    case "float":
      return schema.ty;
    case "struct":
      return `struct ${schema.name}`;
    case "enum":
      return `enum ${schema.name}`;
    case "newtype":
      return `tuple struct ${schema.name}`;
    default:
      return assertNever(schema);
  }
}

// src/internal/parse-scalar.ts
var BOOL_INVALID = "provided string was not `true` or `false`";
var INT_EMPTY = "cannot parse integer from empty string";
var INT_INVALID_DIGIT = "invalid digit found in string";
var INT_TOO_LARGE = "number too large to fit in target type";
var INT_TOO_SMALL = "number too small to fit in target type";
var FLOAT_EMPTY = "cannot parse float from empty string";
var FLOAT_INVALID = "invalid float literal";
var INT_LIMITS = {
  u8: { min: 0n, max: 255n, signed: false },
  u16: { min: 0n, max: 65535n, signed: false },
  u32: { min: 0n, max: 4294967295n, signed: false },
  u64: { min: 0n, max: 18446744073709551615n, signed: false },
  u128: { min: 0n, max: 340282366920938463463374607431768211455n, signed: false },
  i8: { min: -128n, max: 127n, signed: true },
  i16: { min: -32768n, max: 32767n, signed: true },
  i32: { min: -2147483648n, max: 2147483647n, signed: true },
  i64: { min: -9223372036854775808n, max: 9223372036854775807n, signed: true },
  i128: {
    min: -170141183460469231731687303715884105728n,
    max: 170141183460469231731687303715884105727n,
    signed: true
  }
};
var BIG_INT_TYPES = {
  u8: false,
  u16: false,
  u32: false,
  u64: true,
  u128: true,
  i8: false,
  i16: false,
  i32: false,
  i64: true,
  i128: true
};
function isBigIntType(ty) {
  return BIG_INT_TYPES[ty];
}
function failure(message) {
  return { ok: false, message };
}
function parseRustBool(text) {
  if (text === "true") return { ok: true, value: true };
  if (text === "false") return { ok: true, value: false };
  return failure(BOOL_INVALID);
}
function parseRustInt(text, ty) {
  if (text.length === 0) return failure(INT_EMPTY);
  const limits = INT_LIMITS[ty];
  const sign = text[0];
  let start = 0;
  let negative = false;
  if (sign === "+" || sign === "-") {
    if (text.length === 1) return failure(INT_INVALID_DIGIT);
    if (sign === "+") {
      start = 1;
    } else if (limits.signed) {
      start = 1;
      negative = true;
    }
  }
  let magnitude = 0n;
  for (let index = start; index < text.length; index += 1) {
    const digit = text.charCodeAt(index) - 48;
    if (digit < 0 || digit > 9) return failure(INT_INVALID_DIGIT);
    magnitude = magnitude * 10n + BigInt(digit);
  }
  const value = negative ? -magnitude : magnitude;
  if (value > limits.max) return failure(INT_TOO_LARGE);
  if (value < limits.min) return failure(INT_TOO_SMALL);
  return { ok: true, value };
}
var FLOAT_BODY = /^(?:\d+|\d+\.\d*|\d*\.\d+)(?:[eE][+-]?\d+)?$/;
function negativeNaN() {
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, 0xfff8000000000000n);
  return view.getFloat64(0);
}
function parseRustFloat(text) {
  if (text.length === 0) return failure(FLOAT_EMPTY);
  const signum = text.startsWith("-") ? -1 : 1;
  const body = text.startsWith("-") || text.startsWith("+") ? text.slice(1) : text;
  const lowered = body.toLowerCase();
  if (lowered === "inf" || lowered === "infinity") {
    return { ok: true, value: signum * Number.POSITIVE_INFINITY };
  }
  if (lowered === "nan") return { ok: true, value: signum < 0 ? negativeNaN() : Number.NaN };
  if (!FLOAT_BODY.test(body)) return failure(FLOAT_INVALID);
  return { ok: true, value: signum * Number(body) };
}

// src/internal/deserialize.ts
function members(fields) {
  return Object.entries(fields).map(
    ([prop, def]) => def.kind === "field" ? { prop, name: def.rename ?? prop, schema: def.schema, getDefault: def.getDefault } : { prop, name: prop, schema: def, getDefault: void 0 }
  );
}
function scalarError(val, message) {
  return EnvyError.custom(`${message} while parsing value '${val.value}' provided by ${val.key}`);
}
function decodeVal(val, schema) {
  switch (schema.kind) {
    case "bool": {
      const parsed = parseRustBool(val.value);
      if (!parsed.ok) throw scalarError(val, parsed.message);
      return parsed.value;
    }
    case "int": {
      const parsed = parseRustInt(val.value, schema.ty);
      if (!parsed.ok) throw scalarError(val, parsed.message);
      return isBigIntType(schema.ty) ? parsed.value : Number(parsed.value);
    }
    case "float": {
      const parsed = parseRustFloat(val.value);
      if (!parsed.ok) throw scalarError(val, parsed.message);
      return schema.ty === "f32" ? Math.fround(parsed.value) : parsed.value;
    }
    case "char": {
      const chars = [...val.value];
      const only = chars[0];
      if (chars.length !== 1 || only === void 0) {
        const seen = rustDebugStr(val.value);
        throw EnvyError.custom(`invalid value: string ${seen}, expected a character`);
      }
      return only;
    }
    case "string":
      return val.value;
    case "ignored":
      return void 0;
    case "option":
    case "newtype":
      return decodeVal(val, schema.inner);
    case "vec": {
      if (val.value === "") return [];
      const inner = schema.inner;
      return val.value.split(",").map((part) => decodeVal({ key: val.key, value: rustTrim(part) }, inner));
    }
    case "enum":
      if (!schema.variants.includes(val.value)) {
        throw EnvyError.custom(unknownVariant(val.value, schema.variants));
      }
      return val.value;
    case "struct":
    case "map":
      throw EnvyError.custom(
        `invalid type: string ${rustDebugStr(val.value)}, expected ${expecting(schema)}`
      );
    default:
      return assertNever(schema);
  }
}
function decodeStruct(vars, schema) {
  const declared = members(schema.fields);
  const byName = new Map(declared.map((member) => [member.name, member]));
  const seen = /* @__PURE__ */ new Map();
  for (const [name, val] of vars) {
    const member = byName.get(name);
    if (member === void 0) {
      if (schema.denyUnknownFields) {
        throw EnvyError.custom(
          unknownField(
            name,
            declared.map((each) => each.name)
          )
        );
      }
      continue;
    }
    if (seen.has(member.prop)) throw EnvyError.custom(`duplicate field \`${member.name}\``);
    seen.set(member.prop, decodeVal(val, member.schema));
  }
  const out = {};
  for (const member of declared) {
    if (seen.has(member.prop)) {
      out[member.prop] = seen.get(member.prop);
    } else if (member.getDefault !== void 0) {
      out[member.prop] = member.getDefault();
    } else if (member.schema.kind === "option") {
      out[member.prop] = void 0;
    } else {
      throw EnvyError.missingValue(member.name);
    }
  }
  return out;
}
function decodeMap(vars, schema) {
  const out = {};
  for (const [name, val] of vars) {
    out[name] = decodeVal(val, schema.value);
  }
  return out;
}
function decode(entries, schema, keepNames2) {
  const vars = entries.map(([key, value]) => [
    keepNames2 ? key : key.toLowerCase(),
    { key, value }
  ]);
  switch (schema.kind) {
    case "struct":
      return decodeStruct(vars, schema);
    case "map":
      return decodeMap(vars, schema);
    default:
      throw EnvyError.custom(`invalid type: map, expected ${expecting(schema)}`);
  }
}

// src/internal/env.ts
var NO_ENV = "no process environment is available on this platform";
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function stringEntries(source) {
  const out = [];
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") out.push([key, value]);
  }
  return out;
}
function nodeEnv(host) {
  const process = host["process"];
  if (!isRecord(process)) return void 0;
  const env = process["env"];
  return isRecord(env) ? stringEntries(env) : void 0;
}
function denoEnv(host) {
  const deno = host["Deno"];
  if (!isRecord(deno)) return void 0;
  const env = deno["env"];
  if (!isRecord(env)) return void 0;
  const toObject = env["toObject"];
  if (typeof toObject !== "function") return void 0;
  const snapshot = toObject.call(env);
  return isRecord(snapshot) ? stringEntries(snapshot) : void 0;
}
function hostEnv(host) {
  if (!isRecord(host)) throw EnvyError.custom(NO_ENV);
  return nodeEnv(host) ?? denoEnv(host) ?? raise();
}
function readEnv() {
  return hostEnv(globalThis);
}
function raise() {
  throw EnvyError.custom(NO_ENV);
}

// src/dsl.ts
var int = (ty) => ({ kind: "int", ty });
var t = {
  bool: () => ({ kind: "bool" }),
  string: () => ({ kind: "string" }),
  char: () => ({ kind: "char" }),
  ignored: () => ({ kind: "ignored" }),
  u8: () => int("u8"),
  u16: () => int("u16"),
  u32: () => int("u32"),
  u64: () => int("u64"),
  u128: () => int("u128"),
  i8: () => int("i8"),
  i16: () => int("i16"),
  i32: () => int("i32"),
  i64: () => int("i64"),
  i128: () => int("i128"),
  f32: () => ({ kind: "float", ty: "f32" }),
  f64: () => ({ kind: "float", ty: "f64" }),
  option: (inner) => ({ kind: "option", inner }),
  vec: (inner) => ({ kind: "vec", inner }),
  map: (value) => ({ kind: "map", value }),
  newtype: (name, inner) => ({
    kind: "newtype",
    name,
    inner
  }),
  enumUnit: (name, variants) => ({
    kind: "enum",
    name,
    variants
  }),
  struct: (name, fields, options) => ({
    kind: "struct",
    name,
    fields,
    denyUnknownFields: options?.denyUnknownFields ?? false
  }),
  field: (schema, options) => ({
    kind: "field",
    schema,
    rename: options.rename,
    getDefault: options.default
  })
};

// src/index.ts
function toEntries(source) {
  if (Symbol.iterator in source) return [...source];
  return Object.entries(source);
}
function attempt(run) {
  try {
    return { ok: true, value: run() };
  } catch (error) {
    if (error instanceof EnvyError) return { ok: false, error };
    throw error;
  }
}
function renameMissing(run, rename) {
  try {
    return run();
  } catch (error) {
    if (error instanceof EnvyError && error.kind === "MissingValue" && error.field !== void 0) {
      throw EnvyError.missingValue(rename(error.field));
    }
    throw error;
  }
}
var runPlain = (entries, schema) => renameMissing(
  () => decode(entries, schema, false),
  (field) => field.toUpperCase()
);
var runKeepNames = (entries, schema) => decode(entries, schema, true);
function stripPrefix(key, prefix) {
  if (prefix === "") return key;
  let rest = key;
  while (rest.startsWith(prefix)) rest = rest.slice(prefix.length);
  return rest;
}
function runPrefixed(prefix, entries, schema) {
  const scopedEntries = entries.filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [stripPrefix(key, prefix), value]);
  return renameMissing(
    () => runPlain(scopedEntries, schema),
    (field) => `${prefix}${field}`.toUpperCase()
  );
}
function scope(run) {
  return {
    fromEnv: (schema) => run(readEnv(), schema),
    fromIter: (source, schema) => run(toEntries(source), schema),
    fromEnvSafe: (schema) => attempt(() => run(readEnv(), schema)),
    fromIterSafe: (source, schema) => attempt(() => run(toEntries(source), schema))
  };
}
function fromEnv(schema) {
  return runPlain(readEnv(), schema);
}
function fromIter(source, schema) {
  return runPlain(toEntries(source), schema);
}
function fromEnvSafe(schema) {
  return attempt(() => fromEnv(schema));
}
function fromIterSafe(source, schema) {
  return attempt(() => fromIter(source, schema));
}
function prefixed(prefix) {
  return scope((entries, schema) => runPrefixed(prefix, entries, schema));
}
function keepNames() {
  return scope(runKeepNames);
}

export { EnvyError, fromEnv, fromEnvSafe, fromIter, fromIterSafe, keepNames, prefixed, t };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map