export interface OptiscalerConfigRow {
  description?: string;
  section: string;
  option: string;
  value: string;
}

export interface OptiscalerSnapshot {
  digest: string;
  exists: boolean;
  size: number;
  version: string;
}

export interface OptiscalerDocument {
  path: string;
  rows: OptiscalerConfigRow[];
  snapshot: OptiscalerSnapshot;
}

export type OptiscalerChange =
  | (OptiscalerConfigRow & { action: "set" })
  | { action: "remove"; option: string; section: string };

export const OPTISCALER_NAME_SUGGESTIONS = [
  "dxgi.dll",
  "winmm.dll",
  "d3d12.dll",
  "dbghelp.dll",
  "version.dll",
  "wininet.dll",
  "winhttp.dll",
  "OptiScaler.asi",
] as const;

export const CACHY_OPTISCALER_NAME_SUGGESTIONS = [
  "dxgi.dll",
  "d3d12.dll",
  "dbghelp.dll",
] as const;

export const OPTISCALER_CONFIG_KEY = "PROTON_OPTISCALER_CONFIG";

export function hasWrappedOptiscalerConfig(values: readonly string[]) {
  return values.some((value) => value.startsWith(OPTISCALER_CONFIG_KEY + "="));
}

const CONTROL_CHARACTERS = /[\0\r\n]/;

export function optiscalerRowKey({
  option,
  section,
}: Pick<OptiscalerConfigRow, "option" | "section">) {
  return `${section}\0${option.toLowerCase()}`;
}

export function getOptiscalerConfigError(rows: OptiscalerConfigRow[]) {
  const seen = new Set<string>();

  for (const { section, option, value } of rows) {
    if (!section || !option) return "OptiScaler sections and options cannot be empty.";
    if ([section, option, value].some((part) => CONTROL_CHARACTERS.test(part))) {
      return "OptiScaler config cannot contain NUL, CR, or LF.";
    }
    if (/^[\t ]|[\t ]$|[\t ][;#]/.test(value) || /^[;#]/.test(value)) {
      return "OptiScaler values cannot use whitespace or comment markers in positions the INI format would reinterpret.";
    }

    const key = optiscalerRowKey({ option, section });
    if (seen.has(key)) return `Duplicate OptiScaler option: ${section}.${option}`;
    seen.add(key);
  }

  return null;
}

export function getOptiscalerChanges(
  baseRows: OptiscalerConfigRow[],
  nextRows: OptiscalerConfigRow[],
): OptiscalerChange[] {
  const base = new Map(baseRows.map((row) => [optiscalerRowKey(row), row]));
  const next = new Map(nextRows.map((row) => [optiscalerRowKey(row), row]));
  const changes: OptiscalerChange[] = [];

  for (const row of baseRows) {
    if (!next.has(optiscalerRowKey(row))) {
      changes.push({ action: "remove", option: row.option, section: row.section });
    }
  }
  for (const row of nextRows) {
    const previous = base.get(optiscalerRowKey(row));
    if (!previous || previous.value !== row.value) {
      changes.push({ action: "set", option: row.option, section: row.section, value: row.value });
    }
  }

  return changes;
}

export function customizedOptiscalerRows(rows: OptiscalerConfigRow[]) {
  return rows.filter(({ value }) => value.toLowerCase() !== "auto");
}

export function isProcessFilterField(row: OptiscalerConfigRow) {
  return row.section === "ProcessFilter" && ["targetprocessname", "processexclusionlist"].includes(row.option.toLowerCase());
}

/** Discover suggestions from the installed version's comments, not a fixed schema. */
export function optiscalerValueSuggestions(row: OptiscalerConfigRow): string[] {
  const suggestions = new Set(["auto"]);
  if (!isProcessFilterField(row)) {
    for (const line of (row.description ?? "").split("\n")) {
      const values = line.replace(/\([^)]*\)/g, "").split(/\s+-\s+Default/i)[0]!.trim();
      const parts = values.split(",").map(value => value.trim());
      if (parts.length > 1 && parts.every(value => /^[\w.+-]+$/.test(value))) {
        parts.forEach(value => suggestions.add(value));
      }
    }
    if (suggestions.size === 1 && /\btrue or false\b/i.test(row.description ?? "")) {
      suggestions.add("true"); suggestions.add("false");
    }
  }
  if (row.value && row.value.toLowerCase() !== "auto") suggestions.add(row.value);
  return [...suggestions];
}
