import React from "react";
import type { NativeLaunchOptionsBridge } from "../features/launch-options/apply";
import editorStyles from "../styles/editor.scss";
import { EditorView } from "../views/EditorView";
import { openOwnedWindow } from "./ownedWindow";
import { useEditorController } from "./useEditorController";

function EditorApp({
  appId,
  bridge,
  closeModal,
  raw,
}: {
  appId: number;
  bridge: NativeLaunchOptionsBridge;
  closeModal: () => void;
  raw: string;
}) {
  const controller = useEditorController({ appId, bridge, closeModal, raw });
  return <EditorView {...controller} />;
}

export function openEditor(
  appId: number,
  appName: string,
  raw: string,
  bridge: NativeLaunchOptionsBridge,
  parent: Window,
  onClose: () => void,
) {
  openOwnedWindow(
    parent,
    `LaunchWeaver · ${appName}`,
    editorStyles,
    (close) => (
      <EditorApp appId={appId} bridge={bridge} closeModal={close} raw={raw} />
    ),
    onClose,
  );
}
