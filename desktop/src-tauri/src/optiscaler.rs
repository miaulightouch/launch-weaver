//! Standalone prefix resolution and file IO; the pure INI parser is shared with the plugin.
use super::*;
use mlua::{Lua, LuaSerdeExt, ObjectLike, Table};
use std::io::Read;
use std::process::{Command, Stdio};

const MAX_INI: usize = 2 * 1024 * 1024;
#[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
pub struct Snapshot {
    digest: String,
    exists: bool,
    size: usize,
    version: String,
}
#[derive(Serialize)]
pub struct Document {
    path: String,
    rows: Value,
    snapshot: Snapshot,
}
#[derive(PartialEq, Debug)]
struct Installation {
    prefix: PathBuf,
    path: PathBuf,
    version: String,
    identity: String,
}
fn lua_error(error: mlua::Error) -> String {
    error.to_string()
}
fn parser() -> Result<(Lua, Table)> {
    let lua = Lua::new();
    let parser = lua
        .load(include_str!("../../../backend/ini.lua"))
        .eval()
        .map_err(lua_error)?;
    Ok((lua, parser))
}
fn rows(contents: &str) -> Result<Value> {
    if contents.len() > MAX_INI || contents.contains('\0') {
        return Err("Invalid or oversized OptiScaler.ini.".into());
    }
    let (lua, parser) = parser()?;
    let (parsed, error): (Option<Table>, Option<String>) =
        parser.call_function("parse", contents).map_err(lua_error)?;
    let parsed = parsed.ok_or_else(|| error.unwrap_or("Invalid INI.".into()))?;
    let table: Table = parsed.get("rows").map_err(lua_error)?;
    let mut result = vec![];
    for row in table.sequence_values::<Table>() {
        result.push(
            lua.from_value::<Value>(mlua::Value::Table(row.map_err(lua_error)?))
                .map_err(lua_error)?,
        );
    }
    Ok(Value::Array(result))
}
fn patch(contents: &str, changes: &Value, defaults: Option<&str>) -> Result<String> {
    let (lua, parser) = parser()?;
    let (normalized, error): (Option<Table>, Option<String>) = parser
        .call_function(
            "normalize_changes",
            lua.to_value(changes).map_err(lua_error)?,
        )
        .map_err(lua_error)?;
    let normalized = normalized.ok_or_else(|| error.unwrap_or("Invalid changes.".into()))?;
    let (output, error): (Option<String>, Option<String>) = parser
        .call_function("patch", (contents, normalized, defaults))
        .map_err(lua_error)?;
    output.ok_or_else(|| error.unwrap_or("Could not patch INI.".into()))
}
fn resolve(target: &Target) -> Result<Installation> {
    let doc = document(target)?;
    let field = if target.game.launcher == Launcher::Heroic {
        "winePrefix"
    } else {
        "prefix"
    };
    let raw = doc
        .settings
        .get(field)
        .or_else(|| doc.defaults.get(field))
        .and_then(Value::as_str)
        .ok_or("No game prefix is configured in the launcher.")?;
    let expanded = if let Some(rest) = raw.strip_prefix("~/") {
        PathBuf::from(std::env::var_os("HOME").ok_or("HOME unavailable.")?).join(rest)
    } else {
        PathBuf::from(raw)
    };
    if !expanded.is_absolute() || raw.contains('$') {
        return Err("The game prefix must be an absolute path without variable expansion.".into());
    }
    // Overrides can redirect injection away from the tracked prefix. Never guess their target.
    for settings in [&doc.settings, &doc.defaults] {
        let text = settings.to_string();
        if [
            "PROTON_OPTISCALER_CONFIG",
            "WINEPREFIX=",
            "STEAM_COMPAT_DATA_PATH=",
        ]
        .iter()
        .any(|key| text.contains(key))
            || settings
                .get("enviromentOptions")
                .and_then(Value::as_array)
                .is_some_and(|env| {
                    env.iter().any(|row| {
                        matches!(
                            row["key"].as_str(),
                            Some("WINEPREFIX" | "STEAM_COMPAT_DATA_PATH")
                        )
                    })
                })
        {
            return Err("Custom prefix or OptiScaler config overrides must be removed before direct INI editing.".into());
        }
    }
    let prefix = expanded
        .canonicalize()
        .map_err(|_| "The game prefix does not exist. Run the game once first.")?;
    let tracker_path = prefix.join("upscaler_files");
    let tracker = read(&tracker_path).map_err(|_| {
        "No tracked OptiScaler installation found. Run the game once with OptiScaler enabled."
    })?;
    let tracker_json = parse(&tracker)?;
    let entries = tracker_json["opti_files"]
        .as_object()
        .filter(|v| !v.is_empty())
        .ok_or("OptiScaler version tracker is missing or invalid.")?;
    let mut version: Option<String> = None;
    for (path, value) in entries {
        let v = value["version"]
            .as_str()
            .ok_or("Missing OptiScaler version.")?;
        if !path.starts_with("drive_c/windows/system32/umu/")
            || v.split('.').count() < 3
            || !v
                .split('.')
                .all(|s| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()))
            || version.as_ref().is_some_and(|old| old != v)
        {
            return Err("Cannot determine the exact installed OptiScaler version.".into());
        }
        version = Some(v.into());
    }
    let mut locations = vec![];
    for relative in [
        "drive_c/windows/system32/umu",
        "pfx/drive_c/windows/system32/umu",
    ] {
        if let Ok(dir) = prefix.join(relative).canonicalize() {
            if !dir.starts_with(&prefix) {
                return Err("OptiScaler directory escapes the game prefix.".into());
            }
            if !locations.contains(&dir) {
                locations.push(dir);
            }
        }
    }
    if locations.len() != 1 {
        return Err("No unique OptiScaler installation directory found.".into());
    }
    let path = locations.remove(0).join("OptiScaler.ini");
    let identity = format!("{}:{}:{}", doc.snapshot, digest(&tracker), path.display());
    Ok(Installation {
        prefix,
        path,
        version: version.unwrap(),
        identity,
    })
}
fn contents(installation: &Installation) -> Result<Option<String>> {
    match fs::symlink_metadata(&installation.path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
        Ok(_) => {
            let bytes = read(&installation.path)?;
            if bytes.len() > MAX_INI {
                return Err("OptiScaler.ini is too large.".into());
            }
            String::from_utf8(bytes)
                .map(Some)
                .map_err(|e| e.to_string())
        }
    }
}
fn snapshot(installation: &Installation, contents: Option<&str>) -> Snapshot {
    Snapshot {
        digest: digest(format!("{}\0{}", installation.identity, contents.unwrap_or("")).as_bytes()),
        exists: contents.is_some(),
        size: contents.map_or(0, str::len),
        version: installation.version.clone(),
    }
}
pub(super) fn load(target: &Target) -> Result<Document> {
    let installation = resolve(target)?;
    let contents = contents(&installation)?;
    Ok(Document {
        path: installation.path.display().to_string(),
        rows: rows(contents.as_deref().unwrap_or(""))?,
        snapshot: snapshot(&installation, contents.as_deref()),
    })
}
fn stopped(target: &Target, installation: &Installation) -> Result<()> {
    ensure_launcher_closed(&target.game.launcher)?;
    use std::os::unix::fs::MetadataExt;
    let uid = fs::metadata("/proc/self").map_err(|e| e.to_string())?.uid();
    for entry in fs::read_dir("/proc").map_err(|e| e.to_string())?.flatten() {
        if entry.file_name().to_string_lossy().parse::<u32>().is_err() {
            continue;
        }
        let env = match fs::read(entry.path().join("environ")) {
            Ok(env) => env,
            Err(_)
                if entry.path().exists()
                    && fs::metadata(entry.path()).is_ok_and(|m| m.uid() == uid) =>
            {
                return Err("Could not check whether the game is running.".into())
            }
            Err(_) => continue,
        };
        for variable in env.split(|b| *b == 0) {
            let variable = String::from_utf8_lossy(variable);
            for key in [
                "WINEPREFIX=",
                "STEAM_COMPAT_DATA_PATH=",
                "HEROIC_GAME_PREFIX=",
            ] {
                if let Some(value) = variable.strip_prefix(key) {
                    if Path::new(value).canonicalize().is_ok_and(|path| {
                        path == installation.prefix || path.starts_with(&installation.prefix)
                    }) {
                        return Err("Close the game before editing OptiScaler.ini.".into());
                    }
                }
            }
        }
    }
    Ok(())
}
// Capture bounded stdout without extracting any archive paths onto disk.
fn output(command: &mut Command, limit: usize) -> Result<Vec<u8>> {
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    let mut bytes = vec![];
    let result = child
        .stdout
        .take()
        .unwrap()
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes);
    if result.is_err() || bytes.len() > limit {
        let _ = child.kill();
        let _ = child.wait();
        return Err("OptiScaler defaults exceeded the size limit.".into());
    }
    if !child.wait().map_err(|e| e.to_string())?.success() {
        return Err("Could not retrieve exact-version OptiScaler defaults.".into());
    }
    Ok(bytes)
}
fn download(url: &str, limit: usize) -> Result<Vec<u8>> {
    output(
        Command::new("/usr/bin/curl").args([
            "--fail",
            "--silent",
            "--show-error",
            "--location",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--max-time",
            "30",
            "--max-filesize",
            &limit.to_string(),
            url,
        ]),
        limit,
    )
}
fn exact_defaults(version: &str) -> Result<String> {
    let manifest = parse(&download(
        "https://loathingkernel.github.io/proton-upscalers/manifest.json",
        16 * 1024 * 1024,
    )?)?;
    let items: Vec<_> = manifest["optiscaler"]
        .as_array()
        .ok_or("Invalid OptiScaler manifest.")?
        .iter()
        .filter(|v| v["version"] == version)
        .collect();
    if items.len() != 1 {
        return Err("Installed OptiScaler version is absent from the official manifest.".into());
    }
    let item = items[0];
    let url =
        format!("https://loathingkernel.github.io/proton-upscalers/optiscaler_v{version}.tar.xz");
    if item["download_url"].as_str() != Some(&url) {
        return Err("Unexpected OptiScaler archive URL.".into());
    }
    let bytes = download(&url, 64 * 1024 * 1024)?;
    if item["zip_file_size"].as_u64() != Some(bytes.len() as u64) {
        return Err("OptiScaler archive size mismatch.".into());
    }
    let mut archive = tempfile::NamedTempFile::new().map_err(|e| e.to_string())?;
    archive.write_all(&bytes).map_err(|e| e.to_string())?;
    let checksum = output(Command::new("/usr/bin/md5sum").arg(archive.path()), 4096)?;
    if String::from_utf8_lossy(&checksum).split_whitespace().next() != item["zip_md5_hash"].as_str()
    {
        return Err("OptiScaler archive checksum mismatch.".into());
    }
    for name in ["OptiScaler.ini", "./OptiScaler.ini"] {
        if let Ok(bytes) = output(
            Command::new("/usr/bin/tar")
                .env_remove("TAR_OPTIONS")
                .args(["--extract", "--xz", "--to-stdout", "--file"])
                .arg(archive.path())
                .args(["--", name]),
            MAX_INI,
        ) {
            let text = String::from_utf8(bytes).map_err(|e| e.to_string())?;
            if rows(&text)?.as_array().is_some_and(|rows| !rows.is_empty()) {
                return Ok(text);
            }
        }
    }
    Err("Archive has no valid default OptiScaler.ini.".into())
}
pub(super) fn save(
    target: &Target,
    expected: Snapshot,
    changes: Value,
    reset: bool,
) -> Result<Document> {
    save_with(target, expected, changes, reset, stopped, exact_defaults)
}
fn save_with(
    target: &Target,
    expected: Snapshot,
    changes: Value,
    reset: bool,
    check_stopped: impl Fn(&Target, &Installation) -> Result<()>,
    get_defaults: impl Fn(&str) -> Result<String>,
) -> Result<Document> {
    let installation = resolve(target)?;
    check_stopped(target, &installation)?;
    let current = contents(&installation)?;
    if snapshot(&installation, current.as_deref()) != expected {
        return Err("OptiScaler settings changed. Reload before applying.".into());
    }
    let changes_array = changes
        .as_array()
        .ok_or("Expected OptiScaler changes array.")?;
    if reset && !changes_array.is_empty() {
        return Err("Reset does not accept changes.".into());
    }
    let needs_defaults = reset || changes_array.iter().any(|c| c["action"] == "remove");
    let defaults = if needs_defaults {
        Some(get_defaults(&installation.version)?)
    } else {
        None
    };
    let replacement = if reset {
        defaults.unwrap()
    } else {
        patch(
            current
                .as_deref()
                .ok_or("Reset missing OptiScaler.ini before editing.")?,
            &changes,
            defaults.as_deref(),
        )?
    };
    if current.as_deref() == Some(&replacement) {
        return load(target);
    }
    let parent = installation.path.parent().unwrap();
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    if current.is_some() {
        temp.as_file()
            .set_permissions(
                fs::metadata(&installation.path)
                    .map_err(|e| e.to_string())?
                    .permissions(),
            )
            .map_err(|e| e.to_string())?;
    }
    temp.write_all(replacement.as_bytes())
        .and_then(|_| temp.as_file().sync_all())
        .map_err(|e| e.to_string())?;
    check_stopped(target, &installation)?;
    if resolve(target)? != installation || contents(&installation)? != current {
        return Err("OptiScaler installation changed during save. Reload before applying.".into());
    }
    if let Some(original) = current {
        let mut backup = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
        backup
            .write_all(original.as_bytes())
            .and_then(|_| backup.as_file().sync_all())
            .map_err(|e| e.to_string())?;
        backup
            .persist(installation.path.with_file_name("OptiScaler.ini.bak"))
            .map_err(|e| e.to_string())?;
    }
    temp.persist(&installation.path)
        .map_err(|e| e.to_string())?;
    fs::File::open(parent)
        .and_then(|f| f.sync_all())
        .map_err(|e| e.to_string())?;
    if contents(&installation)?.as_deref() != Some(&replacement) {
        return Err("OptiScaler readback verification failed.".into());
    }
    load(target)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(launcher: Launcher, proton_layout: bool) -> (tempfile::TempDir, Target, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let prefix = dir.path().join("prefix");
        let ini = prefix.join(if proton_layout {
            "pfx/drive_c/windows/system32/umu/OptiScaler.ini"
        } else {
            "drive_c/windows/system32/umu/OptiScaler.ini"
        });
        fs::create_dir_all(ini.parent().unwrap()).unwrap();
        fs::write(
            prefix.join("upscaler_files"),
            br#"{"opti_files":{"drive_c/windows/system32/umu/dxgi.dll":{"version":"0.9.0"}}}"#,
        )
        .unwrap();
        fs::write(
            &ini,
            "; Help\r\n[General]\r\n; Enable feature\r\nOption = auto ; comment\r\nOther=true\r\n",
        )
        .unwrap();
        let root = dir.path().join("GamesConfig");
        fs::create_dir(&root).unwrap();
        let path = root.join("game.json");
        let value = match launcher {
            Launcher::Heroic => json!({"game":{"winePrefix":prefix}}),
            Launcher::Faugus => json!([{"gameid":"game","prefix":prefix}]),
        };
        fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();
        let target = Target {
            game: Game {
                id: "test".into(),
                name: "test".into(),
                launcher,
                source: path.display().to_string(),
                has_cover: false,
            },
            path,
            key: "game".into(),
            cover: None,
        };
        (dir, target, ini)
    }
    fn offline_save(
        target: &Target,
        snapshot: Snapshot,
        changes: Value,
        reset: bool,
    ) -> Result<Document> {
        save_with(
            target,
            snapshot,
            changes,
            reset,
            |_, _| Ok(()),
            |version| {
                assert_eq!(version, "0.9.0");
                Ok("[General]\nOption=auto\nOther=auto\n".into())
            },
        )
    }
    #[test]
    fn resolves_both_launcher_prefix_layouts_and_preserves_format() {
        for (launcher, layout) in [(Launcher::Heroic, true), (Launcher::Faugus, false)] {
            let (_dir, target, path) = fixture(launcher, layout);
            let doc = load(&target).unwrap();
            assert_eq!(doc.path, path.display().to_string());
            assert!(doc.rows[0]["description"]
                .as_str()
                .unwrap()
                .contains("Enable feature"));
            let original = fs::read(&path).unwrap();
            let saved = offline_save(
                &target,
                doc.snapshot,
                json!([{"action":"set","section":"General","option":"Option","value":"false"}]),
                false,
            )
            .unwrap();
            assert_eq!(
                fs::read(path.with_file_name("OptiScaler.ini.bak")).unwrap(),
                original
            );
            assert!(fs::read_to_string(&path)
                .unwrap()
                .contains("Option = false ; comment\r\n"));
            let previous = fs::read(&path).unwrap();
            offline_save(&target, saved.snapshot, json!([]), true).unwrap();
            assert_eq!(
                fs::read(path.with_file_name("OptiScaler.ini.bak")).unwrap(),
                previous
            );
            assert_eq!(fs::read_dir(path.parent().unwrap()).unwrap().count(), 2);
        }
    }
    #[test]
    fn rejects_stale_unknown_and_malformed_edits_without_writing() {
        let (_dir, target, path) = fixture(Launcher::Heroic, false);
        let doc = load(&target).unwrap();
        let original = fs::read(&path).unwrap();
        for changes in [
            json!([{"action":"set","section":"General","option":"Missing","value":"1"}]),
            json!([{"action":"set","section":"General","option":"Option","value":"1\nInjected=1"}]),
        ] {
            assert!(offline_save(&target, doc.snapshot.clone(), changes, false).is_err());
            assert_eq!(fs::read(&path).unwrap(), original);
        }
        fs::write(&path, "[General]\nOption=external\n").unwrap();
        assert!(offline_save(&target, doc.snapshot, json!([]), true).is_err());
        assert!(!path.with_file_name("OptiScaler.ini.bak").exists());
    }
    #[test]
    fn removes_using_exact_defaults_and_creates_missing_ini_on_reset() {
        let (_dir, target, path) = fixture(Launcher::Faugus, false);
        let doc = load(&target).unwrap();
        offline_save(
            &target,
            doc.snapshot,
            json!([{"action":"remove","section":"General","option":"Other"}]),
            false,
        )
        .unwrap();
        assert!(fs::read_to_string(&path)
            .unwrap()
            .contains("Other=auto\r\n"));
        fs::remove_file(&path).unwrap();
        let doc = load(&target).unwrap();
        assert!(!doc.snapshot.exists);
        assert_eq!(doc.rows, json!([]));
        offline_save(&target, doc.snapshot, json!([]), true).unwrap();
        assert!(path.exists());
    }
    #[test]
    fn refuses_symlinks_overrides_and_changed_prefix() {
        let (_dir, target, path) = fixture(Launcher::Heroic, false);
        let doc = load(&target).unwrap();
        let original = path.with_file_name("other.ini");
        fs::rename(&path, &original).unwrap();
        std::os::unix::fs::symlink(&original, &path).unwrap();
        assert!(load(&target).is_err());
        fs::remove_file(&path).unwrap();
        fs::rename(&original, &path).unwrap();
        let mut settings = parse(&read(&target.path).unwrap()).unwrap();
        settings["game"]["enviromentOptions"] =
            json!([{"key":"PROTON_OPTISCALER_CONFIG","value":"elsewhere"}]);
        fs::write(&target.path, serde_json::to_vec(&settings).unwrap()).unwrap();
        assert!(load(&target).is_err());
        settings["game"]
            .as_object_mut()
            .unwrap()
            .remove("enviromentOptions");
        settings["game"]["launcherArgs"] = json!("changed");
        fs::write(&target.path, serde_json::to_vec(&settings).unwrap()).unwrap();
        assert!(offline_save(&target, doc.snapshot, json!([]), true).is_err());
    }
    #[test]
    fn stops_before_write_if_game_starts_or_target_changes() {
        let (_dir, target, path) = fixture(Launcher::Faugus, false);
        let doc = load(&target).unwrap();
        let original = fs::read(&path).unwrap();
        let count = std::cell::Cell::new(0);
        let result = save_with(
            &target,
            doc.snapshot,
            json!([]),
            true,
            |_, _| {
                count.set(count.get() + 1);
                if count.get() > 1 {
                    Err("Game started".into())
                } else {
                    Ok(())
                }
            },
            |_| Ok("[General]\nOption=false\n".into()),
        );
        assert!(result.is_err());
        assert_eq!(fs::read(&path).unwrap(), original);
        assert!(!path.with_file_name("OptiScaler.ini.bak").exists());
    }
}
