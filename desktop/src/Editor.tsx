import React from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { EditorView } from "../../frontend/views/EditorView";
import { Button } from "../../frontend/components/controls";
import { groupForKey, type DraftEnvironmentVariable, type EnvironmentGroup } from "../../frontend/features/environment/model";
import type { DraftToken } from "../../frontend/components/OrderedTokenEditor";
import { buildPatch, readDraft, type GameDocument, type LaunchDraft } from "./model";
import { useOptiscaler } from "./useOptiscaler";
function errorText(error: unknown) { return error instanceof Error ? error.message : String(error); }
function draftRows(draft: LaunchDraft) {
  return {
    env: draft.env.map((e) => ({ ...e, id: crypto.randomUUID(), group: groupForKey(e.key) })),
    wrappers: draft.wrappers.map((value) => ({ id: crypto.randomUUID(), value })),
    parameters: draft.parameters.map((value) => ({ id: crypto.randomUUID(), value })),
  };
}
export function Editor({ initial, close }: { initial: GameDocument; close(): void }) {
  const [document, setDocument] = React.useState(initial);
  const optiscaler = useOptiscaler(initial.game.id);
  const parsed = React.useMemo(() => {
    try { return { draft: readDraft(document), error: null }; }
    catch (error) { return { draft: { env: [], wrappers: [], parameters: [] } as LaunchDraft, error: errorText(error) }; }
  }, [document]);
  const [env, setEnv] = React.useState<DraftEnvironmentVariable[]>(() => draftRows(parsed.draft).env);
  const [wrappers, setWrappers] = React.useState<DraftToken[]>(() => draftRows(parsed.draft).wrappers);
  const [parameters, setParameters] = React.useState<DraftToken[]>(() => draftRows(parsed.draft).parameters);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<"back" | "reload" | "quit" | null>(null);
  const [saved, setSaved] = React.useState<string | null>(null);
  const after: LaunchDraft = { env: env.map(({ key, value }) => ({ key, value })), wrappers: wrappers.map(({ value }) => value), parameters: parameters.map(({ value }) => value) };
  let patch: Record<string, unknown> = {}, validation = parsed.error;
  try { if (!validation) patch = buildPatch(document, parsed.draft, after); }
  catch (error) { validation = errorText(error); }
  validation ||= optiscaler.error;
  if (optiscaler.dirty && [...after.env.map(({ key }) => key), ...after.wrappers].some(value => /PROTON_OPTISCALER_CONFIG|WINEPREFIX|STEAM_COMPAT_DATA_PATH/.test(value))) validation = "Apply prefix or config overrides separately from INI edits.";
  const dirty = optiscaler.dirty || JSON.stringify(after) !== JSON.stringify(parsed.draft);
  const disabled = busy || Boolean(parsed.error);
  const replace = (next: GameDocument) => {
    const rows = draftRows(readDraft(next));
    setDocument(next); setEnv(rows.env); setWrappers(rows.wrappers); setParameters(rows.parameters);
  };
  const reload = async () => {
    setBusy(true); setMessage(null); setSaved(null);
    try { replace(await invoke<GameDocument>("load_game", { id: document.game.id })); await optiscaler.reload(); }
    catch (error) { setMessage(errorText(error)); }
    finally { setBusy(false); }
  };
  const perform = (action: "back" | "reload" | "quit") => {
    setPending(null);
    if (action === "back") close();
    else if (action === "reload") void reload();
    else void getCurrentWindow().destroy().catch((error) => setMessage(errorText(error)));
  };
  const request = (action: "back" | "reload") => { if (dirty) setPending(action); else perform(action); };
  React.useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty || busy) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", guard);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    if (isTauri()) void getCurrentWindow().onCloseRequested((event) => {
      if (busy) { event.preventDefault(); setMessage("Wait for the current operation to finish before closing."); }
      else if (dirty) { event.preventDefault(); setPending("quit"); }
    }).then((stop) => { if (disposed) stop(); else unlisten = stop; }).catch((error) => setMessage(errorText(error)));
    return () => { disposed = true; unlisten?.(); window.removeEventListener("beforeunload", guard); };
  }, [dirty, busy]);
  const apply = async () => {
    if (busy || validation || (!Object.keys(patch).length && !optiscaler.dirty)) return;
    setBusy(true); setMessage(null); setSaved(null);
    let iniSaved = false;
    try {
      if (optiscaler.dirty) { await optiscaler.apply(); iniSaved = true; }
      if (Object.keys(patch).length) {
        const result = await invoke<{ document: GameDocument; backup: string }>("save_game", { id: document.game.id, snapshot: document.snapshot, patch });
        replace(result.document); await optiscaler.reload();
      }
      setSaved("Saved.");
    } catch (error) { setMessage((iniSaved ? "OptiScaler.ini was saved; launcher settings were not saved. " : "") + errorText(error)); }
    finally { setBusy(false); }
  };
  const setEnvironmentValue = (key: string, value: string | null, group: EnvironmentGroup = "Custom") => {
    setEnv((current) => value === null ? current.filter((row) => row.key !== key) : current.some((row) => row.key === key)
      ? current.map((row) => row.key === key ? { ...row, value } : row)
      : [...current, { id: crypto.randomUUID(), key, value, group }]);
  };
  return <><EditorView applying={busy} canApply={!busy && !validation && (Object.keys(patch).length > 0 || optiscaler.dirty)}
    close={() => { if (!busy) request("back"); }} closeLabel="Back to library"
    context={<div className="lw-game-context"><span className="lw-launcher-label">{document.game.launcher}</span><strong>{document.game.name}</strong><Button disabled={busy} onClick={() => request("reload")}>Reload settings</Button></div>}
    optiscaler={{ ...optiscaler, disabled: busy, launchDisabled: disabled, environmentRows: env, setEnvironmentValue }}
    environment={{ disabled, rows: env, setRows: setEnv, setEnvironmentValue }}
    parameters={{ disabled, rows: parameters, setRows: setParameters }} wrappers={{ disabled, rows: wrappers, setRows: setWrappers, excludedQuickWrappers: ["mangohud", "gamemoderun"] }}
    notice={validation || message || saved || (Object.keys(patch).length ? `Close ${document.game.launcher === "heroic" ? "Heroic" : "Faugus"} before applying changes.` : null)}
    noticeTone={validation || message ? "error" : saved ? "info" : "warning"} onApply={() => void apply()} update={null} />
    <AlertDialog.Root open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null); }}>
      <AlertDialog.Portal container={window.document.querySelector<HTMLElement>(".lw-root")}><AlertDialog.Backdrop className="lw-dialog-backdrop" /><AlertDialog.Popup className="lw-discard-dialog">
        <AlertDialog.Title>Discard unapplied changes?</AlertDialog.Title>
        <AlertDialog.Description>Your edits have not been saved.</AlertDialog.Description>
        <div className="lw-dialog-actions"><Button onClick={() => setPending(null)}>Keep editing</Button><Button variant="primary" onClick={() => { if (pending) perform(pending); }}>Discard changes</Button></div>
      </AlertDialog.Popup></AlertDialog.Portal>
    </AlertDialog.Root></>;
}
