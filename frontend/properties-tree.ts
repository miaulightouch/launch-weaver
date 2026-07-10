export interface LaunchOptionsDetails {
  strLaunchOptions: string;
  unAppID: number;
}

function isLaunchOptionsComponent(fiber: any) {
  for (const candidate of [fiber?.type, fiber?.elementType]) {
    if (typeof candidate !== "function") continue;
    try {
      const source = candidate.toString();
      if (source.includes("SetAppLaunchOptions") && source.includes("strLaunchOptions")) return true;
    } catch {
      // Ignore opaque React component types and keep walking up the fiber tree.
    }
  }
  return false;
}

export function findLaunchOptionsDetails(fiber: any): LaunchOptionsDetails | null {
  const seen = new Set<any>();
  let current = fiber;
  let insideLaunchOptions = false;

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    insideLaunchOptions ||= isLaunchOptionsComponent(current);
    if (insideLaunchOptions) {
      for (const props of [current.memoizedProps, current.pendingProps]) {
        const details = props?.details;
        if (
          details &&
          Number.isInteger(details.unAppID) &&
          details.unAppID > 0 &&
          typeof details.strLaunchOptions === "string"
        ) {
          return details;
        }
      }
    }
    current = current.return;
  }

  return null;
}
