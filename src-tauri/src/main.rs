// Hide the console window on Windows release builds. Without this, launching
// the app pops a black terminal behind it.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    starkeep_lib::run()
}
