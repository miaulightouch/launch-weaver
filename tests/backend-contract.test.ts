import { describe, expect, mock, test } from "bun:test";

mock.module("@steambrew/client", () => ({ callable: () => {} }));
const { decodeBackendJson } = await import("../frontend/features/optiscaler/backend");

describe("Millennium backend response contract", () => {
  test("decodes JSON returned inside a callable string", () => {
    const payload = '{"ok":true,"value":7}';

    expect(decodeBackendJson(JSON.stringify(payload))).toEqual({
      ok: true,
      value: 7,
    });
    expect(decodeBackendJson(payload)).toEqual({
      ok: true,
      value: 7,
    });
  });
});
