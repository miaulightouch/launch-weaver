import { expect, test } from "bun:test";
import {
  reorderVisibleEnvironmentRows,
  type DraftEnvironmentVariable,
} from "../frontend/features/environment/model";

const row = (id: string, key = id): DraftEnvironmentVariable => ({
  group: "Custom",
  id,
  key,
  value: "1",
});

test("environment drag reorder preserves hidden OptiScaler slots", () => {
  const hiddenEnable = row("hidden-enable", "PROTON_USE_OPTISCALER");
  const hiddenName = row("hidden-name", "PROTON_OPTISCALER_NAME");
  const original = [row("A"), hiddenEnable, row("B"), hiddenName, row("C")];

  const down = reorderVisibleEnvironmentRows(original, "A", "C", "after");
  expect(down.map(({ id }) => id)).toEqual([
    "B",
    "hidden-enable",
    "C",
    "hidden-name",
    "A",
  ]);
  expect(down[1]).toBe(hiddenEnable);
  expect(down[3]).toBe(hiddenName);

  const up = reorderVisibleEnvironmentRows(original, "C", "A", "before");
  expect(up.map(({ id }) => id)).toEqual([
    "C",
    "hidden-enable",
    "A",
    "hidden-name",
    "B",
  ]);
  expect(reorderVisibleEnvironmentRows(original, "missing", "A", "before")).toBe(
    original,
  );
  expect(reorderVisibleEnvironmentRows(original, "A", "A", "after")).toBe(original);
});
