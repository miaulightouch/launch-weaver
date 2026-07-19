import { expect, test } from "bun:test";
import {
  reorderTokenRows,
  type DraftToken,
} from "../frontend/components/OrderedTokenEditor";

const rows: DraftToken[] = [
  { id: "A", value: "a" },
  { id: "B", value: "b" },
  { id: "C", value: "c" },
];

test("ordered token rows support drag-style reordering", () => {
  expect(reorderTokenRows(rows, "A", "C", "after").map(({ id }) => id)).toEqual([
    "B",
    "C",
    "A",
  ]);
  expect(reorderTokenRows(rows, "C", "A", "before").map(({ id }) => id)).toEqual([
    "C",
    "A",
    "B",
  ]);
  expect(reorderTokenRows(rows, "B", "A", "after")).toBe(rows);
  expect(reorderTokenRows(rows, "missing", "A", "before")).toBe(rows);
  expect(reorderTokenRows(rows, "A", "A", "after")).toBe(rows);
});
