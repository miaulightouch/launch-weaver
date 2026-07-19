import { describe, expect, test } from "bun:test";
import {
  getEnvironmentError,
  getLaunchOptionsError,
  parseLaunchOptions,
  serializeLaunchOptions,
  type StructuredLaunchOptions,
} from "../frontend/features/launch-options/model";

function edit(
  raw: string,
  change: Partial<StructuredLaunchOptions>,
): [ReturnType<typeof parseLaunchOptions>, StructuredLaunchOptions] {
  const parsed = parseLaunchOptions(raw);
  return [
    parsed,
    {
      env: change.env ?? parsed.env,
      wrappers: change.wrappers ?? parsed.wrappers,
      parameters: change.parameters ?? parsed.parameters,
    },
  ];
}

describe("parseLaunchOptions", () => {
  test("parses environment variables, wrapper tokens, the command, and parameters", () => {
    const parsed = parseLaunchOptions(
      `A=1 B="hello world" gamemoderun gamescope -f -- %command% --name='Ada Lovelace' ''`,
    );

    expect(parsed.error).toBeNull();
    expect(parsed.explicitCommand).toBe(true);
    expect(parsed.env).toEqual([
      { key: "A", value: "1" },
      { key: "B", value: "hello world" },
    ]);
    expect(parsed.wrappers).toEqual(["gamemoderun", "gamescope", "-f", "--"]);
    expect(parsed.parameters).toEqual(["--name=Ada Lovelace", ""]);
  });

  test("treats assignments after the first wrapper as prefix arguments", () => {
    const parsed = parseLaunchOptions("A=1 env B=2 gamemoderun %command%");

    expect(parsed.env).toEqual([{ key: "A", value: "1" }]);
    expect(parsed.wrappers).toEqual(["env", "B=2", "gamemoderun"]);
  });

  test("parses launch options without a placeholder as native appended parameters", () => {
    const parsed = parseLaunchOptions("-novid --name='Ada Lovelace'");

    expect(parsed.error).toBeNull();
    expect(parsed.explicitCommand).toBe(false);
    expect(parsed.env).toEqual([]);
    expect(parsed.wrappers).toEqual([]);
    expect(parsed.parameters).toEqual(["-novid", "--name=Ada Lovelace"]);
  });

  test("supports empty, escaped, quoted, and equals-containing values", () => {
    const parsed = parseLaunchOptions("EMPTY= ESCAPED=hello\\ world QUOTED='a=b c' %command%");

    expect(parsed.env.map(({ value }) => value)).toEqual(["", "hello world", "a=b c"]);
  });

  test("rejects ambiguous placeholders", () => {
    for (const raw of [
      "%command% %command%",
      "'%command%'",
      "\\%command\\%",
      "prefix%command%",
      "A='%command%' %command%",
    ]) {
      expect(parseLaunchOptions(raw).error).toContain("standalone");
    }
  });

  test("rejects active or malformed shell syntax", () => {
    for (const raw of [
      "A=$HOME %command%",
      "A=$(whoami) %command%",
      "foo | %command%",
      "%command% > log",
      "%command% *.ini",
      "%command% {one,two}",
      "%command% # comment",
      'A="unterminated %command%',
      "%command% trailing\\",
    ]) {
      expect(parseLaunchOptions(raw).error).toContain("shell syntax");
    }
  });

  test("rejects NUL, CR, and LF", () => {
    for (const raw of ["one\ntwo", "one\rtwo", "one\0two"]) {
      expect(parseLaunchOptions(raw).error).toContain("NUL");
    }
  });

  test("keeps quoted shell metacharacters as literal values", () => {
    const parsed = parseLaunchOptions("A='~$HOME' 'wrapper;name' %command% 'one & two'");

    expect(parsed.error).toBeNull();
    expect(parsed.env[0]?.value).toBe("~$HOME");
    expect(parsed.wrappers).toEqual(["wrapper;name"]);
    expect(parsed.parameters).toEqual(["one & two"]);
  });
});

