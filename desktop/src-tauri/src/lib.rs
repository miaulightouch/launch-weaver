mod artwork;
pub mod optiscaler;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};

type Result<T> = std::result::Result<T, String>;
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Launcher {
    Heroic,
    Faugus,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub id: String,
    pub name: String,
    pub launcher: Launcher,
    pub source: String,
    pub has_cover: bool,
}
#[derive(Clone)]
struct Target {
    game: Game,
    path: PathBuf,
    key: String,
    cover: Option<String>,
}
#[derive(Default)]
pub struct Library {
    targets: Mutex<HashMap<String, Target>>,
}
#[derive(Serialize)]
pub struct Discovery {
    pub games: Vec<Game>,
    pub warnings: Vec<String>,
}
#[derive(Serialize)]
pub struct Document {
    pub game: Game,
    pub snapshot: String,
    pub settings: Value,
    pub defaults: Value,
}
#[derive(Serialize)]
pub struct Saved {
    pub document: Document,
    pub backup: String,
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn read(path: &Path) -> Result<Vec<u8>> {
    let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > 16 * 1024 * 1024 {
        return Err("Expected a regular configuration file smaller than 16 MiB.".into());
    }
    fs::read(path).map_err(|e| e.to_string())
}
fn parse(bytes: &[u8]) -> Result<Value> {
    serde_json::from_slice(bytes).map_err(|e| e.to_string())
}
fn section<'a>(value: &'a Value, target: &Target) -> Result<&'a Value> {
    match target.game.launcher {
        Launcher::Heroic => {
            if !matches!(
                value.get("version").and_then(Value::as_str),
                None | Some("v0") | Some("v0.1")
            ) {
                return Err("Unsupported Heroic configuration version.".into());
            }
            value
                .get(&target.key)
                .filter(|v| v.is_object())
                .ok_or("Missing Heroic game settings.".into())
        }
        Launcher::Faugus => {
            let rows = value
                .as_array()
                .ok_or("Unsupported Faugus configuration format.")?;
            let matches: Vec<_> = rows
                .iter()
                .filter(|v| v.get("gameid").and_then(Value::as_str) == Some(&target.key))
                .collect();
            if matches.len() != 1 {
                return Err("Missing or duplicate Faugus game ID.".into());
            }
            if matches[0].get("runner").and_then(Value::as_str) == Some("Steam") {
                return Err("Steam entries are handled by the Millennium plugin.".into());
            }
            Ok(matches[0])
        }
    }
}
fn defaults(target: &Target) -> Result<(Value, Vec<u8>)> {
    if target.game.launcher != Launcher::Heroic {
        return Ok((json!({}), vec![]));
    }
    let root = target
        .path
        .parent()
        .and_then(Path::parent)
        .ok_or("Invalid Heroic path.")?;
    // Match Heroic GlobalConfig.getSettings(): config.json.defaultSettings.
    let path = root.join("config.json");
    if path.exists() {
        let bytes = read(&path)?;
        let value = parse(&bytes)?;
        let settings = value
            .get("defaultSettings")
            .ok_or("Missing Heroic defaultSettings.")?;
        if !settings.is_object() {
            return Err("Unsupported Heroic global settings.".into());
        }
        return Ok((settings.clone(), bytes));
    }
    Ok((json!({}), vec![]))
}
fn document(target: &Target) -> Result<Document> {
    let bytes = read(&target.path)?;
    let value = parse(&bytes)?;
    let settings = section(&value, target)?.clone();
    let (defaults, global_bytes) = defaults(target)?;
    Ok(Document {
        game: target.game.clone(),
        snapshot: format!("{}:{}", digest(&bytes), digest(&global_bytes)),
        settings,
        defaults,
    })
}
fn add_target(
    out: &mut HashMap<String, Target>,
    launcher: Launcher,
    path: PathBuf,
    key: String,
    name: String,
    cover: Option<String>,
) -> Result<()> {
    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    if canonical != path {
        return Err(format!(
            "Symlinked configuration is not supported: {}",
            path.display()
        ));
    }
    let id = digest(format!("{}\0{}", path.display(), key).as_bytes());
    out.insert(
        id.clone(),
        Target {
            game: Game {
                id,
                name,
                launcher,
                source: path.display().to_string(),
                has_cover: cover.is_some(),
            },
            path,
            key,
            cover,
        },
    );
    Ok(())
}
fn heroic_metadata(root: &Path) -> HashMap<String, (String, Option<String>)> {
    let mut titles = HashMap::new();
    let Some(parent) = root.parent() else {
        return titles;
    };
    for (file, key) in [
        ("store_cache/legendary_library.json", "library"),
        ("store_cache/gog_library.json", "games"),
        ("store_cache/nile_library.json", "library"),
        ("sideload_apps/library.json", "games"),
    ] {
        let Ok(bytes) = read(&parent.join(file)) else {
            continue;
        };
        let Ok(value) = parse(&bytes) else {
            continue;
        };
        let Some(rows) = value.get(key).and_then(Value::as_array) else {
            continue;
        };
        for row in rows {
            if let (Some(id), Some(title)) = (
                row.get("app_name").and_then(Value::as_str),
                row.get("title").and_then(Value::as_str),
            ) {
                // Heroic uses art_square for portrait library cards; art_cover is the wide hero.
                let cover = ["art_square", "art_cover"]
                    .iter()
                    .find_map(|key| {
                        row.get(key)
                            .and_then(Value::as_str)
                            .filter(|s| !s.is_empty())
                    })
                    .map(str::to_owned);
                titles.insert(id.to_owned(), (title.to_owned(), cover));
            }
        }
    }
    titles
}
fn scan(
    launcher: Launcher,
    root: &Path,
    out: &mut HashMap<String, Target>,
    warnings: &mut Vec<String>,
) {
    if !root.exists() {
        return;
    }
    let result = (|| -> Result<()> {
        if launcher == Launcher::Heroic {
            let metadata = heroic_metadata(root);
            for entry in fs::read_dir(root).map_err(|e| e.to_string())? {
                let path = entry.map_err(|e| e.to_string())?.path();
                if path.extension().and_then(|v| v.to_str()) != Some("json") {
                    continue;
                }
                let outcome = (|| -> Result<()> {
                    let key = path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .ok_or("Invalid game ID.")?
                        .to_owned();
                    let value = parse(&read(&path)?)?;
                    if value.get(&key).is_none() {
                        return Ok(());
                    }
                    add_target(
                        out,
                        launcher.clone(),
                        path.clone(),
                        key.clone(),
                        metadata
                            .get(&key)
                            .map(|m| m.0.clone())
                            .unwrap_or(key.clone()),
                        metadata.get(&key).and_then(|m| m.1.clone()),
                    )
                })();
                if let Err(e) = outcome {
                    warnings.push(format!("{}: {e}", path.display()));
                }
            }
        } else {
            let value = parse(&read(root)?)?;
            let rows = value.as_array().ok_or("Expected a Faugus games array.")?;
            for row in rows {
                if row.get("runner").and_then(Value::as_str) == Some("Steam") {
                    continue;
                }
                let key = row
                    .get("gameid")
                    .and_then(Value::as_str)
                    .ok_or("Missing Faugus game ID.")?;
                let name = row.get("title").and_then(Value::as_str).unwrap_or(key);
                add_target(
                    out,
                    launcher.clone(),
                    root.to_owned(),
                    key.into(),
                    name.into(),
                    row.get("cover")
                        .and_then(Value::as_str)
                        .filter(|s| !s.is_empty())
                        .map(str::to_owned),
                )?;
            }
        }
        Ok(())
    })();
    if let Err(e) = result {
        warnings.push(format!("{}: {e}", root.display()));
    }
}
impl Library {
    pub fn read_optiscaler(&self, id: &str) -> Result<optiscaler::Document> {
        let targets = self.targets.lock().map_err(|e| e.to_string())?;
        optiscaler::load(
            targets
                .get(id)
                .ok_or("Game not found. Refresh the library.")?,
        )
    }
    pub fn save_optiscaler(
        &self,
        id: &str,
        snapshot: optiscaler::Snapshot,
        changes: Value,
        reset: bool,
    ) -> Result<optiscaler::Document> {
        let targets = self.targets.lock().map_err(|e| e.to_string())?;
        optiscaler::save(
            targets
                .get(id)
                .ok_or("Game not found. Refresh the library.")?,
            snapshot,
            changes,
            reset,
        )
    }
    pub fn discover(&self) -> Result<Discovery> {
        let home = PathBuf::from(std::env::var_os("HOME").ok_or("HOME is unavailable.")?);
        let config = std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or(home.join(".config"));
        let data = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or(home.join(".local/share"));
        let mut targets = self.targets.lock().map_err(|e| e.to_string())?;
        targets.clear();
        let mut warnings = vec![];
        for path in [
            config.join("heroic/GamesConfig"),
            home.join(".var/app/com.heroicgameslauncher.hgl/config/heroic/GamesConfig"),
        ] {
            scan(Launcher::Heroic, &path, &mut targets, &mut warnings);
        }
        for path in [
            data.join("faugus-launcher/games.json"),
            config.join("faugus-launcher/games.json"),
            home.join(".var/app/io.github.Faugus.faugus-launcher/data/faugus-launcher/games.json"),
            home.join(
                ".var/app/io.github.Faugus.faugus-launcher/config/faugus-launcher/games.json",
            ),
        ] {
            scan(Launcher::Faugus, &path, &mut targets, &mut warnings);
        }
        let mut games: Vec<_> = targets.values().map(|v| v.game.clone()).collect();
        games.sort_by(|a, b| {
            a.name
                .to_lowercase()
                .cmp(&b.name.to_lowercase())
                .then(a.source.cmp(&b.source))
        });
        Ok(Discovery { games, warnings })
    }
    pub fn cover(&self, id: &str) -> Result<Option<String>> {
        let target = self
            .targets
            .lock()
            .map_err(|e| e.to_string())?
            .get(id)
            .cloned()
            .ok_or("Game not found. Refresh the library.")?;
        let Some(source) = &target.cover else {
            return Ok(None);
        };
        let parent = target.path.parent().ok_or("Missing launcher directory.")?;
        let root = if target.game.launcher == Launcher::Heroic {
            parent.parent().ok_or("Missing Heroic directory.")?
        } else {
            parent
        };
        Ok(artwork::load(source, root))
    }
    pub fn load(&self, id: &str) -> Result<Document> {
        let targets = self.targets.lock().map_err(|e| e.to_string())?;
        document(
            targets
                .get(id)
                .ok_or("Game not found. Refresh the library.")?,
        )
    }
    pub fn save(&self, id: &str, snapshot: &str, patch: Value) -> Result<Saved> {
        let targets = self.targets.lock().map_err(|e| e.to_string())?;
        let target = targets
            .get(id)
            .ok_or("Game not found. Refresh the library.")?;
        ensure_launcher_closed(&target.game.launcher)?;
        save_target(target, snapshot, patch)
    }
}
fn ensure_launcher_closed(launcher: &Launcher) -> Result<()> {
    // Launcher processes cache settings. Refuse writes while they may overwrite us.
    let processes = fs::read_dir("/proc").map_err(|_| "Process detection requires Linux /proc.")?;
    for entry in processes.flatten() {
        if entry.file_name().to_string_lossy().parse::<u32>().is_err() {
            continue;
        }
        let Ok(cmdline) = fs::read(entry.path().join("cmdline")) else {
            continue;
        };
        let args: Vec<_> = cmdline
            .split(|b| *b == 0)
            .filter_map(|b| std::str::from_utf8(b).ok())
            .collect();
        let active = args.iter().any(|arg| {
            let name = Path::new(arg)
                .file_name()
                .and_then(|v| v.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            match launcher {
                Launcher::Heroic => {
                    name == "heroic"
                        || name.starts_with("heroic-")
                        || *arg == "com.heroicgameslauncher.hgl"
                }
                Launcher::Faugus => {
                    name == "faugus-launcher"
                        || name == "faugus-run"
                        || arg.starts_with("faugus.")
                        || *arg == "io.github.Faugus.faugus-launcher"
                }
            }
        });
        if active {
            return Err(
                "Close the launcher and its running games before applying changes, then retry."
                    .into(),
            );
        }
    }
    Ok(())
}
fn validate_patch(launcher: &Launcher, patch: &Value) -> Result<()> {
    let object = patch.as_object().ok_or("Expected settings object.")?;
    if object.is_empty() {
        return Err("No changes to apply.".into());
    }
    for (key, value) in object {
        let valid = match (launcher, key.as_str()) {
            (Launcher::Heroic, "enviromentOptions") => value.as_array().is_some_and(|rows| {
                rows.iter().all(|row| {
                    row.as_object().is_some_and(|o| o.len() == 2)
                        && row
                            .get("key")
                            .and_then(Value::as_str)
                            .is_some_and(valid_env_key)
                        && row
                            .get("value")
                            .and_then(Value::as_str)
                            .is_some_and(|s| !s.contains('\0'))
                })
            }),
            (Launcher::Heroic, "wrapperOptions") => value.as_array().is_some_and(|rows| {
                rows.iter().all(|row| {
                    row.as_object().is_some_and(|o| o.len() == 2)
                        && row
                            .get("exe")
                            .and_then(Value::as_str)
                            .is_some_and(|s| !s.is_empty() && !s.contains('\0'))
                        && row
                            .get("args")
                            .and_then(Value::as_str)
                            .is_some_and(|s| !s.contains('\0'))
                })
            }),
            (Launcher::Heroic, "launcherArgs")
            | (Launcher::Faugus, "launch_arguments" | "game_arguments") => {
                value.as_str().is_some_and(|s| !s.contains('\0'))
            }
            _ => false,
        };
        if !valid {
            return Err(format!("Invalid or unsupported setting: {key}"));
        }
    }
    Ok(())
}
fn valid_env_key(key: &str) -> bool {
    !key.is_empty()
        && key
            .bytes()
            .enumerate()
            .all(|(i, c)| c == b'_' || c.is_ascii_alphabetic() || (i > 0 && c.is_ascii_digit()))
}
fn save_target(target: &Target, snapshot: &str, patch: Value) -> Result<Saved> {
    validate_patch(&target.game.launcher, &patch)?;
    if target.path.canonicalize().map_err(|e| e.to_string())? != target.path {
        return Err("Configuration path changed.".into());
    }
    if document(target)?.snapshot != snapshot {
        return Err("Settings changed. Reload this game before applying.".into());
    }
    let original = read(&target.path)?;
    let mut value = parse(&original)?;
    section(&value, target)?;
    let settings = match target.game.launcher {
        Launcher::Heroic => value.get_mut(&target.key).unwrap(),
        Launcher::Faugus => value
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .find(|v| v.get("gameid").and_then(Value::as_str) == Some(&target.key))
            .unwrap(),
    };
    for (key, val) in patch.as_object().unwrap() {
        settings[key] = val.clone();
    }
    let bytes = serde_json::to_vec_pretty(&value).map_err(|e| e.to_string())?;
    let parent = target.path.parent().ok_or("Missing parent directory.")?;
    let permissions = fs::metadata(&target.path)
        .map_err(|e| e.to_string())?
        .permissions();
    let mut backup_name = target.path.as_os_str().to_os_string();
    backup_name.push(".bak");
    let backup_path = PathBuf::from(backup_name);
    let mut backup = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    backup
        .write_all(&original)
        .and_then(|_| backup.as_file().sync_all())
        .map_err(|e| e.to_string())?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temp.as_file()
        .set_permissions(permissions)
        .map_err(|e| e.to_string())?;
    temp.write_all(&bytes)
        .and_then(|_| temp.as_file().sync_all())
        .map_err(|e| e.to_string())?;
    // Recheck immediately before atomic replacement; no launcher locking protocol exists.
    if read(&target.path)? != original || document(target)?.snapshot != snapshot {
        return Err("Settings changed during save. Nothing was replaced.".into());
    }
    backup.persist(&backup_path).map_err(|e| e.to_string())?;
    temp.persist(&target.path).map_err(|e| e.to_string())?;
    fs::File::open(parent)
        .and_then(|f| f.sync_all())
        .map_err(|e| format!("Settings written, directory sync failed: {e}"))?;
    if read(&target.path)? != bytes {
        return Err("Settings written but readback differs. Reload before retrying.".into());
    }
    Ok(Saved {
        document: document(target)?,
        backup: backup_path.display().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(launcher: Launcher, value: Value) -> (tempfile::TempDir, Target) {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("GamesConfig");
        fs::create_dir(&folder).unwrap();
        let path = folder.join("game.json");
        fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();
        let target = Target {
            game: Game {
                id: "id".into(),
                name: "Test".into(),
                launcher,
                source: path.display().to_string(),
                has_cover: false,
            },
            path,
            key: "game".into(),
            cover: None,
        };
        (dir, target)
    }
    #[test]
    fn heroic_preserves_unknown_and_backs_up() {
        let (_dir, t) = fixture(
            Launcher::Heroic,
            json!({"game":{"winePrefix":"keep", "launcherArgs":"old"},"version":"v0.1","unknown":[1,2]}),
        );
        let old = read(&t.path).unwrap();
        let saved = save_target(
            &t,
            &document(&t).unwrap().snapshot,
            json!({"launcherArgs":"'hello world'"}),
        )
        .unwrap();
        assert_eq!(fs::read(saved.backup).unwrap(), old);
        let value = parse(&read(&t.path).unwrap()).unwrap();
        assert_eq!(value["game"]["winePrefix"], "keep");
        assert_eq!(value["unknown"], json!([1, 2]));
    }
    #[test]
    fn faugus_preserves_other_games() {
        let (_dir, t) = fixture(
            Launcher::Faugus,
            json!([{"gameid":"game","title":"One","runner":"Proton-GE","playtime":42},{"gameid":"other","game_arguments":"keep"}]),
        );
        save_target(
            &t,
            &document(&t).unwrap().snapshot,
            json!({"game_arguments":"-dx12"}),
        )
        .unwrap();
        let value = parse(&read(&t.path).unwrap()).unwrap();
        assert_eq!(value[0]["playtime"], 42);
        assert_eq!(value[1]["game_arguments"], "keep");
    }
    #[test]
    fn repeated_saves_replace_one_backup_with_previous_contents() {
        let (_dir, t) = fixture(
            Launcher::Heroic,
            json!({"game":{"launcherArgs":"original"}}),
        );
        let backup_path = t.path.with_file_name("game.json.bak");
        for args in ["first", "second", "third"] {
            let previous = read(&t.path).unwrap();
            let saved = save_target(
                &t,
                &document(&t).unwrap().snapshot,
                json!({"launcherArgs":args}),
            )
            .unwrap();
            assert_eq!(PathBuf::from(saved.backup), backup_path);
            assert_eq!(fs::read(&backup_path).unwrap(), previous);
            assert_eq!(fs::read_dir(t.path.parent().unwrap()).unwrap().count(), 2);
        }
    }
    #[test]
    fn rejects_stale_and_unrelated_patch() {
        let (_dir, t) = fixture(Launcher::Heroic, json!({"game":{}}));
        let snapshot = document(&t).unwrap().snapshot;
        fs::write(&t.path, b"{\"game\":{\"launcherArgs\":\"external\"}}").unwrap();
        assert!(save_target(&t, &snapshot, json!({"launcherArgs":"mine"})).is_err());
        assert!(save_target(
            &t,
            &document(&t).unwrap().snapshot,
            json!({"winePrefix":"bad"})
        )
        .is_err());
    }
    #[test]
    fn rejects_future_schema_duplicate_ids_and_steam() {
        let (_d, t) = fixture(Launcher::Heroic, json!({"game":{},"version":"v9"}));
        assert!(document(&t).is_err());
        let (_d, t) = fixture(
            Launcher::Faugus,
            json!([{"gameid":"game"},{"gameid":"game"}]),
        );
        assert!(document(&t).is_err());
        let (_d, t) = fixture(
            Launcher::Faugus,
            json!([{"gameid":"game","runner":"Steam"}]),
        );
        assert!(document(&t).is_err());
    }
    #[test]
    fn detects_global_settings_change() {
        let (dir, t) = fixture(Launcher::Heroic, json!({"game":{}}));
        let snapshot = document(&t).unwrap().snapshot;
        fs::write(
            dir.path().join("config.json"),
            b"{\"defaultSettings\":{\"launcherArgs\":\"inherited\"}}",
        )
        .unwrap();
        assert!(save_target(&t, &snapshot, json!({"launcherArgs":"mine"})).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn refuses_symlink_file() {
        let (dir, t) = fixture(Launcher::Heroic, json!({"game":{}}));
        let other = dir.path().join("other.json");
        fs::rename(&t.path, &other).unwrap();
        std::os::unix::fs::symlink(other, &t.path).unwrap();
        assert!(document(&t).is_err());
    }
    #[test]
    fn discovers_heroic_artwork_and_loads_faugus_cover_by_game_id() {
        let (heroic_dir, heroic) = fixture(Launcher::Heroic, json!({"game": {}}));
        let cache = heroic_dir.path().join("store_cache");
        fs::create_dir(&cache).unwrap();
        fs::write(cache.join("legendary_library.json"), serde_json::to_vec(&json!({
            "library": [{"app_name": "game", "title": "Cover game", "art_cover": "https://example.com/hero.jpg", "art_square": "https://example.com/portrait.jpg"}]
        })).unwrap()).unwrap();
        let mut targets = HashMap::new();
        let mut warnings = vec![];
        scan(
            Launcher::Heroic,
            heroic.path.parent().unwrap(),
            &mut targets,
            &mut warnings,
        );
        assert!(warnings.is_empty());
        let heroic_game = targets.values().next().unwrap().game.clone();
        assert_eq!(heroic_game.name, "Cover game");
        assert!(heroic_game.has_cover);
        let library = Library {
            targets: Mutex::new(targets),
        };
        assert_eq!(
            library.cover(&heroic_game.id).unwrap().as_deref(),
            Some("https://example.com/portrait.jpg")
        );
        assert!(library.cover("unregistered-path").is_err());

        let dir = tempfile::tempdir().unwrap();
        let cover = dir.path().join("cover.png");
        fs::write(&cover, include_bytes!("../icons/32x32.png")).unwrap();
        let path = dir.path().join("games.json");
        fs::write(
            &path,
            serde_json::to_vec(&json!([
                {"gameid": "local", "title": "Local cover", "cover": cover.to_str().unwrap()},
                {"gameid": "steam", "title": "Excluded", "runner": "Steam"}
            ]))
            .unwrap(),
        )
        .unwrap();
        let mut targets = HashMap::new();
        scan(Launcher::Faugus, &path, &mut targets, &mut warnings);
        assert!(warnings.is_empty());
        assert_eq!(targets.len(), 1);
        let game = targets.values().next().unwrap().game.clone();
        let library = Library {
            targets: Mutex::new(targets),
        };
        assert!(library
            .cover(&game.id)
            .unwrap()
            .unwrap()
            .starts_with("data:image/png;base64,"));
    }
}
