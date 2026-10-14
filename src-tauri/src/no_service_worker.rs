//! Retires any service worker an older build of the app left behind.
//!
//! The desktop app gets its frontend from the exe, so it has no use for the
//! offline cache the browser build's service worker provides — and it has a
//! real cost. A worker registered by one exe kept serving that exe's cached
//! files to the *next* exe, with no update prompt, so an updated app ran a
//! stale frontend. The frontend no longer registers a worker on desktop, but a
//! window already pinned to an old one runs the old frontend, which can never
//! fix itself. The rescue therefore has to come from here: this script is
//! injected into every webview before the page's own scripts run, including
//! pages a stale worker is about to serve.

use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

/// Best effort throughout: nothing here may stop the app from loading.
///
/// IndexedDB and localStorage hold the account's data and sign-in and are
/// never touched. The app uses CacheStorage for nothing but the worker's
/// precache, so every cache goes with it.
///
/// If the page was served by a worker, it is the old frontend, so reload once
/// to load the exe's own. The sessionStorage flag caps that at one reload per
/// window session, so a worker that somehow reappears can never cause a loop.
const SCRIPT: &str = r#"
(function () {
  try {
    if (!('serviceWorker' in navigator)) return;
    var controlled = navigator.serviceWorker.controller !== null;
    var done = function () {
      try {
        if (controlled && !sessionStorage.getItem('starkeep-sw-retired')) {
          sessionStorage.setItem('starkeep-sw-retired', '1');
          location.reload();
        }
      } catch (e) {}
    };
    var unregister = navigator.serviceWorker.getRegistrations().then(function (regs) {
      return Promise.all(regs.map(function (r) { return r.unregister(); }));
    });
    var clear = typeof caches === 'undefined'
      ? Promise.resolve()
      : caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (k) { return caches.delete(k); }));
        });
    Promise.all([unregister, clear]).then(done, done);
  } catch (e) {}
})();
"#;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("no-service-worker")
        .js_init_script(SCRIPT)
        .build()
}

#[cfg(test)]
mod tests {
    use super::SCRIPT;

    // The script is plain JS in a string, so a stray quote or brace would only
    // show up at runtime inside the webview. These pin the parts that matter.
    #[test]
    fn script_touches_only_workers_and_caches() {
        assert!(SCRIPT.contains("getRegistrations"));
        assert!(SCRIPT.contains("caches.delete"));
        for forbidden in ["indexedDB", "localStorage.clear", "localStorage.removeItem"] {
            assert!(!SCRIPT.contains(forbidden), "{forbidden} must never be touched");
        }
    }

    #[test]
    fn script_reload_is_capped_to_once() {
        assert!(SCRIPT.contains("starkeep-sw-retired"));
        assert_eq!(SCRIPT.matches("location.reload()").count(), 1);
    }

    #[test]
    fn script_braces_and_parens_balance() {
        for (open, close) in [('{', '}'), ('(', ')')] {
            assert_eq!(
                SCRIPT.matches(open).count(),
                SCRIPT.matches(close).count(),
                "unbalanced {open}{close}"
            );
        }
    }
}
