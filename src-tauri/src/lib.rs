mod deadline;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

/// Must match the window label in `tauri.conf.json`.
const MAIN_WINDOW: &str = "main";

/// Must match `MINI_WINDOW_LABEL` in `src/shared/runtime/desktop.ts`.
const MINI_WINDOW: &str = "mini";

const TRAY_ID: &str = "starkeep-tray";

/// Set the tray's hover text, or reset it to the plain app name with `None`.
///
/// The tray lives in Rust rather than being driven entirely from JS because it
/// has to outlive the webview: the app sits in the tray with every window
/// hidden, at which point there is no JS running to own anything.
///
/// Windows has no persistent tray label, so this shows on hover. macOS menu
/// bars can display it inline.
#[tauri::command]
fn set_tray_status(app: tauri::AppHandle, text: Option<String>) -> Result<(), String> {
    let tray = app
        .tray_by_id(TRAY_ID)
        .ok_or_else(|| "tray icon not found".to_string())?;

    tray.set_tooltip(Some(&tray_tooltip(text.as_deref())))
        .map_err(|e| e.to_string())
}

fn tray_tooltip(status: Option<&str>) -> String {
    match status {
        Some(status) => format!("Starkeep — {status}"),
        None => "Starkeep".to_string(),
    }
}

/// Best-effort tooltip update for code that is not answering a command, such
/// as the deadline thread. Tray text is cosmetic, so failures are dropped.
pub(crate) fn set_tooltip(app: &tauri::AppHandle, status: Option<&str>) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(&tray_tooltip(status)));
    }
}

/// Bring the main window back from the tray, from a minimised state, or from
/// behind other windows — whichever it happens to be in.
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn run() {
    tauri::Builder::default()
        // Single instance must be registered first, so a second launch is
        // intercepted before any other plugin initialises. Two processes
        // sharing one IndexedDB would corrupt session state.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(deadline::DeadlineState::default())
        .invoke_handler(tauri::generate_handler![
            set_tray_status,
            deadline::arm_deadline,
            deadline::disarm_deadline
        ])
        .setup(|app| {
            let open_item = MenuItem::with_id(app, "open", "Open Starkeep", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_item, &quit_item])?;

            TrayIconBuilder::with_id(TRAY_ID)
                .icon(
                    app.default_window_icon()
                        .expect("bundled window icon is missing")
                        .clone(),
                )
                .tooltip("Starkeep")
                .menu(&menu)
                // Left click restores the window; the menu is right-click only,
                // which is the conventional Windows behaviour.
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                match window.label() {
                    // Closing the main window hides to tray instead of quitting.
                    // A session in progress must survive an accidental X, and
                    // quitting stays available from the tray menu.
                    MAIN_WINDOW => {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                    // The mini timer is a companion window; closing it really
                    // does mean close it.
                    MINI_WINDOW => {}
                    _ => {}
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Starkeep");
}
