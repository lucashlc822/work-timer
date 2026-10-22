mod deadline;
mod no_service_worker;

use std::sync::atomic::{AtomicBool, Ordering};

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

    let tooltip = tray_tooltip(text.as_deref());
    #[cfg(debug_assertions)]
    native_log::tooltip(&tooltip);
    tray.set_tooltip(Some(&tooltip)).map_err(|e| e.to_string())
}

/// Debug builds only: what the app last asked Windows to show, for the
/// end-to-end tests (`e2e/desktop/native.spec.ts`). Windows offers no way for a
/// test to read a tray tooltip or a toast back, so the requests are recorded
/// here instead. Compiled out of release builds entirely, command included.
#[cfg(debug_assertions)]
pub(crate) mod native_log {
    use std::sync::Mutex;

    #[derive(Clone, serde::Serialize)]
    pub struct Notice {
        title: String,
        body: String,
    }

    #[derive(Clone, serde::Serialize)]
    pub struct Log {
        tooltip: Option<String>,
        notifications: Vec<Notice>,
    }

    static LOG: Mutex<Log> = Mutex::new(Log {
        tooltip: None,
        notifications: Vec::new(),
    });

    pub fn tooltip(text: &str) {
        if let Ok(mut log) = LOG.lock() {
            log.tooltip = Some(text.to_string());
        }
    }

    pub fn notification(title: &str, body: &str) {
        if let Ok(mut log) = LOG.lock() {
            log.notifications.push(Notice {
                title: title.to_string(),
                body: body.to_string(),
            });
        }
    }

    #[tauri::command]
    pub fn debug_native_log() -> Option<Log> {
        LOG.lock().ok().map(|log| log.clone())
    }
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
        let tooltip = tray_tooltip(status);
        #[cfg(debug_assertions)]
        native_log::tooltip(&tooltip);
        let _ = tray.set_tooltip(Some(&tooltip));
    }
}

/// What the main webview was last told about its own visibility.
static MAIN_WEBVIEW_VISIBLE: AtomicBool = AtomicBool::new(true);

/// Tell WebView2 whether the main window can actually be seen.
///
/// Hiding or minimising the *window* never reaches the WebView2 controller, so
/// without this the page reports `document.visibilityState === 'visible'`
/// while sitting in the tray: away time reads 0 and the repaint loop keeps
/// running for nobody. `Webview::hide`/`show` call the controller's
/// `SetIsVisible`, which is what makes WebView2 fire `visibilitychange` — and,
/// as WebView2 recommends for minimised apps, throttle the hidden page. The
/// session deadline is unaffected; it lives in a Rust thread (`deadline.rs`).
///
/// Deduplicated, because `Resized` fires continuously during a drag.
fn set_main_webview_visible(app: &tauri::AppHandle, visible: bool) {
    if MAIN_WEBVIEW_VISIBLE.swap(visible, Ordering::SeqCst) == visible {
        return;
    }
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let webview: &tauri::Webview = window.as_ref();
        let _ = if visible {
            webview.show()
        } else {
            webview.hide()
        };
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
    set_main_webview_visible(app, true);
}

pub fn run() {
    let builder = tauri::Builder::default()
        // Single instance must be registered first, so a second launch is
        // intercepted before any other plugin initialises. Two processes
        // sharing one IndexedDB would corrupt session state.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        // Retires a service worker an older build registered, before any page
        // script runs (see the module for why the exe has to do this).
        .plugin(no_service_worker::init())
        // Updates: the app checks the signed manifest named in tauri.conf.json
        // and, on the person's say-so, installs it and relaunches (the prompt
        // is in the frontend; it never offers one mid-session).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(deadline::DeadlineState::default());

    // The end-to-end tests' window into the tray and notifications exists in
    // debug builds only (see `native_log`).
    #[cfg(debug_assertions)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        set_tray_status,
        deadline::arm_deadline,
        deadline::disarm_deadline,
        native_log::debug_native_log
    ]);
    #[cfg(not(debug_assertions))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        set_tray_status,
        deadline::arm_deadline,
        deadline::disarm_deadline
    ]);

    builder
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
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => match window.label() {
                // Closing the main window hides to tray instead of quitting.
                // A session in progress must survive an accidental X, and
                // quitting stays available from the tray menu.
                MAIN_WINDOW => {
                    api.prevent_close();
                    let _ = window.hide();
                    set_main_webview_visible(window.app_handle(), false);
                }
                // The mini timer is a companion window; closing it really
                // does mean close it.
                MINI_WINDOW => {}
                _ => {}
            },
            // Minimise and restore both arrive as a resize. A hidden (tray)
            // window can also be resized, so visibility requires both.
            WindowEvent::Resized(_) if window.label() == MAIN_WINDOW => {
                let minimized = window.is_minimized().unwrap_or(false);
                let shown = window.is_visible().unwrap_or(true);
                set_main_webview_visible(window.app_handle(), shown && !minimized);
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running Starkeep");
}
