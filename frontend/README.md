# Frontend architecture

Millennium fixes `frontend/index.tsx` as the bundle entry and supplies Steam's React
runtime. Everything below that entry follows a one-way composition flow:

```text
index → app
app → views / pages / features / styles
views → pages / components
pages → features / components
```

## Directories

- `app/` owns Millennium integration, popup startup, cross-feature state, and apply
  coordination.
- `views/` composes complete screens without owning backend or persistence logic.
- `pages/` contains the content of each editor tab.
- `components/` holds reusable visual building blocks and the Base UI wrappers
  that add project-specific behavior. Views may use a primitive directly when a
  wrapper would add no value.
- `features/` contains domain models, catalogs, validation, and feature-specific
  backend adapters.
- `styles/` contains all CSS. TTC imports the entry SCSS files as strings so the
  app can install them into the independently owned `about:blank` popup document.
- `types/` contains non-runtime module declarations.

Feature modules must not import `app`, `views`, `pages`, or `components`. The
project uses direct imports instead of barrel files so dependency ownership stays
visible. Helpers remain beside the domain or component family they support; there
is no generic utility dumping ground.

## References

- [Millennium plugin file structure](https://docs.steambrew.app/plugins/structure/file-structure)
- [Bulletproof React project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)

## Shared standalone UI

`desktop/src/Editor.tsx` composes the same `EditorView`, pages and components with
launcher-specific state. `EditorView` accepts an optional OptiScaler capability;
the Steam controller supplies it, while standalone omits it. The standalone
environment page displays all keys rather than hiding OptiScaler keys behind a
tab it does not provide. Steam integration remains under `frontend/app/`.

SCSS tokens default to the original Steam palette. The standalone document sets
`data-lw-theme="desktop"` on its root, so both editor content and body-mounted
popup portals inherit the purple palette. Do not add product-specific colors to
shared components. The standalone build supplies its own React runtime; TTC
continues to use Steam's runtime for the plugin.
