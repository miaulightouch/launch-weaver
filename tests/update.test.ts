import { expect, test } from "bun:test";
import plugin from "../plugin.json";
import { availableUpdate } from "../frontend/features/update/model";

test("accepts only newer stable LaunchWeaver releases", () => {
  const [major, minor, patch] = plugin.version.split(".").map(Number);
  const next = `${major}.${minor}.${patch! + 1}`;
  expect(availableUpdate(`v${next}`)).toEqual({
    url: `https://github.com/miaulightouch/launch-weaver/releases/tag/v${next}`,
    version: next,
  });
  expect(availableUpdate(`v${plugin.version}`)).toBeNull();
  expect(availableUpdate("v0.9.9")).toBeNull();
  expect(availableUpdate(`v${next}-beta.1`)).toBeNull();
});
