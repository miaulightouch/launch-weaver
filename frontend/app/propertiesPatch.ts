import type { NativeLaunchOptionsBridge } from "../features/launch-options/apply";
import propertiesStyles from "../styles/properties.scss";
import { openEditor } from "./openEditor";
import { closeLinkedPopups } from "./ownedWindow";
import {
  getLaunchOptionsFieldRoot,
  getPropertiesLaunchOptions,
  getPropertiesTarget,
  isLaunchOptionsInput,
  isPropertiesWindow,
  LAUNCH_OPTIONS_INPUT_SELECTOR,
  type PropertiesTarget,
} from "./propertiesHelpers";

const BUTTON_ATTRIBUTE = "data-launchweaver-editor";
const STYLE_ATTRIBUTE = "data-launchweaver-style";
const LAUNCH_OPTIONS_TOKEN = "AppProperties_LaunchOptionsSection";
const editorInputs = new WeakMap<Element, HTMLInputElement | HTMLTextAreaElement>();

function getLaunchOptionsTitle() {
  const manager = window.LocalizationManager;
  return (
    manager?.m_mapTokens.get(LAUNCH_OPTIONS_TOKEN) ??
    manager?.m_mapFallbackTokens.get(LAUNCH_OPTIONS_TOKEN) ??
    null
  );
}

function ensureStyles(document: Document) {
  if (document.head.querySelector(`[${STYLE_ATTRIBUTE}]`)) return;
  const style = document.createElement("style");
  style.setAttribute(STYLE_ATTRIBUTE, "true");
  style.textContent = propertiesStyles;
  document.head.append(style);
}

function addEditorButton(
  target: PropertiesTarget,
  input: HTMLInputElement | HTMLTextAreaElement,
  launchOptionsTitle: string | null,
) {
  const { appId } = target;
  const details = window.appDetailsStore?.GetAppDetails(appId);
  const fieldRoot = getLaunchOptionsFieldRoot(input);
  if (
    details?.unAppID !== appId ||
    !isLaunchOptionsInput(
      input,
      getPropertiesLaunchOptions(details, target.shortcut),
      launchOptionsTitle,
    ) ||
    !fieldRoot ||
    fieldRoot.querySelector(`[${BUTTON_ATTRIBUTE}]`)
  ) {
    return false;
  }

  const button = input.ownerDocument.createElement("button");
  button.setAttribute(BUTTON_ATTRIBUTE, "true");
  button.type = "button";
  button.className = "launchweaver-open-button";
  button.textContent = "Edit in LaunchWeaver";
  button.setAttribute("aria-label", "Edit in LaunchWeaver");
  button.title = "Edit in LaunchWeaver";
  let editorOpen = false;
  const setEditorOpen = (open: boolean) => {
    editorOpen = open;
    button.disabled = open;
    button.textContent = open ? "LaunchWeaver is open" : "Edit in LaunchWeaver";
  };
  button.addEventListener("click", () => {
    if (editorOpen) return;
    const currentDetails = window.appDetailsStore?.GetAppDetails(appId);
    const parent = input.ownerDocument.defaultView;
    if (
      !currentDetails ||
      currentDetails.unAppID !== appId ||
      !isLaunchOptionsInput(
        input,
        getPropertiesLaunchOptions(currentDetails, target.shortcut),
        launchOptionsTitle,
      ) ||
      !input.isConnected ||
      !parent
    ) {
      return;
    }

    const bridge: NativeLaunchOptionsBridge = {
      read: () => (input.isConnected ? input.value : null),
      write: (value) =>
        target.shortcut
          ? SteamClient.Apps.SetShortcutLaunchOptions(appId, value)
          : SteamClient.Apps.SetAppLaunchOptions(appId, value),
    };
    setEditorOpen(true);
    try {
      openEditor(
        appId,
        currentDetails.strDisplayName || `App ${appId}`,
        input.value,
        bridge,
        parent,
        () => {
          setEditorOpen(false);
        },
      );
    } catch (error) {
      setEditorOpen(false);
      console.error("[LaunchWeaver] Could not open the editor.", error);
    }
  });

  fieldRoot.append(button);
  editorInputs.set(button, input);
  return true;
}

export function installPropertiesPatch() {
  let cancelled = false;
  const observers = new Map<
    Document,
    { observer: MutationObserver; onPageHide: () => void }
  >();

  const observe = (context: any) => {
    if (cancelled) return;
    const document = context?.window?.document as Document | undefined;
    if (!document || observers.has(document) || !isPropertiesWindow(context, document)) return;
    ensureStyles(document);

    const scan = () => {
      if (cancelled) return;
      const existing = document.querySelector(`[${BUTTON_ATTRIBUTE}]`);
      const existingInput = existing ? editorInputs.get(existing) : null;
      const target = getPropertiesTarget(document);
      const details = target
        ? window.appDetailsStore?.GetAppDetails(target.appId)
        : null;
      const launchOptionsTitle = getLaunchOptionsTitle();
      if (
        existingInput?.isConnected &&
        target &&
        details?.unAppID === target.appId &&
        isLaunchOptionsInput(
          existingInput,
          getPropertiesLaunchOptions(details, target.shortcut),
          launchOptionsTitle,
        )
      ) {
        return;
      }
      existing?.remove();
      if (!target) return;
      for (const input of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        LAUNCH_OPTIONS_INPUT_SELECTOR,
      )) {
        if (addEditorButton(target, input, launchOptionsTitle)) break;
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
    closeLinkedPopups();
    for (const [document, { observer, onPageHide }] of observers) {
      observer.disconnect();
      document.defaultView?.removeEventListener("pagehide", onPageHide);
      document.querySelectorAll(`[${BUTTON_ATTRIBUTE}]`).forEach((element) => element.remove());
      document.head.querySelector(`[${STYLE_ATTRIBUTE}]`)?.remove();
    }
    observers.clear();
  };
}