describe("serializeLaunchOptions", () => {
  test("round-trips untouched input exactly", () => {
    for (const raw of [
      'A=1\tB="hello world"   gamemoderun %command% --flag  ',
      "-novid\t--high  ",
      "\t ",
    ]) {
      const parsed = parseLaunchOptions(raw);
      expect(serializeLaunchOptions(parsed, parsed)).toBe(raw);
    }
  });

  test("canonicalizes edited structures without changing token boundaries", () => {
    const [parsed, next] = edit('A=1\tgamemoderun   %command% "old value"', {
      env: [{ key: "A", value: "two words" }],
      wrappers: ["gamescope", "-f", "--"],
      parameters: ["--name=Ada Lovelace", "it's ready", ""],
    });

    expect(serializeLaunchOptions(parsed, next)).toBe(
      "A='two words' gamescope -f -- %command% '--name=Ada Lovelace' 'it'\\''s ready' ''",
    );
  });

  test("keeps assignment-like and reserved wrappers out of shell grammar", () => {
    const [parsed, next] = edit("'A=1' 'A+=2' 'if' %command% --old", {
      parameters: ["--new"],
    });
    const serialized = serializeLaunchOptions(parsed, next);

    expect(serialized).toBe("'A=1' 'A+=2' 'if' %command% --new");
    expect(parseLaunchOptions(serialized)).toMatchObject(next);
  });

  test("re-parses canonical output to the same structured values", () => {
    const parsed = parseLaunchOptions("%command%");
    const next = {
      env: [{ key: "NAME", value: "Ada's game" }],
      wrappers: ["A=1", "if", "wrapper name"],
      parameters: ["one two", "$(literal)", ""],
    };
    const reparsed = parseLaunchOptions(serializeLaunchOptions(parsed, next));

    expect(reparsed.error).toBeNull();
    expect(reparsed).toMatchObject(next);
  });

  test("adds the command placeholder when environment variables or wrappers need it", () => {
    const empty = parseLaunchOptions("");

    expect(
      serializeLaunchOptions(empty, { env: [{ key: "A", value: "1" }], wrappers: [], parameters: [] }),
    ).toBe("A=1 %command%");
    expect(
      serializeLaunchOptions(empty, { env: [], wrappers: ["gamemoderun"], parameters: [] }),
    ).toBe("gamemoderun %command%");
  });

  test("keeps parameter-only options in Steam's native appended form", () => {
    const empty = parseLaunchOptions("");
    const explicit = parseLaunchOptions("%command%");
    const next = { env: [], wrappers: [], parameters: ["--name=Ada Lovelace"] };

    expect(serializeLaunchOptions(empty, next)).toBe("'--name=Ada Lovelace'");
    expect(serializeLaunchOptions(explicit, next)).toBe("%command% '--name=Ada Lovelace'");
  });

  test("converts between implicit and explicit command forms without losing parameters", () => {
    const implicit = parseLaunchOptions("-novid");
    expect(
      serializeLaunchOptions(implicit, {
        env: [{ key: "A", value: "1" }],
        wrappers: [],
        parameters: implicit.parameters,
      }),
    ).toBe("A=1 %command% -novid");

    const explicit = parseLaunchOptions("A=1 %command% -novid");
    expect(
      serializeLaunchOptions(explicit, {
        env: [],
        wrappers: [],
        parameters: explicit.parameters,
      }),
    ).toBe("%command% -novid");

    expect(parseLaunchOptions("A=1").parameters).toEqual(["A=1"]);
  });

  test("clears launch options when every structured entry is removed", () => {
    const parsed = parseLaunchOptions("A=1 gamemoderun %command% --flag");

    expect(
      serializeLaunchOptions(parsed, { env: [], wrappers: [], parameters: [] }),
    ).toBe("");
  });

  test("serializes wrapper and parameter order exactly as supplied", () => {
    const parsed = parseLaunchOptions("one two %command% first second");
    const next = {
      env: [],
      wrappers: ["two", "one"],
      parameters: ["second", "first"],
    };

    expect(serializeLaunchOptions(parsed, next)).toBe("two one %command% second first");
  });

  test("quotes shell control syntax entered as literal data", () => {
    const parsed = parseLaunchOptions("%command%");

    for (const value of ["$(echo injected)", "`echo injected`", "one; two", "one & two"]) {
      expect(
        serializeLaunchOptions(parsed, {
          env: [{ key: "VALUE", value }],
          wrappers: [],
          parameters: [],
        }),
      ).toBe(`VALUE='${value}' %command%`);
    }
  });

  test("fails closed for unsupported input or invalid edits", () => {
    const unsupported = parseLaunchOptions("$HOME %command%");
    expect(
      serializeLaunchOptions(unsupported, {
        env: [{ key: "A", value: "1" }],
        wrappers: [],
        parameters: [],
      }),
    ).toBe("$HOME %command%");

    const parsed = parseLaunchOptions("A=1 %command%");
    expect(
      serializeLaunchOptions(parsed, {
        env: [{ key: "bad-key", value: "1" }],
        wrappers: [],
        parameters: [],
      }),
    ).toBe("A=1 %command%");
  });
});

describe("validation", () => {
  test("rejects invalid and duplicate environment keys", () => {
    expect(getEnvironmentError([{ key: "bad-key", value: "1" }])).toContain("bad-key");
    expect(
      getEnvironmentError([
        { key: "A", value: "1" },
        { key: "A", value: "2" },
      ]),
    ).toContain("A");
  });

  test("rejects controls, empty wrappers, and reserved placeholders", () => {
    expect(
      getLaunchOptionsError({ env: [], wrappers: [""], parameters: [] }),
    ).toContain("empty");
    expect(
      getLaunchOptionsError({ env: [], wrappers: [], parameters: ["one\ntwo"] }),
    ).toContain("control");
    expect(
      getLaunchOptionsError({
        env: [{ key: "A", value: "%command%" }],
        wrappers: [],
        parameters: [],
      }),
    ).toContain("reserved");
  });

  test("accepts unique variables and an empty parameter", () => {
    expect(
      getLaunchOptionsError({
        env: [
          { key: "A", value: "1" },
          { key: "_B2", value: "" },
        ],
        wrappers: ["gamemoderun"],
        parameters: [""],
      }),
    ).toBeNull();
  });
});
