use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[cfg(windows)]
mod windows;
#[cfg(windows)]
mod panel;

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Mini {
    enabled: bool,
    monitor: String,
    placement: String,
    free_x: f64,
    free_y: f64,
    opacity: u8,
    size: u32,
    color: String,
    text: String,
    accent: String,
    background_kind: String,
    background_end: String,
    gradient_direction: String,
    inherit_theme: bool,
    font: String,
    clock_scale: u32,
    clock_weight: String,
    roundness: u32,
    show_time: bool,
    show_progress: bool,
    show_phase: bool,
    show_rounds: bool,
    progress_style: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Frame {
    mini: Mini,
    active: bool,
    status: String,
    clock: String,
    phase: String,
    rounds: u64,
    progress: Option<f64>,
    shortcuts: [String; 5],
    reduced_motion: bool,
    #[serde(default)]
    language: String,
    #[serde(default)]
    alert: Option<Alert>,
    #[serde(default)]
    command: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Alert {
    token: String,
    label: String,
    target: String,
    monitor: String,
    enabled: bool,
    color: String,
    opacity: u8,
    style: String,
    fade_ms: u64,
    gap_ms: u64,
    count: u64,
    repeat: bool,
    chime: String,
    volume: u8,
}

#[derive(Clone, Debug, Serialize)]
struct DisplayInfo {
    id: String,
    name: String,
    primary: bool,
}

#[derive(Clone, Debug, Serialize)]
struct FreePosition {
    monitor: String,
    x: f64,
    y: f64,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    actions: Vec<&'static str>,
    displays: Vec<DisplayInfo>,
    shortcut_errors: Vec<Option<String>>,
    moving: bool,
    position: Option<FreePosition>,
    alert_active: bool,
    message: String,
}

#[tauri::command]
pub async fn present_desktop(app: AppHandle, frame: Frame) -> Result<Report, String> {
    #[cfg(windows)]
    {
        // Win32 windows, the tray and hotkeys belong to Tauri's main thread.
        let (send, receive) = std::sync::mpsc::channel();
        let handle = app.clone();
        app.run_on_main_thread(move || {
            let _ = send.send(windows::present(&handle, frame));
        })
        .map_err(|problem| problem.to_string())?;
        receive.recv_timeout(std::time::Duration::from_secs(5))
            .map_err(|_| "TimerOS desktop did not respond.".to_owned())
    }
    #[cfg(not(windows))]
    {
        let _ = (app, frame);
        Ok(Report::default())
    }
}

#[cfg(windows)]
pub use windows::{handle_message, install, keep_running_on_close, shutdown};
