import { getReactInstance } from "@steambrew/client";
import type { NativeLaunchOptionsBridge } from "./index";
import { findLaunchOptionsDetails } from "./properties-tree";

const INPUT_SELECTOR =
  'input[spellcheck="false"][aria-labelledby][aria-describedby], textarea[spellcheck="false"][aria-labelledby][aria-describedby]';
const BUTTON_ATTRIBUTE = "data-launchweaver-editor";
const editorInputs = new WeakMap<Element, HTMLInputElement | HTMLTextAreaElement>();

type OpenEditor = (
  appId: number,
  raw: string,
  bridge: NativeLaunchOptionsBridge,
  parent: Window,
  onClose: () => void,
) => void;

function getDetails(input: HTMLInputElement | HTMLTextAreaElement) {
  return findLaunchOptionsDetails(getReactInstance(input));
}

function getFieldRoot(input: HTMLInputElement | HTMLTextAreaElement) {
  const descriptionId = input.getAttribute("aria-describedby");
  const description = descriptionId ? input.ownerDocument.getElementById(descriptionId) : null;
  let current = input.parentElement;

  while (current && description && !current.contains(description)) current = current.parentElement;
  return current;
}

function addEditorButton(input: HTMLInputElement | HTMLTextAreaElement, openEditor: OpenEditor) {
  const details = getDetails(input);
  const fieldRoot = getFieldRoot(input);
  if (
    !details ||
    input.value !== details.strLaunchOptions ||
    !fieldRoot ||
    fieldRoot.querySelector(`[${BUTTON_ATTRIBUTE}]`)
  ) {
    return false;
  }

  const wrapper = input.ownerDocument.createElement("div");
  wrapper.setAttribute(BUTTON_ATTRIBUTE, "true");
  wrapper.style.display = "flex";
  wrapper.style.justifyContent = "flex-start";
  wrapper.style.marginTop = "8px";

  const button = input.ownerDocument.createElement("button");
  button.type = "button";
  button.className = "DialogButton _DialogLayout Secondary";
  button.textContent = "Launch Options Editor";
  button.setAttribute("aria-label", "Open Launch Options Editor");
  button.title = "Open Launch Options Editor";
  let editorOpen = false;
  button.addEventListener("click", () => {
    if (editorOpen) return;
    const currentDetails = getDetails(input);
    const parent = input.ownerDocument.defaultView;
    if (
      !currentDetails ||
      currentDetails.unAppID !== details.unAppID ||
      !input.isConnected ||
      !parent
    ) {
      return;
    }

    const bridge: NativeLaunchOptionsBridge = {
      read: () => (input.isConnected ? input.value : null),
      write: (value) => SteamClient.Apps.SetAppLaunchOptions(currentDetails.unAppID, value),
    };
    editorOpen = true;
    try {
      openEditor(currentDetails.unAppID, input.value, bridge, parent, () => {
        editorOpen = false;
      });
    } catch {
      editorOpen = false;
    }
  });

  wrapper.append(button);
  fieldRoot.append(wrapper);
  editorInputs.set(wrapper, input);
  return true;
}

function isPropertiesWindow(context: any, document: Document) {
  return (
    document.documentElement.classList.contains("MillenniumWindow_GameProperties") ||
    (context?.m_rgParams?.minHeight === 601 && context?.m_rgParams?.minWidth === 842)
  );
}

export function installPropertiesPatch(openEditor: OpenEditor) {
  let cancelled = false;
  const observers = new Map<
    Document,
    { observer: MutationObserver; onPageHide: () => void }
  >();

  const observe = (context: any) => {
    if (cancelled) return;
    const document = context?.window?.document as Document | undefined;
    if (!document || observers.has(document) || !isPropertiesWindow(context, document)) return;

    const scan = () => {
      if (cancelled) return;
      const existing = document.querySelector(`[${BUTTON_ATTRIBUTE}]`);
      const existingInput = existing ? editorInputs.get(existing) : null;
      if (existingInput?.isConnected && getDetails(existingInput)) return;
      existing?.remove();
      for (const input of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        INPUT_SELECTOR,
      )) {
        if (addEditorButton(input, openEditor)) break;
      }
    };

    const Observer = document.defaultView?.MutationObserver ?? MutationObserver;
    const observer = new Observer(scan);
    const onPageHide = () => {
      observer.disconnect();
      observers.delete(document);
    };
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.defaultView?.addEventListener("pagehide", onPageHide, { once: true });
    observers.set(document, { observer, onPageHide });
    scan();
  };

  window.Millennium.AddWindowCreateHook?.(observe);

  return () => {
    cancelled = true;
    for (const [document, { observer, onPageHide }] of observers) {
      observer.disconnect();
      document.defaultView?.removeEventListener("pagehide", onPageHide);
      document.querySelectorAll(`[${BUTTON_ATTRIBUTE}]`).forEach((element) => element.remove());
    }
    observers.clear();
  };
}
