import { expect, test } from "bun:test";
import {
  getLaunchOptionsFieldRoot,
  getPropertiesLaunchOptions,
  getPropertiesTarget,
  isLaunchOptionsInput,
  LAUNCH_OPTIONS_INPUT_SELECTOR,
} from "../frontend/app/propertiesHelpers";

function root(...ids: string[]) {
  return {
    querySelectorAll: () => ids.map((id) => ({ id })),
  } as unknown as ParentNode;
}

test("recognizes a non-Steam shortcut Properties route", () => {
  expect(getPropertiesTarget(root(":r1:/app/3140162232/properties/shortcut"))).toEqual({
    appId: 3140162232,
    shortcut: true,
  });
  expect(getPropertiesTarget(root(":r1:/app/1973530/properties/general"))).toEqual({
    appId: 1973530,
    shortcut: false,
  });
  expect(getPropertiesTarget(root("/app/0/properties/general"))).toBeNull();
  expect(getPropertiesTarget(root("/app/42/community"))).toBeNull();
});

test("maps Steam and shortcut launch options to their own details fields", () => {
  const details = {
    strLaunchOptions: "STEAM=1 %command%",
    strShortcutLaunchOptions: "SHORTCUT=1 %command%",
  };

  expect(getPropertiesLaunchOptions(details, false)).toBe("STEAM=1 %command%");
  expect(getPropertiesLaunchOptions(details, true)).toBe("SHORTCUT=1 %command%");
});

test("selects a shortcut input without aria-describedby", async () => {
  let matches = 0;
  await new HTMLRewriter()
    .on(LAUNCH_OPTIONS_INPUT_SELECTOR, {
      element: () => {
        matches += 1;
      },
    })
    .transform(
      new Response('<input spellcheck="false" aria-labelledby="launch-options-title">'),
    )
    .text();

  expect(matches).toBe(1);
});

function shortcutInput(value: string, title: string) {
  const label = { textContent: title };
  return {
    value,
    hasAttribute: () => false,
    getAttribute: (attribute: string) =>
      attribute === "aria-labelledby" ? "field-title" : null,
    ownerDocument: {
      getElementById: (id: string) => (id === "field-title" ? label : null),
    },
  } as unknown as HTMLInputElement;
}

test("uses the localized label to distinguish shortcut launch options", () => {
  expect(isLaunchOptionsInput(shortcutInput("", "Launch Options"), "", "Launch Options"))
    .toBeTrue();
  expect(isLaunchOptionsInput(shortcutInput("", "Start in"), "", "Launch Options"))
    .toBeFalse();
});

test("finds the titled field root when a shortcut has no description", () => {
  const label = {};
  const field = { parentElement: null, contains: (node: object) => node === label };
  const row = { parentElement: field, contains: () => false };
  const input = {
    getAttribute: (attribute: string) =>
      attribute === "aria-labelledby" ? "field-title" : null,
    ownerDocument: { getElementById: () => label },
    parentElement: row,
  } as unknown as HTMLInputElement;

  expect(getLaunchOptionsFieldRoot(input)).toBe(field as unknown as HTMLElement);
});
