import { describe, expect, test } from "bun:test";
import { buildPatch, joinWords, readDraft, splitWords, type GameDocument } from "../desktop/src/model";
const heroic = (settings: Record<string, unknown>, defaults = {}): GameDocument => ({ game: { id: "one", name: "Game", launcher: "heroic", source: "/fixture" }, snapshot: "baseline", settings, defaults });
const faugus = (settings: Record<string, unknown>): GameDocument => ({ ...heroic(settings), game: { ...heroic({}).game, launcher: "faugus" } });
describe("standalone launcher adapters", () => {
  test("round-trips token boundaries including empty arguments, quotes and literal shell syntax", () => {
    const words = ["", "a b", "don't", 'say "hello"', "C:\\games\\one", "$HOME", "%command%", "a=b", "line\nbreak"];
    expect(splitWords(joinWords(words))).toEqual(words);
    expect(() => splitWords("'unclosed")).toThrow();
    expect(() => splitWords("escape\\")).toThrow();
  });
  test("does not interpret Steam placeholders", () => {
    expect(readDraft(heroic({ launcherArgs: "%command% -dx12" })).parameters).toEqual(["%command%", "-dx12"]);
  });
  test("Heroic writes only changed fields and leaves inherited settings inherited", () => {
    const doc = heroic({ launcherArgs: '  "original spacing"  ', winePrefix: "/keep" }, { enviromentOptions: [{ key: "DXVK_HDR", value: "1" }], wrapperOptions: [{ exe: "/with space/wrapper", args: '--value "two words"' }] });
    const draft = readDraft(doc);
    expect(buildPatch(doc, draft, draft)).toEqual({});
    expect(buildPatch(doc, draft, { ...draft, parameters: ["-dx12", ""] })).toEqual({ launcherArgs: "-dx12 ''" });
    expect(draft.env).toEqual([{ key: "DXVK_HDR", value: "1" }]);
    expect(splitWords(draft.wrappers[0]!)).toEqual(["/with space/wrapper", "--value", "two words"]);
  });
  test("Faugus maps its launch prefix independently from game arguments", () => {
    const doc = faugus({ launch_arguments: "DXVK_HDR=1\nCUSTOM='a b' gamescope -f --", game_arguments: "'-name with spaces' ''", runner: "Proton-GE" });
    const draft = readDraft(doc);
    expect(draft.env).toEqual([{ key: "DXVK_HDR", value: "1" }, { key: "CUSTOM", value: "a b" }]);
    expect(draft.wrappers).toEqual(["gamescope -f --"]);
    expect(draft.parameters).toEqual(["-name with spaces", ""]);
    expect(buildPatch(doc, draft, draft)).toEqual({});
    const patch = buildPatch(doc, draft, { ...draft, env: [{ key: "CUSTOM", value: "new value" }] });
    expect(patch).toEqual({ launch_arguments: "CUSTOM='new value' gamescope -f --" });
  });
  test("Faugus rejects expansions and argument assignments it would extract as environment", () => {
    expect(() => readDraft(faugus({ launch_arguments: "CUSTOM='$HOME'" }))).toThrow();
    expect(() => readDraft(faugus({ game_arguments: "FOO=bar" }))).toThrow();
    const doc = faugus({}), draft = readDraft(doc);
    expect(() => buildPatch(doc, draft, { ...draft, parameters: ["$HOME"] })).toThrow();
    expect(() => buildPatch(doc, draft, { ...draft, parameters: ["NAME=value"] })).toThrow();
  });
  test("rejects invalid schemas and duplicate environment entries", () => {
    expect(() => readDraft(heroic({ enviromentOptions: "wrong" }))).toThrow();
    expect(() => readDraft(heroic({ wrapperOptions: [{ exe: "wrapper", args: "", future: true }] }))).toThrow();
    const doc = heroic({}), draft = readDraft(doc);
    expect(() => buildPatch(doc, draft, { ...draft, env: [{ key: "A", value: "1" }, { key: "A", value: "2" }] })).toThrow();
  });
});
