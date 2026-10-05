import { ENVIRONMENT_PRESET_GROUPS } from "./catalog";
import type { EnvironmentVariable } from "../launch-options/model";

export type EnvironmentGroup =
  | "Custom"
  | (typeof ENVIRONMENT_PRESET_GROUPS)[number]["label"];

export type DraftEnvironmentVariable = EnvironmentVariable & {
  group: EnvironmentGroup;
  id: string;
};

export const OPTISCALER_ENABLE_KEY = "PROTON_USE_OPTISCALER";
export const OPTISCALER_NAME_KEY = "PROTON_OPTISCALER_NAME";

export const QUICK_ENVIRONMENT_VARIABLES = [
  {
    description: "Enable the native Wine Wayland driver.",
    group: "Proton",
    key: "PROTON_ENABLE_WAYLAND",
    label: "Enable Wayland Support",
    value: "1",
  },
  {
    description: "Expose HDR support through DXVK.",
    group: "DXVK",
    key: "DXVK_HDR",
    label: "Enable HDR Supprot",
    value: "1",
  },
  {
    description: "Enable Discord Rich Presence through rpc-bridge.",
    group: "Proton",
    key: "PROTON_DISCORD_BRIDGE",
    label: "Discord Bridge",
    value: "1",
  },
] as const satisfies readonly {
  description: string;
  group: EnvironmentGroup;
  key: string;
  label: string;
  value: string;
}[];

type DropPosition = "after" | "before";

export function isHiddenEnvironmentKey(key: string) {
  return key === OPTISCALER_ENABLE_KEY || key === OPTISCALER_NAME_KEY;
}

export function groupForKey(key: string): EnvironmentGroup {
  return (
    ENVIRONMENT_PRESET_GROUPS.find(({ presets }) =>
      presets.some((preset) => preset.key === key),
    )?.label ?? "Custom"
  );
}

export function getEnvironmentValue(rows: DraftEnvironmentVariable[], key: string) {
  return rows.find((row) => row.key === key)?.value;
}

export function reorderVisibleEnvironmentRows(
  rows: DraftEnvironmentVariable[],
  sourceId: string,
  targetId: string,
  position: DropPosition,
  includeHidden = false,
) {
  const visible = rows.filter(({ key }) => includeHidden || !isHiddenEnvironmentKey(key));
  const original = [...visible];
  const from = visible.findIndex(({ id }) => id === sourceId);
  const target = visible.findIndex(({ id }) => id === targetId);
  if (from < 0 || target < 0 || from === target) return rows;

  let insertion = target + (position === "after" ? 1 : 0);
  const [moved] = visible.splice(from, 1);
  if (from < insertion) insertion--;
  visible.splice(insertion, 0, moved!);
  if (visible.every((row, index) => row === original[index])) return rows;

  let nextVisible = 0;
  return rows.map((row) =>
    !includeHidden && isHiddenEnvironmentKey(row.key) ? row : visible[nextVisible++]!,
  );
}
