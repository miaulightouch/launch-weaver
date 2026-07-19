import { callable as createBackendCallable } from "@steambrew/client";
import type {
  OptiscalerChange,
  OptiscalerConfigRow,
  OptiscalerDocument,
  OptiscalerSnapshot,
} from "./model";

export function decodeBackendJson<T>(raw: string) {
  const decoded = JSON.parse(raw) as unknown;
  return (typeof decoded === "string" ? JSON.parse(decoded) : decoded) as T;
}

function withBackendTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error("Backend request timed out.")), timeoutMs);
    }),
  ]);
}

const readOptiscaler = createBackendCallable<[{ request_json: string }], string>(
  "read_optiscaler",
);
const applyOptiscaler = createBackendCallable<[{ request_json: string }], string>(
  "apply_optiscaler",
);

function parseOptiscalerApplyResult(raw: string) {
  const parsed = decodeBackendJson<{
    backup?: unknown;
    error?: unknown;
    ok?: unknown;
  }>(raw);
  if (parsed.ok === true) return;
  const backup =
    typeof parsed.backup === "string" && parsed.backup
      ? " Backup: " + parsed.backup + "."
      : "";
  throw new Error(
    (typeof parsed.error === "string"
      ? parsed.error
      : "OptiScaler.ini update failed.") + backup,
  );
}

function parseOptiscalerDocument(raw: string): OptiscalerDocument {
  const parsed = decodeBackendJson<{
    error?: unknown;
    ok?: unknown;
    path?: unknown;
    rows?: unknown;
    snapshot?: unknown;
  }>(raw);
  if (parsed.ok !== true) {
    throw new Error(
      typeof parsed.error === "string" ? parsed.error : "OptiScaler.ini is unavailable.",
    );
  }
  const snapshot = parsed.snapshot as Partial<OptiscalerDocument["snapshot"]> | undefined;
  if (
    typeof parsed.path !== "string" ||
    !Array.isArray(parsed.rows) ||
    !parsed.rows.every(
      (row) =>
        typeof row === "object" &&
        row !== null &&
        typeof (row as OptiscalerConfigRow).section === "string" &&
        typeof (row as OptiscalerConfigRow).option === "string" &&
        typeof (row as OptiscalerConfigRow).value === "string",
    ) ||
    typeof snapshot?.digest !== "string" ||
    typeof snapshot.exists !== "boolean" ||
    typeof snapshot.size !== "number" ||
    typeof snapshot.version !== "string"
  ) {
    throw new Error("Invalid OptiScaler backend response.");
  }
  return {
    path: parsed.path,
    rows: parsed.rows as OptiscalerConfigRow[],
    snapshot: {
      digest: snapshot.digest,
      exists: snapshot.exists,
      size: snapshot.size,
      version: snapshot.version,
    },
  };
}

export async function readOptiscalerBackend(appId: number) {
  return parseOptiscalerDocument(
    await withBackendTimeout(
      readOptiscaler({ request_json: JSON.stringify({ app_id: appId }) }),
      10_000,
    ),
  );
}

export async function applyOptiscalerBackend(request: {
  app_id: number;
  changes: OptiscalerChange[];
  mode: "patch" | "reset";
  snapshot: OptiscalerSnapshot;
}) {
  return parseOptiscalerApplyResult(
    await withBackendTimeout(
      applyOptiscaler({ request_json: JSON.stringify(request) }),
      120_000,
    ),
  );
}
