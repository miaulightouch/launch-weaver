import { describe, expect, test } from "bun:test";
import {
  getEnvironmentError,
  parseLaunchOptions,
  serializeLaunchOptions,
} from "../frontend/launch-options";

describe("parseLaunchOptions", () => {
  test("parses only the leading environment assignments", () => {
    const parsed = parseLaunchOptions('A=1 B="hello world" %command% -x=y');

    expect(parsed.env.map(({ key, value }) => ({ key, value }))).toEqual([
      { key: "A", value: "1" },
      { key: "B", value: "hello world" },
    ]);
    expect(parsed.tail).toBe(" %command% -x=y");
  });

  test("stops at the first non-environment token", () => {
    const parsed = parseLaunchOptions("A=1 gamemoderun B=2 %command%");

    expect(parsed.env).toHaveLength(1);
    expect(parsed.tail).toBe(" gamemoderun B=2 %command%");
  });

  test("keeps complex or malformed values opaque", () => {
    for (const raw of ["A=$HOME %command%", 'A="unterminated %command%', "bash -c 'echo hi'"]) {
      const parsed = parseLaunchOptions(raw);
      expect(parsed.env).toHaveLength(0);
      expect(parsed.tail).toBe(raw);
    }
  });

  test("supports empty, escaped, quoted, and equals-containing values", () => {
    const parsed = parseLaunchOptions("EMPTY= ESCAPED=hello\\ world QUOTED='a=b c' %command%");

    expect(parsed.env.map(({ value }) => value)).toEqual(["", "hello world", "a=b c"]);
    expect(parsed.tail).toBe(" %command%");
  });

  test("treats non-ASCII whitespace as part of an unquoted value", () => {
    const parsed = parseLaunchOptions("A=foo\u00a0bar %command%");

    expect(parsed.env[0]?.value).toBe("foo\u00a0bar");
    expect(parsed.tail).toBe(" %command%");
  });

  test("keeps active tilde expansion and control characters opaque", () => {
    for (const raw of ["A=~ %command%", "A=one\ntwo %command%", "A=one\0two %command%"]) {
      const parsed = parseLaunchOptions(raw);
      expect(parsed.env).toHaveLength(0);
      expect(parsed.tail).toBe(raw);
    }

    expect(parseLaunchOptions("A='~' %command%").env[0]?.value).toBe("~");
  });
});

describe("serializeLaunchOptions", () => {
  test("round-trips untouched input exactly", () => {
    const raw = 'A=1\tB="hello world"   %command% --flag';
    const parsed = parseLaunchOptions(raw);

    expect(serializeLaunchOptions(parsed, parsed.env)).toBe(raw);
  });

  test("preserves the opaque tail byte-for-byte while editing", () => {
    const parsed = parseLaunchOptions("A=1   bash -c 'echo  x'  %command%");
    const edited = parsed.env.map((entry) => ({ ...entry, value: "two words" }));

    expect(serializeLaunchOptions(parsed, edited)).toBe("A='two words'   bash -c 'echo  x'  %command%");
  });

  test("adds a separator before an entirely opaque original value", () => {
    const parsed = parseLaunchOptions("%command% --flag");

    expect(serializeLaunchOptions(parsed, [{ key: "A", value: "1" }])).toBe("A=1 %command% --flag");
  });

  test("keeps the game command when adding the first variable to empty options", () => {
    expect(serializeLaunchOptions(parseLaunchOptions(""), [{ key: "A", value: "1" }])).toBe(
      "A=1 %command%",
    );
    expect(serializeLaunchOptions(parseLaunchOptions("\t "), [{ key: "A", value: "1" }])).toBe(
      "A=1 %command%\t ",
    );
  });

  test("keeps the original tail when every parsed variable is removed", () => {
    const parsed = parseLaunchOptions("A=1   %command%");

    expect(serializeLaunchOptions(parsed, [])).toBe("   %command%");
  });

  test("quotes apostrophes safely", () => {
    const parsed = parseLaunchOptions("%command%");

    expect(serializeLaunchOptions(parsed, [{ key: "NAME", value: "it's ready" }])).toBe(
      "NAME='it'\\''s ready' %command%",
    );
  });

  test("quotes shell control syntax as literal environment values", () => {
    const parsed = parseLaunchOptions("%command%");

    for (const value of ["$(echo injected)", "`echo injected`", "one; two", "one & two"]) {
      expect(serializeLaunchOptions(parsed, [{ key: "VALUE", value }])).toBe(
        `VALUE='${value}' %command%`,
      );
    }
  });
});

describe("getEnvironmentError", () => {
  test("rejects invalid and duplicate keys", () => {
    expect(getEnvironmentError([{ key: "bad-key", value: "1" }])).toContain("bad-key");
    expect(
      getEnvironmentError([
        { key: "A", value: "1" },
        { key: "A", value: "2" },
      ]),
    ).toContain("A");
  });

  test("rejects control characters in values", () => {
    for (const value of ["line one\nline two", "carriage\rreturn", "nul\0byte"]) {
      expect(getEnvironmentError([{ key: "A", value }])).toContain("control");
    }
  });

  test("accepts valid unique keys", () => {
    expect(
      getEnvironmentError([
        { key: "A", value: "1" },
        { key: "_B2", value: "" },
      ]),
    ).toBeNull();
  });
});
