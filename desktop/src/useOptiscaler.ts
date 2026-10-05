import React from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { customizedOptiscalerRows, getOptiscalerChanges, getOptiscalerConfigError, type OptiscalerDocument } from "../../frontend/features/optiscaler/model";
import type { DraftOptiscalerConfigRow, OptiscalerLoadStatus } from "../../frontend/pages/OptiscalerPage";

export function useOptiscaler(id: string) {
  const [document, setDocument] = React.useState<OptiscalerDocument | null>(null);
  const [rows, setRows] = React.useState<DraftOptiscalerConfigRow[]>([]);
  const [resetRequested, setResetRequested] = React.useState(false);
  const [loadStatus, setLoadStatus] = React.useState<OptiscalerLoadStatus>("checking");
  const [loadMessage, setLoadMessage] = React.useState<string | null>(null);
  const generation = React.useRef(0);
  const replace = (next: OptiscalerDocument) => {
    setDocument(next);
    setRows(customizedOptiscalerRows(next.rows).map(row => ({ ...row, id: crypto.randomUUID() })));
    setResetRequested(false); setLoadStatus("ready"); setLoadMessage(null);
  };
  const reload = async () => {
    const request = ++generation.current;
    setLoadStatus("checking"); setDocument(null); setRows([]); setResetRequested(false);
    try {
      if (!isTauri()) throw new Error("INI editing requires the desktop app.");
      const next = await invoke<OptiscalerDocument>("read_optiscaler", { id });
      if (request === generation.current) replace(next);
    } catch (error) {
      if (request === generation.current) { setLoadStatus("unavailable"); setLoadMessage(String(error)); }
    }
  };
  React.useEffect(() => { void reload(); return () => { generation.current++; }; }, [id]);
  const changes = getOptiscalerChanges(customizedOptiscalerRows(document?.rows ?? []), rows);
  const dirty = resetRequested || changes.length > 0;
  const error = resetRequested ? null : getOptiscalerConfigError(rows);
  const apply = async () => {
    if (!dirty || !document) return;
    replace(await invoke<OptiscalerDocument>("save_optiscaler", { id, snapshot: document.snapshot, changes: resetRequested ? [] : changes, reset: resetRequested }));
  };
  return { document, rows, setRows, resetRequested, setResetRequested, loadStatus, loadMessage, reload, dirty, error, apply };
}
