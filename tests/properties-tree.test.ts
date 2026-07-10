import { expect, test } from "bun:test";
import { findLaunchOptionsDetails } from "../frontend/properties-tree";

const launchOptionsComponent = new Function("/* SetAppLaunchOptions strLaunchOptions */");

test("launch option details are recovered from the input's React fiber", () => {
  const details = { strLaunchOptions: "A=1 %command%", unAppID: 42 };
  const fiber = { return: { memoizedProps: { details }, type: launchOptionsComponent } };

  expect(findLaunchOptionsDetails(fiber)).toBe(details);
  expect(findLaunchOptionsDetails({ memoizedProps: { details } })).toBeNull();
  expect(findLaunchOptionsDetails({ memoizedProps: { details: { unAppID: "42" } } })).toBeNull();
});

test("launch option details support pending props and cyclic fibers", () => {
  const details = { strLaunchOptions: "B=2 %command%", unAppID: 7 };
  const fiber: any = { elementType: launchOptionsComponent, pendingProps: { details } };
  fiber.return = fiber;

  expect(findLaunchOptionsDetails(fiber)).toBe(details);
  expect(findLaunchOptionsDetails({ return: fiber, pendingProps: {} })).toBe(details);
});
