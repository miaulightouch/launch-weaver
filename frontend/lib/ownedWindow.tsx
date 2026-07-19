import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";

let nextWindowId = 0;

type HostWindow = Window & { SteamClient?: typeof SteamClient };

const activePopups = new Map<EventTarget, () => void>();

export function closeLinkedPopups() {
  for (const close of [...activePopups.values()]) close();
}

function createHostPopup(host: HostWindow, parent: HostWindow, name: string) {
  const parentPopupBrowserID = parent.SteamClient?.Browser?.GetBrowserID();
  if (parentPopupBrowserID === undefined) {
    throw new Error("Steam's parent window API is unavailable.");
  }
  const popup = host.open(
    `about:blank?createflags=16&openerid=${parentPopupBrowserID}&centerOnBrowserID=${parentPopupBrowserID}`,
    name,
    "top=0,left=0,width=850,height=722,resizable=yes,status=0,toolbar=0,menubar=0,location=0",
  );

  return popup;
}

export function openOwnedWindow(
  parent: Window,
  title: string,
  css: string,
  render: (close: () => void) => ReactNode,
  onClose: () => void,
  host: Window = window,
) {
  if (activePopups.has(parent)) {
    onClose();
    return;
  }

  const uniqueName = `launchweaver-${Date.now()}-${nextWindowId++}`;
  let created: ReturnType<typeof createHostPopup>;
  try {
    created = createHostPopup(host as HostWindow, parent as HostWindow, uniqueName);
  } catch (error) {
    onClose();
    throw error;
  }
  const popup = created;
  if (!popup) {
    onClose();
    throw new Error("LaunchWeaver popup was blocked.");
  }

  let root: ReturnType<typeof createRoot> | undefined;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    activePopups.delete(parent);
    parent.removeEventListener("pagehide", close);
    popup.removeEventListener("pagehide", close);
    try {
      root?.unmount();
    } finally {
      try {
        if (!popup.closed) popup.close();
      } finally {
        onClose();
      }
    }
  };

  activePopups.set(parent, close);
  parent.addEventListener("pagehide", close, { once: true });
  popup.addEventListener("pagehide", close, { once: true });
  try {
    popup.document.title = title;
    const style = popup.document.createElement("style");
    style.textContent = css;
    popup.document.head.append(style);
    const mount = popup.document.createElement("div");
    mount.id = "launchweaver-root";
    mount.className = "lw-root";
    popup.document.body.replaceChildren(mount);

    root = createRoot(mount);
    root.render(render(close));
    const nativeWindow = (popup as HostWindow).SteamClient?.Window;
    if (!nativeWindow) throw new Error("Steam's native window API is unavailable.");
    nativeWindow.ResizeTo(850, 722, true);
    nativeWindow.ShowWindow();
    nativeWindow.BringToFront();
  } catch (error) {
    close();
    throw error;
  }
}
