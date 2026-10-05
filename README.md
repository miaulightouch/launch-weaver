<p align="center">
  <img src="assets/icon.svg" alt="LaunchWeaver icon" width="112" height="112">
</p>

<h1 align="center">LaunchWeaver</h1>

<p align="center">
  A structured launch-options editor for the Millennium-powered Steam desktop client.
</p>

> [!CAUTION]
> **Vibe-coded toy project.** Experimental, unofficial, and unsupported. Use at your own risk.

## Standalone desktop app

A separate **Tauri app for Heroic and Faugus** lives in [`desktop/`](desktop/README.md). It shares the editor and design system with the Steam plugin, uses a purple theme, and does not depend on Steam or Millennium. Start it with `bun run desktop:dev`; see the desktop README for dependencies, supported settings, and current limits. The plugin instructions below still apply to Steam.

## What it does

LaunchWeaver adds an **Edit in LaunchWeaver** button to a game's Steam Properties page. The editor separates a launch command into four focused pages:

- **Environment** — compact rows for custom variables plus DXVK, vkd3d-proton, Proton, Proton-GE, Proton-EM, and Proton-CachyOS suggestions.
- **Wrappers** — ordered wrapper commands with quick-add entries for GameMode, MangoHud, DLSS Swapper, game-performance, and zink-run.
- **Parameters** — one game argument per row, including quoted or empty arguments.
- **OptiScaler** — direct editing of the installed `OptiScaler.ini`, comment-derived option help, per-version reset, backups, and fail-closed write checks.

Steam games and non-Steam shortcuts are supported. Each editor is an owned native popup whose title contains the game name, so multiple open editors remain distinguishable.

LaunchWeaver is designed primarily for Linux/Proton environments; its OptiScaler features work only with Proton-CachyOS.

## Safety model

- Existing launch options are parsed and round-tripped instead of being evaluated as shell code.
- Unsupported or ambiguous shell syntax is rejected rather than rewritten.
- `Apply` verifies that Steam's value has not changed, writes it, and confirms the readback; `Close` discards unapplied edits.
- OptiScaler writes verify the target path, refuse to edit a running game, create a backup, and use an atomic replacement.
- Reset downloads and verifies the exact installed OptiScaler release before restoring its defaults.

## Requirements

- Steam desktop client with [Millennium](https://github.com/SteamClientHomebrew/Millennium)
- A recent Bun release matching `package.json` for development
- LuaJIT for backend tests
- An existing game-specific `OptiScaler.ini` to use the OptiScaler page

Development and hands-on testing currently target Arch Linux with KDE Wayland. Other Linux desktops and Windows are not yet verified.

## Install a release

Download `launch-weaver-vX.Y.Z.zip` from the matching GitHub Release and extract it into Millennium's plugin directory. On Linux:

```bash
unzip launch-weaver-vX.Y.Z.zip -d ~/.local/share/millennium/plugins
```

The resulting path must be:

```text
~/.local/share/millennium/plugins/launch-weaver/
├── .millennium/Dist/
├── backend/
└── plugin.json
```

Restart Steam, or disable and re-enable LaunchWeaver in Millennium after replacing an existing version.

## Develop and build

```bash
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run build
```

The production frontend is written to `.millennium/Dist/`. During development, clone the repository anywhere and symlink it into Millennium's plugin directory:

```bash
ln -s "$PWD" ~/.local/share/millennium/plugins/launch-weaver
```

Rebuild and reload the plugin after frontend changes. See [frontend/README.md](frontend/README.md) for the dependency boundaries and directory responsibilities.

## Publish a release

The [release workflow](.github/workflows/release.yml) tests, builds, and uploads `launch-weaver-vX.Y.Z.zip` when a GitHub Release is published. Drafts do nothing.

1. Set the same version in `plugin.json` and `package.json`.
2. Commit and push that version.
3. Publish a Release for that commit with the matching `v`-prefixed tag, such as `v0.2.0`.

Version mismatches fail before packaging.

## Credits

Built with [Millennium](https://github.com/SteamClientHomebrew/Millennium) and [Base UI](https://github.com/mui/base-ui), with configuration data from [DXVK](https://github.com/doitsujin/dxvk), [vkd3d-proton](https://github.com/HansKristian-Work/vkd3d-proton), [Proton](https://github.com/ValveSoftware/Proton), and [OptiScaler](https://github.com/optiscaler/OptiScaler).

## License

LaunchWeaver is released under the [MIT License](LICENSE).
