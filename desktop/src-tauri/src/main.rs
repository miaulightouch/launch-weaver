#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use launch_weaver_desktop::{Discovery, Document, Library, Saved};
use tauri::Manager;
#[tauri::command]
fn discover_games(library: tauri::State<'_, Library>) -> Result<Discovery, String> {
    library.discover()
}
#[tauri::command]
fn load_game(library: tauri::State<'_, Library>, id: String) -> Result<Document, String> {
    library.load(&id)
}
#[tauri::command]
fn load_cover(library: tauri::State<'_, Library>, id: String) -> Result<Option<String>, String> {
    library.cover(&id)
}
#[tauri::command]
fn save_game(
    library: tauri::State<'_, Library>,
    id: String,
    snapshot: String,
    patch: serde_json::Value,
) -> Result<Saved, String> {
    library.save(&id, &snapshot, patch)
}
fn fit_window(window: &tauri::Window) -> tauri::Result<()> {
    if window.is_maximized()? || window.is_fullscreen()? || window.is_minimized()? {
        return Ok(());
    }
    let monitor = window.current_monitor()?.or(window.primary_monitor()?);
    let Some(monitor) = monitor else {
        return Ok(());
    };
    let inner = window.inner_size()?;
    let outer = window.outer_size().unwrap_or(inner);
    let work = monitor.work_area();
    let size = launch_weaver_desktop::window_geometry::fit_size(
        (inner.width, inner.height),
        (work.size.width, work.size.height),
        monitor.scale_factor(),
        (
            outer.width.saturating_sub(inner.width),
            outer.height.saturating_sub(inner.height),
        ),
    );
    if size != (inner.width, inner.height) {
        window.set_size(tauri::PhysicalSize::new(size.0, size.1))?;
        // Wayland lets the compositor choose placement; resizing still applies.
        let _ = window.center();
    }
    Ok(())
}

fn main() {
    #[cfg(target_os = "linux")]
    glib::set_prgname(Some("LaunchWeaver"));
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let webview: &tauri::Webview = window.as_ref();
                fit_window(&webview.window())?;
                let _ = window.center();
                window.show()?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(
                event,
                tauri::WindowEvent::Resized(_)
                    | tauri::WindowEvent::Moved(_)
                    | tauri::WindowEvent::ScaleFactorChanged { .. }
            ) {
                if let Err(error) = fit_window(window) {
                    eprintln!("Could not fit window to monitor: {error}");
                }
            }
        })
        .manage(Library::default())
        .invoke_handler(tauri::generate_handler![
            discover_games,
            load_game,
            load_cover,
            save_game,
            read_optiscaler,
            save_optiscaler
        ])
        .run(tauri::generate_context!())
        .expect("Could not start LaunchWeaver");
}

#[tauri::command]
fn read_optiscaler(
    library: tauri::State<'_, Library>,
    id: String,
) -> Result<launch_weaver_desktop::optiscaler::Document, String> {
    library.read_optiscaler(&id)
}

#[tauri::command]
async fn save_optiscaler(
    app: tauri::AppHandle,
    id: String,
    snapshot: launch_weaver_desktop::optiscaler::Snapshot,
    changes: serde_json::Value,
    reset: bool,
) -> Result<launch_weaver_desktop::optiscaler::Document, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<Library>()
            .save_optiscaler(&id, snapshot, changes, reset)
    })
    .await
    .map_err(|e| e.to_string())?
}
