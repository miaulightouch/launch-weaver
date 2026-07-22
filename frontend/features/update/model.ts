import plugin from "../../../plugin.json";

export interface AvailableUpdate {
  url: string;
  version: string;
}

const RELEASE_API =
  "https://api.github.com/repos/miaulightouch/launch-weaver/releases/latest";
let updateCheck: Promise<AvailableUpdate | null> | undefined;

export function availableUpdate(tag: unknown): AvailableUpdate | null {
  const match = typeof tag === "string" && tag.match(/^v(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;

  const latest = match.slice(1).map(Number);
  const current = plugin.version.split(".").map(Number);
  const difference = latest.findIndex((part, index) => part !== current[index]);
  const newer = difference >= 0 && latest[difference]! > current[difference]!;
  return newer
    ? {
        url: `https://github.com/miaulightouch/launch-weaver/releases/tag/${tag}`,
        version: latest.join("."),
      }
    : null;
}

async function fetchLatestRelease() {
  const response = await fetch(RELEASE_API, {
    headers: { Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return null;
  const release = await response.json() as { tag_name?: unknown };
  return availableUpdate(release.tag_name);
}

export function checkForUpdate() {
  return updateCheck ??= fetchLatestRelease();
}
