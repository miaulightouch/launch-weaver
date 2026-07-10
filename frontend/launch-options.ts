export interface EnvironmentVariable {
  key: string;
  value: string;
  original?: {
    key: string;
    leading: string;
    raw: string;
    value: string;
  };
}

export interface ParsedLaunchOptions {
  env: EnvironmentVariable[];
  hadEnvironmentPrefix: boolean;
  tail: string;
}

const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SAFE_UNQUOTED_VALUE = /^[A-Za-z0-9_./,:+%@=-]+$/;
const UNSAFE_UNQUOTED_CHARACTER = /[$`~;|&<>()]/;

function isWhitespace(character: string) {
  return character === " " || character === "\t";
}

function parseAssignmentAt(raw: string, start: number) {
  const keyMatch = /^[A-Za-z_][A-Za-z0-9_]*=/.exec(raw.slice(start));
  if (!keyMatch) return null;

  const key = keyMatch[0].slice(0, -1);
  let cursor = start + keyMatch[0].length;
  let value = "";

  while (cursor < raw.length && !isWhitespace(raw[cursor]!)) {
    const character = raw[cursor]!;

    if (character === "'") {
      const closingQuote = raw.indexOf("'", cursor + 1);
      if (closingQuote === -1) return null;

      value += raw.slice(cursor + 1, closingQuote);
      cursor = closingQuote + 1;
      continue;
    }

    if (character === '"') {
      cursor += 1;
      let closed = false;

      while (cursor < raw.length) {
        const quotedCharacter = raw[cursor]!;
        if (quotedCharacter === '"') {
          cursor += 1;
          closed = true;
          break;
        }

        if (quotedCharacter === "\\") {
          const escaped = raw[cursor + 1];
          if (escaped === undefined) return null;

          if ('"\\$`'.includes(escaped)) {
            value += escaped;
          } else if (escaped !== "\n") {
            value += `\\${escaped}`;
          }
          cursor += 2;
          continue;
        }

        if (quotedCharacter === "$" || quotedCharacter === "`") return null;
        value += quotedCharacter;
        cursor += 1;
      }

      if (!closed) return null;
      continue;
    }

    if (character === "\\") {
      const escaped = raw[cursor + 1];
      if (escaped === undefined) return null;
      value += escaped;
      cursor += 2;
      continue;
    }

    if (UNSAFE_UNQUOTED_CHARACTER.test(character)) return null;

    value += character;
    cursor += 1;
  }

  return {
    end: cursor,
    entry: {
      key,
      value,
      original: {
        key,
        leading: "",
        raw: raw.slice(start, cursor),
        value,
      },
    } satisfies EnvironmentVariable,
  };
}

export function parseLaunchOptions(raw: string): ParsedLaunchOptions {
  if (/[\0\r\n]/.test(raw)) return { env: [], hadEnvironmentPrefix: false, tail: raw };

  const first = parseAssignmentAt(raw, 0);
  if (!first) {
    return { env: [], hadEnvironmentPrefix: false, tail: raw };
  }

  const env = [first.entry];
  let end = first.end;

  while (end < raw.length) {
    let nextStart = end;
    while (nextStart < raw.length && isWhitespace(raw[nextStart]!)) nextStart += 1;

    if (nextStart === end || nextStart === raw.length) break;

    const next = parseAssignmentAt(raw, nextStart);
    if (!next) break;

    next.entry.original!.leading = raw.slice(end, nextStart);
    env.push(next.entry);
    end = next.end;
  }

  return {
    env,
    hadEnvironmentPrefix: true,
    tail: raw.slice(end),
  };
}

function serializeValue(value: string) {
  if (value.length > 0 && SAFE_UNQUOTED_VALUE.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function serializeLaunchOptions(
  parsed: ParsedLaunchOptions,
  env: EnvironmentVariable[],
) {
  if (env.length === 0) return parsed.tail;

  const prefix = env
    .map((entry, index) => {
      const unchanged =
        entry.original?.key === entry.key && entry.original?.value === entry.value;
      const leading = index === 0 ? "" : (entry.original?.leading ?? " ");
      const token = unchanged ? entry.original!.raw : `${entry.key}=${serializeValue(entry.value)}`;

      return leading + token;
    })
    .join("");

  if (!parsed.hadEnvironmentPrefix && /^[ \t]*$/.test(parsed.tail)) {
    return `${prefix} %command%${parsed.tail}`;
  }
  if (parsed.tail.length === 0) return prefix;
  if (parsed.hadEnvironmentPrefix) return prefix + parsed.tail;
  return `${prefix} ${parsed.tail}`;
}

export function getEnvironmentError(env: EnvironmentVariable[]) {
  if (env.some(({ value }) => /[\0\r\n]/.test(value))) return "Values cannot contain control characters.";

  const invalid = env.find(({ key }) => !ENV_KEY.test(key));
  if (invalid) {
    return `Invalid environment variable name: ${invalid.key || "(empty)"}`;
  }

  const seen = new Set<string>();
  for (const { key } of env) {
    if (seen.has(key)) return `Duplicate environment variable: ${key}`;
    seen.add(key);
  }

  return null;
}
