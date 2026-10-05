# LaunchWeaver standalone

Linux desktop editor for **Heroic Games Launcher and Faugus Launcher**. Steam remains the responsibility of the Millennium plugin. This app does not load Millennium, SteamClient, the plugin's Lua backend, or Steam's React runtime.

The standalone app and plugin share the React editor, components, catalogs, and SCSS design tokens. Steam keeps its blue palette; standalone uses the purple `data-lw-theme="desktop"` palette, including portals. Warning/error/info colors retain their meaning in both products.

Only one standalone instance runs per desktop session. Launching it again restores and focuses its existing window using Tauri's single-instance plugin. MangoHud and GameMode quick wrappers are omitted in standalone because both launchers provide their own controls; existing custom wrapper rows remain editable.

For Arch Linux/AUR packaging, see [`packaging/aur`](../packaging/aur/README.md).

Published GitHub releases include Linux x86_64 `.deb`, `.rpm`, and `.AppImage` standalone packages plus SHA-256 checksums, alongside the Millennium plugin ZIP. The release workflow builds the tagged source on Ubuntu 22.04; publishing a release triggers compilation and asset upload.

## Run and build

Install Bun matching the root `package.json`, a current stable Rust toolchain, and [Tauri's Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux). From the repository root:

```sh
bun install --frozen-lockfile
bun run desktop:dev
bun run desktop:build
```

The build creates Linux packages under `desktop/src-tauri/target/release/bundle/`. To build just the executable: `bun run desktop:build --no-bundle`. The desktop version is independent of the Steam plugin version.

```sh
bun run typecheck
bun run desktop:typecheck
bun run test
bun run desktop:test
bun run build
bun run desktop:web:build
```

`bun run desktop:web` offers a browser preview without filesystem access. `/preview.html` is a development-only editor fixture (no files connected); `/preview.html?view=library` previews cover cards and missing/broken-artwork fallbacks. Neither fixture is an entry in the production build.

## Supported behavior

- Discover existing Heroic game configuration files and Faugus library entries, including native and Flatpak locations.
- Cover cards identify Heroic/Faugus with the launcher icon in the top-right corner. Heroic portrait cards prefer `art_square` (the library/grid image), falling back to `art_cover` (the wide hero). HTTPS artwork is loaded from launcher metadata without a referrer; local artwork is read only inside the launcher directory and limited to raster images up to 8 MiB. Missing or failed artwork falls back to a theme-colored gradient cover with the full game title.
- Search/filter by launcher; Heroic titles come from known library caches when available, with game ID as a fallback.
- Edit environment variables, wrappers, and game arguments using the same pages as the Steam plugin.
- Heroic uses `enviromentOptions` (upstream spelling), `wrapperOptions`, and `launcherArgs`. Inherited settings come from `config.json.defaultSettings`; unchanged fields stay inherited rather than being copied into each game.
- Faugus uses `launch_arguments` for its environment/prefix and `game_arguments` for arguments. Existing wrapper chains appear as one prefix row because their command boundaries cannot be inferred reliably.
- Preserve unrelated fields and other games in shared files. No launcher commands or game commands are executed.
- Refuse stale edits, unknown schemas, symlinked config targets, and writes while the corresponding launcher is detected running. Each save atomically updates one adjacent `<config filename>.bak` with the previous contents, atomically replaces the config file, and verifies readback. Older `launchweaver-backup-*.json` files are not automatically removed.
- Reload settings or return to the library with an explicit discard prompt when edits are pending. Native close requests are also guarded.

Heroic discovery currently requires an existing `GamesConfig/<app-id>.json`. Save the game's settings once in Heroic if it is missing. It does not create new launcher entries or manage installations.

Faugus expands `$` and `~` before tokenization and extracts assignment-shaped tokens as environment variables, including from game arguments. Entries using those ambiguous constructs are not rewritten. Use Faugus itself to edit them. Steam runner entries in Faugus are excluded.

Launcher-managed toggles such as GameMode, MangoHud, gamescope, runner selection, and global environment files remain under the launcher's control. They may add options beyond the custom fields shown here. Close the launcher and its games before applying; process detection and a final snapshot check reduce conflicts but do not provide a cross-application transaction lock. Backups can be restored manually with the launcher closed.

The OptiScaler tab manages injection variables and the tracked Proton-CachyOS OptiScaler installation in Heroic's `winePrefix` or Faugus's `prefix`. Both direct Wine prefixes and Proton `pfx` layouts are supported. Injection still requires a compatible runner. Run the game once with OptiScaler enabled to install it; untracked/manual installations and custom prefix/config overrides are not edited.

INI edits preserve comments and spacing using the same pure `backend/ini.lua` parser as the plugin, embedded in the binary (no Millennium or system Lua required). Writes reject stale snapshots, symlinks, changed installations and running games, atomically replace the file, verify readback, and retain only `OptiScaler.ini.bak`. Removing an option or resetting the INI retrieves the exact installed-version defaults from the official proton-upscalers manifest, with archive size/checksum verification; this requires network access and `/usr/bin/curl`, `/usr/bin/tar` with xz support, and `/usr/bin/md5sum`. Ordinary value edits work offline.

When applying both INI and launcher edits, the INI is saved first. If the launcher save then fails, the UI reports the partial save and keeps the remaining edits for retry. Windows/macOS builds and actual launcher integration on other desktops have not been validated.

## Configuration locations

| Launcher | Native | Flatpak (relative to home) |
| --- | --- | --- |
| Heroic | `$XDG_CONFIG_HOME/heroic/GamesConfig` (default `~/.config`) | `.var/app/com.heroicgameslauncher.hgl/config/heroic/GamesConfig` |
| Faugus | `$XDG_DATA_HOME/faugus-launcher/games.json` (default `~/.local/share`); legacy `$XDG_CONFIG_HOME/faugus-launcher/games.json` | `.var/app/io.github.Faugus.faugus-launcher/data/faugus-launcher/games.json`; legacy `config/faugus-launcher/games.json` |

Heroic metadata caches are optional and read-only. Unsupported or malformed files produce warnings instead of preventing the remaining library from loading.

## Architecture and upstream references

- `src/model.ts`: independent launcher format adapters and POSIX-style token serialization; no Steam placeholder parsing.
- `src/Editor.tsx`: standalone state and save/reload coordination using shared `frontend/views/EditorView.tsx`.
- `src-tauri/src/lib.rs`: discovery, validated field patches, snapshots, backups and file operations; no arbitrary frontend-supplied file paths.
- `src-tauri/src/main.rs`: Tauri commands for discovery, settings load/save, and lazy artwork loading.

Schema work was checked against these source revisions rather than inferred from UI labels:

- [Heroic game configuration](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/blob/3934a83a0707baad23cd2c06bc94bd23f51e6622/src/backend/game_config.ts), [global defaults](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/blob/3934a83a0707baad23cd2c06bc94bd23f51e6622/src/backend/config.ts), [wrapper construction](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/blob/3934a83a0707baad23cd2c06bc94bd23f51e6622/src/backend/launcher.ts).
- [Faugus paths](https://github.com/Faugus/faugus-launcher/blob/0afa3814b45b0795c84f1337353a39c1f0437884/faugus/path_manager.py), [launch command and environment extraction](https://github.com/Faugus/faugus-launcher/blob/0afa3814b45b0795c84f1337353a39c1f0437884/faugus/runner.py), [saved fields and expansion](https://github.com/Faugus/faugus-launcher/blob/0afa3814b45b0795c84f1337353a39c1f0437884/faugus/utils.py).
