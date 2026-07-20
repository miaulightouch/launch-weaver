import { beforeEach, expect, mock, test } from "bun:test";

const unmount = mock(() => {});
const rootRender = mock(() => {});
const createRoot = mock(() => ({ render: rootRender, unmount }));
mock.module("react-dom/client", () => ({ createRoot }));

const { closeLinkedPopups, openOwnedWindow } = await import(
  "../frontend/app/ownedWindow"
);

beforeEach(() => {
  closeLinkedPopups();
  createRoot.mockClear();
  rootRender.mockClear();
  unmount.mockClear();
});

function makePopup() {
  const appended: any[] = [];
  const replaced: any[] = [];
  const document = {
    body: { replaceChildren: (...nodes: any[]) => replaced.push(...nodes) },
    createElement: (tag: string) => ({ className: "", id: "", tag, textContent: "" }),
    head: { append: (node: any) => appended.push(node) },
    title: "",
  };
  const popup = Object.assign(new EventTarget(), {
    close: mock(() => {
      popup.closed = true;
    }),
    closed: false,
    document,
    SteamClient: {
      Window: {
        BringToFront: mock(() => {}),
        ResizeTo: mock(() => {}),
        ShowWindow: mock(() => {}),
      },
    },
  });
  return { appended, document, popup, replaced };
}

function makeWindows(open: () => Window | null) {
  const parent = Object.assign(new EventTarget(), {
    SteamClient: {
      Browser: { GetBrowserID: () => 41 },
    },
  }) as unknown as Window;
  const host = Object.assign(new EventTarget(), {
    open: mock(open),
  }) as unknown as Window;
  return { host, parent };
}

test("owned popup closes, unmounts, and reports close exactly once", () => {
  const { appended, document, popup, replaced } = makePopup();
  const { host, parent } = makeWindows(
    () => popup as unknown as Window,
  );
  const onClose = mock(() => {});
  let closeFromRender: (() => void) | undefined;

  openOwnedWindow(
    parent,
    "LaunchWeaver",
    "body { color: white; }",
    (close) => {
      closeFromRender = close;
      return null;
    },
    onClose,
    host,
  );

  closeFromRender?.();
  popup.dispatchEvent(new Event("pagehide"));

  expect((host.open as ReturnType<typeof mock>).mock.calls[0]?.[0]).toBe(
    "about:blank?createflags=16&browserType=3&openerid=41&centerOnBrowserID=41",
  );
  expect((host.open as ReturnType<typeof mock>).mock.calls[0]?.[1]).toMatch(
    /^launchweaver-\d+-\d+$/,
  );
  expect((host.open as ReturnType<typeof mock>).mock.calls[0]?.[2]).toBe(
    "top=0,left=0,width=850,height=722,resizable=yes,status=0,toolbar=0,menubar=0,location=0",
  );
  expect(document.title).toBe("LaunchWeaver");
  expect(appended[0]?.textContent).toBe("body { color: white; }");
  expect(replaced[0]?.id).toBe("launchweaver-root");
  expect(replaced[0]?.className).toBe("lw-root");
  expect(rootRender).toHaveBeenCalledTimes(1);
  expect(popup.SteamClient.Window.ResizeTo).toHaveBeenCalledWith(850, 722, true);
  expect(popup.SteamClient.Window.ShowWindow).toHaveBeenCalledTimes(1);
  expect(popup.SteamClient.Window.BringToFront).toHaveBeenCalledTimes(1);
  expect(unmount).toHaveBeenCalledTimes(1);
  expect(popup.close).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("a blocked popup cleans up and a retry can open", () => {
  const { popup } = makePopup();
  let attempts = 0;
  const { host, parent } = makeWindows(
    () => (++attempts === 1 ? null : popup as unknown as Window),
  );
  const blockedClose = mock(() => {});

  expect(() =>
    openOwnedWindow(parent, "LaunchWeaver", "", () => null, blockedClose, host),
  ).toThrow("LaunchWeaver popup was blocked.");
  expect(blockedClose).toHaveBeenCalledTimes(1);

  const retryClose = mock(() => {});
  openOwnedWindow(
    parent,
    "LaunchWeaver",
    "",
    () => null,
    retryClose,
    host,
  );
  closeLinkedPopups();

  expect(host.open).toHaveBeenCalledTimes(2);
  expect(createRoot).toHaveBeenCalledTimes(1);
  expect(popup.close).toHaveBeenCalledTimes(1);
  expect(retryClose).toHaveBeenCalledTimes(1);
});

test("a parent owns one popup and closes it on pagehide", () => {
  const { popup } = makePopup();
  const { host, parent } = makeWindows(() => popup as unknown as Window);
  const ownerClose = mock(() => {});
  const rejectedClose = mock(() => {});

  openOwnedWindow(parent, "LaunchWeaver", "", () => null, ownerClose, host);
  openOwnedWindow(
    parent,
    "LaunchWeaver",
    "",
    () => null,
    rejectedClose,
    host,
  );
  parent.dispatchEvent(new Event("pagehide"));

  expect(host.open).toHaveBeenCalledTimes(1);
  expect(rejectedClose).toHaveBeenCalledTimes(1);
  expect(popup.close).toHaveBeenCalledTimes(1);
  expect(ownerClose).toHaveBeenCalledTimes(1);
});
