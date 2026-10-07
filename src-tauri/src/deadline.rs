//! The session deadline, owned by Rust rather than the webview.
//!
//! WebView2 throttles timers in hidden and minimised windows — which is exactly
//! the state the app is in when a completion notice matters most. A plain OS
//! thread is never throttled, so the deadline lives here: it keeps the tray
//! tooltip counting down by the minute and fires the notification at `ends_at`.
//!
//! The webview still decides *that* a session completed, from timestamps. This
//! module only owns the notice and the tray text. If the whole app was quit
//! through the deadline, nothing here runs and the webview's resume logic shows
//! the result on next launch instead.
//!
//! ## One deadline at a time
//!
//! Each `arm` bumps a generation counter and spawns a fresh thread tagged with
//! it. A thread whose generation is no longer current exits the next time it
//! wakes, without touching anything. Every tray write and the final "claim the
//! notice" step happen under the lock, so a stale thread can never overwrite a
//! newer arm's tooltip or fire a cancelled session's notice.
//!
//! The commands are `async` on purpose: synchronous Tauri commands run on the
//! main thread, and tray updates are dispatched *to* the main thread — a sync
//! command waiting on this lock while a worker holding it waits on the main
//! thread would deadlock.

use std::sync::Mutex;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, State};
use tauri_plugin_notification::NotificationExt;

const MINUTE_MS: u64 = 60_000;

/// Upper bound on any single sleep. `thread::sleep` on Windows does not count
/// time the machine spent suspended, so a long sleep across a lid-close would
/// wake late. Re-reading the wall clock every few seconds bounds that error.
const MAX_SLEEP_MS: u64 = 5_000;

#[derive(Default)]
struct Armed {
    generation: u64,
    session_id: Option<String>,
}

#[derive(Default)]
pub struct DeadlineState(Mutex<Armed>);

/// Whole minutes left, rounded up: with 30 seconds to go the tooltip says
/// "1 min left", not "0 min left".
pub fn minutes_left(remaining_ms: u64) -> u64 {
    remaining_ms.div_ceil(MINUTE_MS)
}

/// How long to sleep before the displayed minute count next changes, capped so
/// the wall clock is re-read regularly. Never zero while time remains.
pub fn next_wake_ms(remaining_ms: u64) -> u64 {
    let to_boundary = match remaining_ms % MINUTE_MS {
        0 => MINUTE_MS,
        partial => partial,
    };
    to_boundary.min(remaining_ms).clamp(1, MAX_SLEEP_MS)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| u64::try_from(d.as_millis()).unwrap_or(u64::MAX))
        .unwrap_or(0)
}

#[tauri::command]
pub async fn arm_deadline(
    app: AppHandle,
    state: State<'_, DeadlineState>,
    session_id: String,
    ends_at: u64,
    title: String,
    body: String,
) -> Result<(), String> {
    let generation = {
        let mut armed = state.0.lock().map_err(|e| e.to_string())?;
        armed.generation += 1;
        armed.session_id = Some(session_id);
        armed.generation
    };

    thread::spawn(move || watch(app, generation, ends_at, title, body));
    Ok(())
}

#[tauri::command]
pub async fn disarm_deadline(
    app: AppHandle,
    state: State<'_, DeadlineState>,
    session_id: String,
) -> Result<(), String> {
    let mut armed = state.0.lock().map_err(|e| e.to_string())?;
    if armed.session_id.as_deref() != Some(session_id.as_str()) {
        return Ok(());
    }
    armed.generation += 1;
    armed.session_id = None;
    crate::set_tooltip(&app, None);
    Ok(())
}

fn watch(app: AppHandle, generation: u64, ends_at: u64, title: String, body: String) {
    let state = app.state::<DeadlineState>();
    let mut shown_minutes: Option<u64> = None;

    loop {
        let remaining = ends_at.saturating_sub(now_ms());

        {
            let Ok(mut armed) = state.0.lock() else {
                return;
            };
            if armed.generation != generation {
                return;
            }

            if remaining == 0 {
                // Claim the notice under the lock, so a disarm racing the
                // deadline either wins outright or loses outright.
                armed.session_id = None;
                crate::set_tooltip(&app, None);
                drop(armed);
                let _ = app
                    .notification()
                    .builder()
                    .title(&title)
                    .body(&body)
                    .show();
                return;
            }

            let minutes = minutes_left(remaining);
            if shown_minutes != Some(minutes) {
                crate::set_tooltip(&app, Some(&format!("{minutes} min left")));
                shown_minutes = Some(minutes);
            }
        }

        thread::sleep(Duration::from_millis(next_wake_ms(remaining)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn minutes_round_up() {
        assert_eq!(minutes_left(1), 1);
        assert_eq!(minutes_left(30_000), 1);
        assert_eq!(minutes_left(60_000), 1);
        assert_eq!(minutes_left(60_001), 2);
        assert_eq!(minutes_left(25 * 60_000), 25);
    }

    #[test]
    fn wakes_at_the_next_minute_boundary_when_it_is_close() {
        // 24 min 3 s left: the display changes from 25 to 24 in 3 s.
        assert_eq!(next_wake_ms(24 * 60_000 + 3_000), 3_000);
    }

    #[test]
    fn caps_long_sleeps() {
        // Exactly on a boundary: next change is a full minute away, but capped.
        assert_eq!(next_wake_ms(25 * 60_000), MAX_SLEEP_MS);
        assert_eq!(next_wake_ms(24 * 60_000 + 40_000), MAX_SLEEP_MS);
    }

    #[test]
    fn never_sleeps_past_the_deadline() {
        assert_eq!(next_wake_ms(1_200), 1_200);
        assert_eq!(next_wake_ms(1), 1);
    }
}
