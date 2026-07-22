import { expect, test } from "bun:test";
import { availableUpdate } from "../frontend/features/update/model";

test("accepts only newer stable LaunchWeaver releases", () => {
  expect(availableUpdate("v1.0.4")).toEqual({
    url: "https://github.com/miaulightouch/launch-weaver/releases/tag/v1.0.4",
    version: "1.0.4",
  });
  expect(availableUpdate("v1.0.3")).toBeNull();
  expect(availableUpdate("v0.9.9")).toBeNull();
  expect(availableUpdate("v1.0.4-beta.1")).toBeNull();
});
