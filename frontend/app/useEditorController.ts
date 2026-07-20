import React from "react";
import type { DraftToken } from "../components/OrderedTokenEditor";
import {
  type DraftEnvironmentVariable,
  type EnvironmentGroup,
  groupForKey,
} from "../features/environment/model";
import {
  applyLaunchOptionsChange,
  type NativeLaunchOptionsBridge,
} from "../features/launch-options/apply";
import {
  getLaunchOptionsError,
  parseLaunchOptions,
  serializeLaunchOptions,
} from "../features/launch-options/model";
import {
  applyOptiscalerBackend,
  readOptiscalerBackend,
} from "../features/optiscaler/backend";
import {
  customizedOptiscalerRows,
  getOptiscalerConfigError,
  getOptiscalerChanges,
  hasWrappedOptiscalerConfig,
  OPTISCALER_CONFIG_KEY,
  type OptiscalerDocument,
} from "../features/optiscaler/model";
import { parseWrapperRows } from "../features/wrappers/model";
import type {
  DraftOptiscalerConfigRow,
  OptiscalerLoadStatus,
} from "../pages/OptiscalerPage";
import type { EditorViewProps } from "../views/EditorView";

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

export function useEditorController({
  appId,
  bridge,
  closeModal,
  raw,
}: {
  appId: number;
  bridge: NativeLaunchOptionsBridge;
  closeModal: () => void;
  raw: string;
}): EditorViewProps {
  const [parsed] = React.useState(() => parseLaunchOptions(raw));
  const [environmentRows, setEnvironmentRows] = React.useState<
    DraftEnvironmentVariable[]
  >(() =>
    parsed.env.map((entry, index) => ({
      ...entry,
      group: groupForKey(entry.key),
      id: "environment-" + index,
    })),
  );
  const [wrapperRows, setWrapperRows] = React.useState<DraftToken[]>(() =>
    parsed.wrappers.map((value, index) => ({
      id: "wrapper-" + index,
      originalValue: value,
      value,
    })),
  );
  const [parameterRows, setParameterRows] = React.useState<DraftToken[]>(() =>
    parsed.parameters.map((value, index) => ({ id: "parameter-" + index, value })),
  );
  const [nativeBaseline, setNativeBaseline] = React.useState(raw);
  const [optiscalerDocument, setOptiscalerDocument] =
    React.useState<OptiscalerDocument | null>(null);
  const [optiscalerRows, setOptiscalerRows] =
    React.useState<DraftOptiscalerConfigRow[]>([]);
  const [optiscalerLoadMessage, setOptiscalerLoadMessage] =
    React.useState<string | null>(null);
  const [resetRequested, setResetRequested] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [applying, setApplying] = React.useState(false);

  React.useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const document = await readOptiscalerBackend(appId);
        if (!active) return;

        const baseRows = customizedOptiscalerRows(document.rows);
        setOptiscalerDocument(document);
        setOptiscalerRows(
          baseRows.map((row, index) => ({ ...row, id: "optiscaler-" + index })),
        );
        setOptiscalerLoadMessage(null);
      } catch (error) {
        if (active) {
          setOptiscalerLoadMessage(
            error instanceof Error
              ? error.message
              : "The installed OptiScaler.ini is unavailable.",
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [appId]);

  const parsedWrapperRows = parseWrapperRows(wrapperRows);
  const currentWrappedConfig = hasWrappedOptiscalerConfig(parsedWrapperRows.tokens);

  const setEnvironmentValue = (
    key: string,
    value: string | null,
    group: EnvironmentGroup = "Custom",
  ) => {
    setEnvironmentRows((current) => {
      if (value === null) return current.filter((row) => row.key !== key);
      const existing = current.find((row) => row.key === key);
      if (existing) {
        return current.map((row) => (row.id === existing.id ? { ...row, value } : row));
      }
      return [...current, { group, id: crypto.randomUUID(), key, value }];
    });
  };

  const optiscalerLoadStatus: OptiscalerLoadStatus = optiscalerDocument
    ? "ready"
    : optiscalerLoadMessage
      ? "unavailable"
      : "checking";
  const plainOptiscalerRows = optiscalerRows.map(({ section, option, value }) => ({
    option,
    section,
    value,
  }));
  const optiscalerChanges = getOptiscalerChanges(
    customizedOptiscalerRows(optiscalerDocument?.rows ?? []),
    plainOptiscalerRows,
  );
  const optiscalerDirty = resetRequested || optiscalerChanges.length > 0;
  const launchOptions = {
    env: environmentRows.map(({ key, value }) => ({ key, value })),
    wrappers: parsedWrapperRows.tokens,
    parameters: parameterRows.map(({ value }) => value),
  };
  const optiscalerError = resetRequested
    ? null
    : getOptiscalerConfigError(plainOptiscalerRows);
  const optiscalerAvailabilityError =
    optiscalerDirty &&
    (optiscalerLoadStatus !== "ready" || !optiscalerDocument)
      ? "The installed OptiScaler.ini is unavailable, so its pending changes cannot be applied."
      : null;
  const configOverrideError = environmentRows.some(
    ({ key }) => key === OPTISCALER_CONFIG_KEY,
  )
    ? "PROTON_OPTISCALER_CONFIG conflicts with direct INI editing. Remove it before applying INI changes."
    : null;
  const unparsedConfigOverrideError =
    parsed.error && raw.includes(OPTISCALER_CONFIG_KEY)
      ? "Launch Options contains PROTON_OPTISCALER_CONFIG inside syntax LaunchWeaver cannot safely parse. Remove that override manually, then reopen this editor before applying direct INI changes."
      : null;
  const wrappedConfigOverrideNotice = currentWrappedConfig
    ? "A wrapper argument sets PROTON_OPTISCALER_CONFIG, which can override direct INI changes. Remove that wrapper row before using the direct INI editor."
    : null;
  const dlssUpgradeOverlap =
    parsedWrapperRows.tokens.includes("dlss-swapper") &&
    environmentRows.some(
      ({ key, value }) => key === "PROTON_DLSS_UPGRADE" && value !== "0",
    );
  const launchValidationError = parsed.error
    ? null
    : parsedWrapperRows.error || getLaunchOptionsError(launchOptions);
  const validationError =
    unparsedConfigOverrideError ||
    (optiscalerDirty ? configOverrideError || wrappedConfigOverrideNotice : null) ||
    launchValidationError ||
    optiscalerError ||
    optiscalerAvailabilityError;
  const compiled = serializeLaunchOptions(parsed, launchOptions);
  const launchEditingDisabled = Boolean(parsed.error) || applying;
  const iniEditingDisabled =
    applying ||
    Boolean(unparsedConfigOverrideError) ||
    Boolean(wrappedConfigOverrideNotice);
  const launchParseNotice = parsed.error
    ? parsed.error +
      " Launch fields are read-only and will remain byte-for-byte unchanged; the direct INI editor is still available."
    : null;

  const applyOptiscalerIni = async () => {
    if (optiscalerLoadStatus !== "ready" || !optiscalerDocument) {
      throw new Error("The installed OptiScaler.ini is unavailable.");
    }

    return applyOptiscalerBackend({
      app_id: appId,
      changes: resetRequested ? [] : optiscalerChanges,
      mode: resetRequested ? "reset" : "patch",
      snapshot: optiscalerDocument.snapshot,
    });
  };

  const apply = async () => {
    if (validationError || applying) return;
    setMessage(null);

    setApplying(true);
    const messages = {
      failed: "Steam rejected the write. The original value was not replaced.",
      stale:
        "Launch Options changed after this dialog opened. Nothing was overwritten; close and reopen it.",
      unconfirmed:
        "Steam did not confirm the write. Check the native field before continuing; no second write was made.",
      unavailable: "LaunchWeaver could not re-read the native field, so nothing was written.",
    } as const;

    const launch = await applyLaunchOptionsChange({
      before: nativeBaseline,
      after: compiled,
      io: {
        readCurrent: async () => bridge.read(),
        waitFor: async (expected) => waitForNativeValue(bridge, expected),
        write: (value) => bridge.write(value),
      },
    });

    if (launch !== "applied" && launch !== "unchanged") {
      setApplying(false);
      setMessage(messages[launch]);
      return;
    }

    setNativeBaseline(compiled);
    if (!optiscalerDirty) {
      setApplying(false);
      return;
    }

    try {
      await applyOptiscalerIni();
    } catch (error) {
      setApplying(false);
      setMessage(
        (launch === "applied" ? "Launch Options were applied. " : "") +
          (error instanceof Error ? error.message : "OptiScaler.ini update failed.") +
          " Reopen the editor before retrying; a timed-out backend operation may still have completed.",
      );
      return;
    }

    try {
      const refreshed = await readOptiscalerBackend(appId);
      const baseRows = customizedOptiscalerRows(refreshed.rows);
      setOptiscalerDocument(refreshed);
      setOptiscalerRows(
        baseRows.map((row) => ({ ...row, id: crypto.randomUUID() })),
      );
      setOptiscalerLoadMessage(null);
    } catch (error) {
      setOptiscalerDocument(null);
      setOptiscalerRows([]);
      setOptiscalerLoadMessage(
        error instanceof Error ? error.message : "OptiScaler.ini refresh failed.",
      );
      setMessage(
        "Changes were applied, but OptiScaler.ini could not be refreshed. Close and reopen the editor.",
      );
    }
    setResetRequested(false);
    setApplying(false);
  };

  const notice =
    validationError ||
    message ||
    (dlssUpgradeOverlap
      ? "DLSS Swapper and PROTON_DLSS_UPGRADE both update DLSS; using both may be redundant."
      : null) ||
    configOverrideError ||
    wrappedConfigOverrideNotice ||
    launchParseNotice;

  return {
    applying,
    canApply:
      !validationError &&
      !applying &&
      (!parsed.error || optiscalerDirty),
    close: closeModal,
    environment: {
      disabled: launchEditingDisabled,
      rows: environmentRows,
      setEnvironmentValue,
      setRows: setEnvironmentRows,
    },
    notice,
    noticeTone: validationError ? "error" : "warning",
    onApply: () => void apply(),
    optiscaler: {
      disabled: iniEditingDisabled,
      document: optiscalerDocument,
      environmentRows,
      launchDisabled: launchEditingDisabled,
      loadMessage: optiscalerLoadMessage,
      loadStatus: optiscalerLoadStatus,
      resetRequested,
      rows: optiscalerRows,
      setEnvironmentValue,
      setResetRequested,
      setRows: setOptiscalerRows,
    },
    parameters: {
      disabled: launchEditingDisabled,
      rows: parameterRows,
      setRows: setParameterRows,
    },
    wrappers: {
      disabled: launchEditingDisabled,
      rows: wrapperRows,
      setRows: setWrapperRows,
    },
  };
}
