import {
  type ParsedWrapperRow,
  parseWrapperRow,
} from "../launch-options/model";

export const QUICK_WRAPPERS = [
  {
    description: "Launches the game with the MangoHud performance overlay.",
    label: "MangoHud",
    value: "mangohud",
  },
  {
    description: "Runs the game through Feral GameMode.",
    label: "GameMode",
    value: "gamemoderun",
  },
  {
    description: "Enables NGX DLL updates and forces the latest DLSS presets before launching the game.",
    label: "DLSS Swapper",
    value: "dlss-swapper",
  },
  {
    description: "Runs the game through the CachyOS performance power-profile helper.",
    label: "game-performance",
    value: "game-performance",
  },
  {
    description: "Runs the game with Mesa's Zink OpenGL-on-Vulkan driver.",
    label: "zink-run",
    value: "zink-run",
  },
] as const;

export type QuickWrapper = (typeof QUICK_WRAPPERS)[number]["value"];

interface WrapperRow {
  originalValue?: string;
  value: string;
}

function wrapperRowTokens({ originalValue, value }: WrapperRow): ParsedWrapperRow {
  return originalValue === value
    ? { error: null, tokens: [value] }
    : parseWrapperRow(value);
}

export function parseWrapperRows(rows: readonly WrapperRow[]): ParsedWrapperRow {
  const tokens: string[] = [];
  for (const row of rows) {
    const parsed = wrapperRowTokens(row);
    if (parsed.error) return { error: parsed.error, tokens: [] };
    tokens.push(...parsed.tokens);
  }
  return { error: null, tokens };
}

export function hasQuickWrapper(rows: readonly WrapperRow[], wrapper: QuickWrapper) {
  return rows.some((row) => wrapperRowTokens(row).tokens.includes(wrapper));
}
