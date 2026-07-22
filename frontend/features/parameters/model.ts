export const QUICK_PARAMETERS = [
  {
    description: "Fix CEF rendering under Wayland.",
    label: "Fix CEF in Wayland",
    value: "--in-progress-gpu",
  },
] as const;

export type QuickParameter = (typeof QUICK_PARAMETERS)[number]["value"];

export function hasQuickParameter(
  rows: readonly { value: string }[],
  parameter: QuickParameter,
) {
  return rows.some(({ value }) => value === parameter);
}
