export const LAUNCH_OPTIONS_INPUT_SELECTOR =
  'input[spellcheck="false"][aria-labelledby], textarea[spellcheck="false"][aria-labelledby]';

export interface PropertiesTarget {
  appId: number;
  shortcut: boolean;
}

export function getPropertiesLaunchOptions(
  details: { strLaunchOptions: string; strShortcutLaunchOptions: string },
  shortcut: boolean,
) {
  return shortcut ? details.strShortcutLaunchOptions : details.strLaunchOptions;
}

export function getPropertiesTarget(document: ParentNode): PropertiesTarget | null {
  for (const tab of document.querySelectorAll<HTMLElement>('[role="tab"][id*="/properties"]')) {
    const match = tab.id.match(/\/app\/([1-9]\d*)\/properties(?:\/|$)/);
    if (!match) continue;
    const appId = Number(match[1]);
    if (!Number.isSafeInteger(appId)) continue;
    return {
      appId,
      shortcut: /\/properties\/shortcut(?:\/|$)/.test(tab.id),
    };
  }
  return null;
}

function getAriaReference(
  input: HTMLInputElement | HTMLTextAreaElement,
  attribute: "aria-describedby" | "aria-labelledby",
) {
  const id = input.getAttribute(attribute);
  return id ? input.ownerDocument.getElementById(id) : null;
}

export function isLaunchOptionsInput(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  shortcutTitle: string | null,
) {
  if (input.value !== value) return false;
  if (input.hasAttribute("aria-describedby")) return true;

  const title = getAriaReference(input, "aria-labelledby")?.textContent?.trim();
  return Boolean(title && title === shortcutTitle?.trim());
}

export function getLaunchOptionsFieldRoot(
  input: HTMLInputElement | HTMLTextAreaElement,
) {
  const boundary =
    getAriaReference(input, "aria-describedby") ??
    getAriaReference(input, "aria-labelledby");
  let current = input.parentElement;

  while (current && boundary && !current.contains(boundary)) {
    current = current.parentElement;
  }
  return current;
}

export function isPropertiesWindow(context: any, document: Document) {
  return (
    document.documentElement.classList.contains("MillenniumWindow_GameProperties") ||
    (context?.m_rgParams?.minHeight === 601 && context?.m_rgParams?.minWidth === 842)
  );
}
