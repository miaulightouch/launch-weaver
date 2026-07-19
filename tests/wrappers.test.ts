import { expect, test } from "bun:test";
import {
  parseLaunchOptions,
  serializeLaunchOptions,
} from "../frontend/features/launch-options/model";
import {
  hasQuickWrapper,
  parseWrapperRows,
} from "../frontend/features/wrappers/model";

test("wrapper rows safely expand commands while retaining quick-add identity", () => {
  const rows = [{ value: "mangohud -h --config='a b'" }];
  const parsed = parseWrapperRows(rows);

  expect(parsed).toEqual({
    error: null,
    tokens: ["mangohud", "-h", "--config=a b"],
  });
  expect(
    serializeLaunchOptions(parseLaunchOptions(""), {
      env: [],
      parameters: [],
      wrappers: parsed.tokens,
    }),
  ).toBe("mangohud -h '--config=a b' %command%");
  expect(hasQuickWrapper(rows, "mangohud")).toBe(true);
  expect(hasQuickWrapper([{ value: "mangohud-x" }], "mangohud")).toBe(false);
  expect(parseWrapperRows([{ originalValue: "wrapper name", value: "wrapper name" }])).toEqual({
    error: null,
    tokens: ["wrapper name"],
  });
  expect(parseWrapperRows([{ value: "mangohud; rm" }]).error).toContain("shell syntax");
  expect(parseWrapperRows([{ value: "mangohud $(touch /tmp/x)" }]).error).toContain(
    "shell syntax",
  );
});
