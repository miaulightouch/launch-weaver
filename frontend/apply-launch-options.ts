export interface LaunchOptionsIO {
  readCurrent(): Promise<string | null>;
  waitFor(expected: string): Promise<string | null>;
  write(value: string): void;
}

export type ApplyLaunchOptionsResult =
  | { status: "unchanged" }
  | { status: "applied" }
  | { status: "unavailable" }
  | { status: "stale"; current: string }
  | { status: "failed" }
  | { status: "unconfirmed"; observed: string | null };

export async function applyLaunchOptionsChange({
  after,
  before,
  io,
}: {
  after: string;
  before: string;
  io: LaunchOptionsIO;
}): Promise<ApplyLaunchOptionsResult> {
  if (after === before) return { status: "unchanged" };

  let current: string | null;
  try {
    current = await io.readCurrent();
  } catch {
    return { status: "unavailable" };
  }

  if (current === null) return { status: "unavailable" };
  if (current !== before) return { current, status: "stale" };

  try {
    io.write(after);
  } catch {
    return { status: "failed" };
  }

  let observed: string | null = null;
  try {
    observed = await io.waitFor(after);
  } catch {
    // A failed readback is reported without making a second write.
  }

  if (observed === after) return { status: "applied" };
  return { observed, status: "unconfirmed" };
}
