export interface NativeLaunchOptionsBridge {
  read(): string | null;
  write(value: string): void;
}

export interface LaunchOptionsIO {
  readCurrent(): Promise<string | null>;
  waitFor(expected: string): Promise<string | null>;
  write(value: string): void;
}

export type LaunchOptionsApplyResult =
  | "applied"
  | "failed"
  | "stale"
  | "unchanged"
  | "unavailable"
  | "unconfirmed";

export async function applyLaunchOptionsChange({
  after,
  before,
  io,
}: {
  after: string;
  before: string;
  io: LaunchOptionsIO;
}): Promise<LaunchOptionsApplyResult> {
  let current: string | null;
  try {
    current = await io.readCurrent();
  } catch {
    return "unavailable";
  }

  if (current === null) return "unavailable";
  if (current === after) return after === before ? "unchanged" : "applied";
  if (current !== before) return "stale";

  try {
    io.write(after);
  } catch {
    return "failed";
  }

  let observed: string | null = null;
  try {
    observed = await io.waitFor(after);
  } catch {
    // A failed readback is reported without making a second write.
  }

  if (observed === after) return "applied";
  return "unconfirmed";
}
