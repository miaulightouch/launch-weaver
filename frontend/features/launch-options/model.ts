export interface EnvironmentVariable {
  key: string;
  value: string;
}

export interface StructuredLaunchOptions {
  env: EnvironmentVariable[];
  wrappers: string[];
  parameters: string[];
}

export interface ParsedLaunchOptions extends StructuredLaunchOptions {
  error: string | null;
  explicitCommand: boolean;
  raw: string;
}

interface ShellWord {
  raw: string;
  value: string;
}

const COMMAND_PLACEHOLDER = "%command%";
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENV_PREFIX = /^([A-Za-z_][A-Za-z0-9_]*)=/;
const ASSIGNMENT_WORD = /^[A-Za-z_][A-Za-z0-9_]*\+?=/;
const SAFE_UNQUOTED_WORD = /^[A-Za-z0-9_./,:+%@=-]+$/;
const SHELL_RESERVED_WORDS = new Set([
  "case",
  "coproc",
  "do",
  "done",
  "elif",
  "else",
  "esac",
  "fi",
  "for",
  "function",
  "if",
  "in",
  "select",
  "then",
  "time",
  "until",
  "while",
]);
const UNSAFE_UNQUOTED_CHARACTERS = "$`~;|&<>()*?[]{}#!";

function isWhitespace(character: string) {
  return character === " " || character === "\t";
}

function parseWordAt(raw: string, start: number) {
  let cursor = start;
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
          } else {
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

    if (UNSAFE_UNQUOTED_CHARACTERS.includes(character)) return null;

    value += character;
    cursor += 1;
  }

  return {
    end: cursor,
    word: {
      raw: raw.slice(start, cursor),
      value,
    } satisfies ShellWord,
  };
}

function parseWords(raw: string) {
  const words: ShellWord[] = [];
  let cursor = 0;

  while (cursor < raw.length) {
    while (cursor < raw.length && isWhitespace(raw[cursor]!)) cursor += 1;
    if (cursor === raw.length) break;

    const parsed = parseWordAt(raw, cursor);
    if (!parsed) return null;

    words.push(parsed.word);
    cursor = parsed.end;
  }

  return words;
}

export interface ParsedWrapperRow {
  error: string | null;
  tokens: string[];
}

export function parseWrapperRow(raw: string): ParsedWrapperRow {
  if (/\0|\r|\n/.test(raw)) {
    return { error: "Wrappers cannot contain NUL, CR, or LF.", tokens: [] };
  }

  const words = parseWords(raw);
  if (!words) {
    return {
      error: "Wrapper rows cannot contain active or malformed shell syntax.",
      tokens: [],
    };
  }
  if (words.length === 0) {
    return { error: "Wrappers and prefix arguments cannot be empty.", tokens: [] };
  }
  return { error: null, tokens: words.map(({ value }) => value) };
}

function parseError(raw: string, error: string): ParsedLaunchOptions {
  return {
    env: [],
    error,
    explicitCommand: false,
    parameters: [],
    raw,
    wrappers: [],
  };
}

export function parseLaunchOptions(raw: string): ParsedLaunchOptions {
  if (/\0|\r|\n/.test(raw)) {
    return parseError(raw, "Launch Options cannot contain NUL, CR, or LF.");
  }

  const words = parseWords(raw);
  if (!words) {
    return parseError(
      raw,
      "Launch Options contains shell syntax that LaunchWeaver cannot edit safely.",
    );
  }

  const commandIndexes = words.flatMap((word, index) =>
    word.raw === COMMAND_PLACEHOLDER ? [index] : [],
  );
  const misplacedPlaceholder = words.some(
    (word) => word.raw !== COMMAND_PLACEHOLDER && word.value.includes(COMMAND_PLACEHOLDER),
  );

  if (commandIndexes.length > 1 || misplacedPlaceholder) {
    return parseError(
      raw,
      "%command% must appear at most once, unquoted, and as a standalone token.",
    );
  }

  if (commandIndexes.length === 0) {
    return {
      env: [],
      error: null,
      explicitCommand: false,
      parameters: words.map(({ value }) => value),
      raw,
      wrappers: [],
    };
  }

  const commandIndex = commandIndexes[0]!;
  const env: EnvironmentVariable[] = [];
  const wrappers: string[] = [];
  let readingEnvironment = true;

  for (const word of words.slice(0, commandIndex)) {
    const prefix = readingEnvironment ? ENV_PREFIX.exec(word.raw) : null;
    if (prefix) {
      env.push({
        key: prefix[1]!,
        value: word.value.slice(prefix[0].length),
      });
    } else {
      readingEnvironment = false;
      wrappers.push(word.value);
    }
  }

  return {
    env,
    error: null,
    explicitCommand: true,
    parameters: words.slice(commandIndex + 1).map(({ value }) => value),
    raw,
    wrappers,
  };
}

function sameEnvironment(left: EnvironmentVariable[], right: EnvironmentVariable[]) {
  return (
    left.length === right.length &&
    left.every(
      (entry, index) => entry.key === right[index]?.key && entry.value === right[index]?.value,
    )
  );
}

function sameStrings(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameStructure(left: StructuredLaunchOptions, right: StructuredLaunchOptions) {
  return (
    sameEnvironment(left.env, right.env) &&
    sameStrings(left.wrappers, right.wrappers) &&
    sameStrings(left.parameters, right.parameters)
  );
}

function quoteWord(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function serializeWord(value: string) {
  if (value.length > 0 && SAFE_UNQUOTED_WORD.test(value)) return value;
  return quoteWord(value);
}

function serializeWrapper(value: string) {
  if (ASSIGNMENT_WORD.test(value) || SHELL_RESERVED_WORDS.has(value)) return quoteWord(value);
  return serializeWord(value);
}

export function serializeLaunchOptions(
  parsed: ParsedLaunchOptions,
  next: StructuredLaunchOptions,
) {
  if (parsed.error || getLaunchOptionsError(next)) return parsed.raw;
  if (sameStructure(parsed, next)) return parsed.raw;

  if (next.env.length === 0 && next.wrappers.length === 0 && next.parameters.length === 0) {
    return "";
  }

  const prefix = [
    ...next.env.map(({ key, value }) => `${key}=${serializeWord(value)}`),
    ...next.wrappers.map(serializeWrapper),
  ];
  const parameters = next.parameters.map(serializeWord);

  if (prefix.length > 0 || parsed.explicitCommand) {
    return [...prefix, COMMAND_PLACEHOLDER, ...parameters].join(" ");
  }

  return parameters.join(" ");
}

export function getEnvironmentError(env: EnvironmentVariable[]) {
  if (env.some(({ value }) => /\0|\r|\n/.test(value))) {
    return "Values cannot contain control characters.";
  }

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

export function getLaunchOptionsError(options: StructuredLaunchOptions) {
  const environmentError = getEnvironmentError(options.env);
  if (environmentError) return environmentError;

  if (
    [...options.env.map(({ value }) => value), ...options.wrappers, ...options.parameters].some(
      (value) => value.includes(COMMAND_PLACEHOLDER),
    )
  ) {
    return "%command% is reserved for the game command placeholder.";
  }

  if (options.wrappers.some((value) => value.length === 0)) {
    return "Wrappers and prefix arguments cannot be empty.";
  }

  if ([...options.wrappers, ...options.parameters].some((value) => /\0|\r|\n/.test(value))) {
    return "Wrappers and parameters cannot contain control characters.";
  }

  return null;
}
