# AUR packaging

`launch-weaver-standalone-git` builds the standalone app from the default Git branch. It does not install the Millennium plugin. Its package version comes from `desktop/src-tauri/Cargo.toml`, followed by the repository revision count and commit.

Before publishing to AUR, push the standalone sources, lockfiles and `desktop/launch-weaver-standalone.desktop` to the upstream repository. Existing plugin release tags do not contain the standalone app. The AUR repository only needs `PKGBUILD` and `.SRCINFO`; the desktop entry and icons are installed from upstream source.

On Arch Linux with `base-devel` and an AUR-provided `bun` package installed:

```sh
makepkg -si
```

Run this from the directory containing `PKGBUILD`. Review and install any missing AUR build dependencies first; `makepkg -s` only resolves dependencies from configured pacman repositories. Bun and Cargo download locked dependencies in `prepare()`; the Rust build uses `--frozen`. The installed command is `launch-weaver-standalone`, also available from the desktop application menu.

Regenerate metadata after changing the recipe:

```sh
makepkg --printsrcinfo > .SRCINFO
```

Only x86_64 is currently declared. OptiScaler reset uses curl, tar, xz and md5sum; tar and coreutils are part of Arch's base environment. Launcher icons retain their upstream licenses, installed alongside the project's MIT license. No launcher is a hard dependency, so either launcher can be used independently.

Packaging follows the [Arch Rust guidelines](https://wiki.archlinux.org/title/Rust_package_guidelines).
