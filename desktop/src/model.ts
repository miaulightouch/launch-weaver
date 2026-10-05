/** Launcher settings deliberately do not use Steam's %command% grammar. */
export type Launcher = "heroic" | "faugus";
export interface Game { id: string; name: string; launcher: Launcher; source: string; hasCover?: boolean }
export interface GameDocument { game: Game; snapshot: string; settings: Record<string, unknown>; defaults: Record<string, unknown> }
export interface LaunchDraft { env: { key: string; value: string }[]; wrappers: string[]; parameters: string[] }

/** POSIX shlex-style words, without executing or expanding any input. */
export function splitWords(raw: string): string[] {
  const words: string[] = [];
  let word = "", quote = "", active = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (c === "\0") throw new Error("NUL characters are not supported.");
    if (quote === "'") {
      if (c === "'") quote = ""; else word += c;
    } else if (quote === '"') {
      if (c === '"') quote = "";
      else if (c === "\\" && ['"', "\\"].includes(raw[i + 1] ?? "")) word += raw[++i];
      else word += c;
    } else if (c === "'" || c === '"') { quote = c; active = true; }
    else if (c === "\\") {
      if (++i >= raw.length) throw new Error("An argument ends with an incomplete escape.");
      word += raw[i]; active = true;
    } else if (/\s/.test(c)) {
      if (active) { words.push(word); word = ""; active = false; }
    } else { word += c; active = true; }
  }
  if (quote) throw new Error("An argument has an unclosed quote.");
  if (active) words.push(word);
  return words;
}
export function quoteWord(word: string): string {
  if (word.includes("\0")) throw new Error("NUL characters are not supported.");
  return /^[A-Za-z0-9_./,:+@%=-]+$/.test(word) ? word : "'" + word.replace(/'/g, "'\"'\"'") + "'";
}
export function joinWords(words: string[]): string { return words.map(quoteWord).join(" "); }
function stringField(value: unknown, name: string): string {
  if (value === undefined) return "";
  if (typeof value !== "string") throw new Error(`Unsupported ${name} format.`);
  return value;
}
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Unsupported settings row.");
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Unsupported settings list.");
  return value;
}
export function readDraft(document: GameDocument): LaunchDraft {
  const s = { ...document.defaults, ...document.settings };
  if (document.game.launcher === "heroic") {
    return {
      env: array(s.enviromentOptions).map((value) => {
        const row = object(value);
        if (Object.keys(row).some((k) => !["key", "value"].includes(k))) throw new Error("Unsupported environment row fields.");
        return { key: stringField(row.key, "environment key"), value: stringField(row.value, "environment value") };
      }),
      wrappers: array(s.wrapperOptions).map((value) => {
        const row = object(value);
        if (Object.keys(row).some((k) => !["exe", "args"].includes(k))) throw new Error("Unsupported wrapper row fields.");
        const exe = stringField(row.exe, "wrapper executable");
        if (!exe) throw new Error("A wrapper executable is missing.");
        return joinWords([exe, ...splitWords(stringField(row.args, "wrapper arguments"))]);
      }),
      parameters: splitWords(stringField(s.launcherArgs, "game arguments")),
    };
  }
  const prefix = stringField(s.launch_arguments, "launch prefix");
  const parameters = stringField(s.game_arguments, "game arguments");
  // Faugus expands variables and home paths before shlex parsing, even inside quotes.
  // Editing these as literal tokens could change their runtime meaning.
  if (/[$~]/.test(prefix + parameters)) throw new Error("This Faugus entry uses variable or home expansion. Edit those launch fields in Faugus; LaunchWeaver leaves them unchanged.");
  const words = splitWords(prefix);
  const env: LaunchDraft["env"] = [];
  while (words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]!)) {
    const word = words.shift()!, equals = word.indexOf("=");
    env.push({ key: word.slice(0, equals), value: word.slice(equals + 1) });
  }
  if ([...words, ...splitWords(parameters)].some(isAssignment)) throw new Error("Faugus treats assignment-shaped arguments as environment variables. Edit this entry in Faugus to avoid changing its meaning.");
  return { env, wrappers: words.length ? [joinWords(words)] : [], parameters: splitWords(parameters) };
}
const isAssignment = (word: string) => /^[\p{L}_][\p{L}\p{N}_]*=/u.test(word);
export function buildPatch(document: GameDocument, before: LaunchDraft, after: LaunchDraft): Record<string, unknown> {
  const keys = new Set<string>();
  for (const { key, value } of after.env) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`Invalid environment variable: ${key || "(empty)"}`);
    if (keys.has(key)) throw new Error(`Duplicate environment variable: ${key}`);
    if (value.includes("\0")) throw new Error("NUL characters are not supported.");
    keys.add(key);
  }
  const wrappers = after.wrappers.map((raw) => {
    const [exe, ...args] = splitWords(raw);
    if (!exe) throw new Error("Each wrapper needs an executable.");
    return { exe, args: joinWords(args) };
  });
  const changed = (key: keyof LaunchDraft) => JSON.stringify(before[key]) !== JSON.stringify(after[key]);
  const patch: Record<string, unknown> = {};
  if (document.game.launcher === "heroic") {
    if (changed("env")) patch.enviromentOptions = after.env;
    if (changed("wrappers")) patch.wrapperOptions = wrappers;
    if (changed("parameters")) patch.launcherArgs = joinWords(after.parameters);
  } else {
    if ([...after.wrappers.flatMap(splitWords), ...after.parameters].some(isAssignment)) throw new Error("Faugus would treat an assignment-shaped argument as an environment variable. Move it to Environment instead.");
    if (after.env.some((e) => /[$~]/.test(e.value)) || /[$~]/.test(after.wrappers.join(" ") + after.parameters.join(" "))) {
      throw new Error("Faugus expands $ and ~ before parsing; literal values containing them cannot be saved safely.");
    }
    if (changed("env") || changed("wrappers")) patch.launch_arguments = [
      ...after.env.map(({ key, value }) => `${key}=${quoteWord(value)}`),
      ...wrappers.map(({ exe, args }) => quoteWord(exe) + (args ? " " + args : "")),
    ].join(" ");
    if (changed("parameters")) patch.game_arguments = joinWords(after.parameters);
  }
  return patch;
}
