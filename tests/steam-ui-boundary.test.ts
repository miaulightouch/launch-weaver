import { expect, test } from "bun:test";

const frontendFiles = [
  ...new Bun.Glob("frontend/**/*.ts").scanSync(),
  ...new Bun.Glob("frontend/**/*.tsx").scanSync(),
].sort();

const bannedComponents = [
  "ConfirmModal",
  "DialogBody",
  "DialogBodyText",
  "DialogButton",
  "DialogButtonPrimary",
  "DialogControlsSection",
  "DialogFooter",
  "DialogLabel",
  "Dropdown",
  "Field",
  "IconsModule",
  "ModalPosition",
  "ModalRoot",
  "SidebarNavigation",
  "SimpleModal",
  "TextField",
  "Toggle",
];

const bannedIdentifiers = [
  "findClassModule",
  "getReactInstance",
  "showModal",
];

const platformSeams = new Map<string, string[]>([
  ["app/propertiesHelpers.ts", ["MillenniumWindow_GameProperties"]],
  ["app/propertiesPatch.ts", ["SteamClient", "appDetailsStore", "window.Millennium"]],
  ["app/useEditorController.ts", ["SteamClient"]],
  ["lib/ownedWindow.tsx", ["SteamClient", "createflags"]],
]);

const platformTokens = [
  "SteamClient",
  "MillenniumWindow_GameProperties",
  "appDetailsStore",
  "createflags",
  "window.Millennium",
];

test("frontend stays independent of Steam UI components and classes", async () => {
  const violations: string[] = [];

  for (const file of frontendFiles) {
    const source = await Bun.file(file).text();
    if (file.includes("properties-tree")) violations.push(`${file}: forbidden source file`);
    if (
      !["frontend/index.tsx", "frontend/features/optiscaler/backend.ts"].includes(file) &&
      /["']@steambrew\/client["']/.test(source)
    ) {
      violations.push(`${file}: @steambrew/client import outside plumbing boundary`);
    }
    for (const component of bannedComponents) {
      if (new RegExp(`<\\/?${component}\\b`).test(source)) {
        violations.push(`${file}: ${component}`);
      }
    }
    for (const identifier of bannedIdentifiers) {
      if (new RegExp(`\\b${identifier}\\b`).test(source)) {
        violations.push(`${file}: ${identifier}`);
      }
    }
    if (/properties-tree/.test(source)) violations.push(`${file}: properties-tree`);

    const classTokens = source.match(
      /\b(?:Settings|Dialog|GenericDialog|ModalPosition|SteamUI|_Dialog)[A-Za-z0-9_-]+\b/g,
    );
    for (const token of new Set(classTokens ?? [])) {
      if (!bannedComponents.includes(token)) {
        violations.push(`${file}: Steam class token ${token}`);
      }
    }
    if (/\bNoContentPadding\b/.test(source)) {
      violations.push(`${file}: Steam class token NoContentPadding`);
    }
  }

  expect(violations).toEqual([]);
});

test("Millennium imports stay limited to plumbing entry points", async () => {
  for (const [file, expectedUses] of [
    ["frontend/index.tsx", ["definePlugin"]],
    ["frontend/features/optiscaler/backend.ts", []],
  ] as const) {
    const source = await Bun.file(file).text();
    const uses = [...source.matchAll(/\bclient\.([A-Za-z_$][\w$]*)/g)]
      .map((match) => match[1])
      .filter((value): value is string => Boolean(value));

    expect(source.match(/["']@steambrew\/client["']/g)).toHaveLength(1);
    expect([...new Set(uses)].sort()).toEqual(expectedUses);
  }
});

test("raw platform globals stay inside explicit integration seams", async () => {
  const violations: string[] = [];

  for (const file of frontendFiles) {
    const source = await Bun.file(file).text();
    const relativeFile = file.replace(/^frontend\//, "");
    const allowedTokens = platformSeams.get(relativeFile) ?? [];

    for (const token of platformTokens) {
      if (source.includes(token) && !allowedTokens.includes(token)) {
        violations.push(`${file}: ${token} outside platform seam`);
      }
    }
  }

  expect(violations).toEqual([]);
});

test("frontend layers keep a one-way dependency boundary", async () => {
  const requiredDirectories = [
    "app",
    "components",
    "features",
    "lib",
    "pages",
    "styles",
    "views",
  ];
  for (const directory of requiredDirectories) {
    expect(
      [...new Bun.Glob(`frontend/${directory}/**/*`).scanSync()].length,
    ).toBeGreaterThan(0);
  }

  const rootSources = frontendFiles.filter(
    (file) => file.split("/").length === 2 && /\.tsx?$/.test(file),
  );
  expect(rootSources).toEqual(["frontend/index.tsx"]);
  expect(frontendFiles.filter((file) => /\/index\.tsx?$/.test(file))).toEqual([
    "frontend/index.tsx",
  ]);

  const violations: string[] = [];
  for (const file of frontendFiles) {
    const source = await Bun.file(file).text();
    if (
      file.startsWith("frontend/features/") &&
      /from\s+["'](?:\.\.\/)+(?:app|components|pages|views)\//.test(source)
    ) {
      violations.push(`${file}: feature imports an upper UI layer`);
    }
    if (
      (file.startsWith("frontend/components/") || file.startsWith("frontend/lib/")) &&
      /from\s+["'](?:\.\.\/)+(?:app|features|pages|views)\//.test(source)
    ) {
      violations.push(`${file}: shared layer imports an application layer`);
    }
  }
  expect(violations).toEqual([]);
});

test("all authored CSS stays in stylesheets", async () => {
  const violations: string[] = [];
  for (const file of frontendFiles) {
    const source = await Bun.file(file).text();
    if (/style\s*=\s*\{\{/.test(source)) violations.push(`${file}: JSX inline style`);
    if (/\.style\.[A-Za-z_$]/.test(source)) violations.push(`${file}: DOM inline style`);
    if (/String\.raw\s*`/.test(source)) violations.push(`${file}: embedded stylesheet`);
  }

  expect(violations).toEqual([]);
  expect([...new Bun.Glob("frontend/styles/*.{css,scss}").scanSync()].length).toBeGreaterThan(0);
});
