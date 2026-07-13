import React from "react";
import {
  ConfirmModal,
  definePlugin,
  DialogButton,
  DialogLabel,
  IconsModule,
  showModal,
  TextField,
} from "@steambrew/client";
import { applyLaunchOptionsChange } from "./apply-launch-options";
import {
  type EnvironmentVariable,
  getEnvironmentError,
  parseLaunchOptions,
  serializeLaunchOptions,
} from "./launch-options";
import { installPropertiesPatch } from "./properties-patch";

export interface NativeLaunchOptionsBridge {
  read(): string | null;
  write(value: string): void;
}

type DraftEnvironmentVariable = EnvironmentVariable & { id: string };

const ICON_BUTTON_STYLE = {
  alignItems: "center",
  boxSizing: "border-box",
  display: "flex",
  flex: "0 0 40px",
  height: 40,
  justifyContent: "center",
  minWidth: 40,
  padding: 0,
  width: 40,
} as const;

function waitForNativeValue(bridge: NativeLaunchOptionsBridge, expected: string) {
  return new Promise<string | null>((resolve) => {
    const deadline = Date.now() + 2_000;

    const check = () => {
      let current: string | null;
      try {
        current = bridge.read();
      } catch {
        resolve(null);
        return;
      }

      if (current === expected || Date.now() >= deadline) {
        resolve(current);
        return;
      }

      window.setTimeout(check, 50);
    };

    check();
  });
}

function EditorDialog({
  appId,
  bridge,
  closeModal,
  raw,
}: {
  appId: number;
  bridge: NativeLaunchOptionsBridge;
  closeModal?: () => void;
  raw: string;
}) {
  const [parsed] = React.useState(() => parseLaunchOptions(raw));
  const nextId = React.useRef(0);
  const [rows, setRows] = React.useState<DraftEnvironmentVariable[]>(() =>
    parsed.env.map((entry, index) => ({ ...entry, id: `original-${index}` })),
  );
  const [message, setMessage] = React.useState<string | null>(null);
  const [applying, setApplying] = React.useState(false);

  const validationError = getEnvironmentError(rows);
  const compiled = serializeLaunchOptions(parsed, rows);

  const updateRow = (id: string, change: Partial<EnvironmentVariable>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row)));
  };

  const apply = async () => {
    if (validationError || applying) return;
    setApplying(true);
    setMessage(null);
    const result = await applyLaunchOptionsChange({
      before: raw,
      after: compiled,
      io: {
        readCurrent: async () => bridge.read(),
        waitFor: async (expected) => waitForNativeValue(bridge, expected),
        write: (value) => bridge.write(value),
      },
    });

    setApplying(false);
    if (result === "applied" || result === "unchanged") {
      closeModal?.();
      return;
    }

    const messages = {
      failed: "Steam rejected the write. The original value was not replaced.",
      stale: "Launch Options changed after this dialog opened. Nothing was overwritten; close and reopen it.",
      unconfirmed: "Steam did not confirm the write. Check the native field before continuing; no second write was made.",
      unavailable: "LaunchWeaver could not re-read the native field, so nothing was written.",
    } as const;
    setMessage(messages[result]);
  };

  return (
    <ConfirmModal
      bAllowFullSize
      bOKDisabled={Boolean(validationError) || applying}
      onCancel={closeModal}
      onOK={() => void apply()}
      strCancelButtonText="Cancel"
      strOKButtonText={applying ? "Applying…" : "Apply"}
      strTitle={`LaunchWeaver · App ${appId}`}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minWidth: 0,
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: 12,
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: 1, minWidth: 0, opacity: 0.8, whiteSpace: "normal" }}>
            Edit leading environment variables. Delete every variable to clear Launch Options.
          </div>
          <DialogButton
            aria-label="Add environment variable"
            onClick={() =>
              setRows((current) => [
                ...current,
                { id: `new-${nextId.current++}`, key: "", value: "" },
              ])
            }
            style={ICON_BUTTON_STYLE}
            title="Add variable"
          >
            <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2"
              />
            </svg>
          </DialogButton>
        </div>

        <div
          style={{
            alignItems: "center",
            columnGap: 8,
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) 40px",
            rowGap: 8,
          }}
        >
          <DialogLabel style={{ marginBottom: 0 }}>Name</DialogLabel>
          <DialogLabel style={{ marginBottom: 0 }}>Value</DialogLabel>
          <span />

          {rows.map((row, index) => (
            <React.Fragment key={row.id}>
              <div style={{ minWidth: 0 }}>
                <TextField
                  aria-label={`Environment variable ${index + 1} name`}
                  onChange={(event) => updateRow(row.id, { key: event.currentTarget.value })}
                  value={row.key}
                />
              </div>
              <div style={{ minWidth: 0 }}>
                <TextField
                  aria-label={`Environment variable ${index + 1} value`}
                  onChange={(event) => updateRow(row.id, { value: event.currentTarget.value })}
                  value={row.value}
                />
              </div>
              <DialogButton
                aria-label={`Remove environment variable ${row.key || index + 1}`}
                onClick={() => setRows((current) => current.filter(({ id }) => id !== row.id))}
                style={ICON_BUTTON_STYLE}
                title="Remove variable"
              >
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="18"
                  viewBox="0 0 24 24"
                  width="18"
                >
                  <path
                    d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              </DialogButton>
            </React.Fragment>
          ))}
        </div>

        {(validationError || message) && (
          <div role="alert" style={{ color: "#ffcc6a" }}>
            {validationError || message}
          </div>
        )}

      </div>
    </ConfirmModal>
  );
}

export function openEditor(
  appId: number,
  raw: string,
  bridge: NativeLaunchOptionsBridge,
  parent: Window,
  onClose: () => void,
) {
  showModal(
    <EditorDialog
      appId={appId}
      bridge={bridge}
      raw={raw}
    />,
    parent,
    {
      fnOnClose: onClose,
    },
  );
}

export default definePlugin(() => {
  const uninstallPropertiesPatch = installPropertiesPatch(openEditor);

  return {
    title: "LaunchWeaver",
    icon: <IconsModule.Settings />,
    onDismount: uninstallPropertiesPatch,
  };
});
