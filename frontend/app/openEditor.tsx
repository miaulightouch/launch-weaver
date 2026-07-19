import React from "react";
import type { NativeLaunchOptionsBridge } from "../features/launch-options/apply";
import { openOwnedWindow } from "../lib/ownedWindow";
import editorStyles from "../styles/editor.scss";
import { EditorView } from "../views/EditorView";
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
  raw: string,
  bridge: NativeLaunchOptionsBridge,
  parent: Window,
  onClose: () => void,
) {
  openOwnedWindow(
    parent,
    "LaunchWeaver · App " + appId,
    editorStyles,
    (close) => (
      <EditorApp appId={appId} bridge={bridge} closeModal={close} raw={raw} />
    ),
    onClose,
  );
}
