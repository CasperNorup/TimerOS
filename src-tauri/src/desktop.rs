use serde::Serialize;
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{atomic::AtomicBool, atomic::Ordering, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{App, Manager, State};

pub struct Desktop {
    directory: PathBuf,
    signals: Mutex<Vec<Signal>>,
    storage: Mutex<()>,
    lock_tracking: AtomicBool,
    sleep_tracking: AtomicBool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Signal {
    kind: &'static str,
    active: bool,
    at: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedWorkspace {
    contents: Option<String>,
    closed_at: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Lifecycle {
    signals: Vec<Signal>,
    lock_tracking: bool,
    sleep_tracking: bool,
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let directory = app.path().app_data_dir()?;
    app.manage(Desktop {
        directory,
        signals: Mutex::new(Vec::new()),
        storage: Mutex::new(()),
        lock_tracking: AtomicBool::new(false),
        sleep_tracking: AtomicBool::new(false),
    });
    #[cfg(windows)]
    if let Some(window) = app.get_webview_window("main") {
        win::track(&window, app.handle());
    }
    Ok(())
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn read_optional(path: &Path) -> io::Result<Option<String>> {
    match fs::read_to_string(path) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

fn replace(directory: &Path, name: &str, payload: &[u8]) -> io::Result<()> {
    fs::create_dir_all(directory)?;
    let destination = directory.join(name);
    let temporary = destination.with_extension("tmp");
    let mut file = File::create(&temporary)?;
    file.write_all(payload)?;
    file.sync_all()?;
    drop(file);
    fs::rename(temporary, destination)
}

#[tauri::command]
pub fn load_workspace(state: State<'_, Desktop>) -> Result<LoadedWorkspace, String> {
    let _lock = state.storage.lock().map_err(|error| error.to_string())?;
    let contents = read_optional(&state.directory.join("workspace.json"))
        .map_err(|error| error.to_string())?;
    let exit_path = state.directory.join("last-exit.txt");
    let closed_at = read_optional(&exit_path)
        .map_err(|error| error.to_string())?
        .and_then(|text| text.parse().ok());
    if exit_path.exists() {
        fs::remove_file(exit_path).map_err(|error| error.to_string())?;
    }
    Ok(LoadedWorkspace {
        contents,
        closed_at,
    })
}

#[tauri::command]
pub fn save_workspace(state: State<'_, Desktop>, contents: String) -> Result<(), String> {
    if contents.len() > 1024 * 1024 {
        return Err("TimerOS data exceeded the local storage limit.".into());
    }
    let _lock = state.storage.lock().map_err(|error| error.to_string())?;
    replace(&state.directory, "workspace.json", contents.as_bytes())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn take_signals(state: State<'_, Desktop>) -> Result<Lifecycle, String> {
    let mut signals = state.signals.lock().map_err(|error| error.to_string())?;
    Ok(Lifecycle {
        signals: std::mem::take(&mut *signals),
        lock_tracking: state.lock_tracking.load(Ordering::Relaxed),
        sleep_tracking: state.sleep_tracking.load(Ordering::Relaxed),
    })
}

pub fn record_exit(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<Desktop>() {
        if let Ok(_lock) = state.storage.lock() {
            let _ = replace(&state.directory, "last-exit.txt", now().to_string().as_bytes());
        }
    }
}

#[cfg(windows)]
pub use win::single_instance;

#[cfg(windows)]
mod win {
    use super::*;
    use std::ffi::c_void;
    use std::ptr::null;

    const SUBCLASS_ID: usize = 1;
    const DESTROY: u32 = 0x0082;
    const SESSION_CHANGE: u32 = 0x02b1;
    const POWER_BROADCAST: u32 = 0x0218;

    type Hwnd = *mut c_void;
    type Procedure = unsafe extern "system" fn(Hwnd, u32, usize, isize, usize, usize) -> isize;

    #[link(name = "comctl32")]
    extern "system" {
        fn SetWindowSubclass(hwnd: Hwnd, procedure: Procedure, id: usize, data: usize) -> i32;
        fn RemoveWindowSubclass(hwnd: Hwnd, procedure: Procedure, id: usize) -> i32;
        fn DefSubclassProc(hwnd: Hwnd, message: u32, word: usize, long: isize) -> isize;
    }

    #[link(name = "wtsapi32")]
    extern "system" {
        fn WTSRegisterSessionNotification(hwnd: Hwnd, flags: u32) -> i32;
        fn WTSUnRegisterSessionNotification(hwnd: Hwnd) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateMutexW(attributes: *const c_void, owner: i32, name: *const u16) -> Hwnd;
        fn GetLastError() -> u32;
        fn CloseHandle(handle: Hwnd) -> i32;
    }

    pub struct Instance(Hwnd);

    impl Drop for Instance {
        fn drop(&mut self) {
            unsafe { CloseHandle(self.0) };
        }
    }

    pub fn single_instance(identifier: &str) -> io::Result<Option<Instance>> {
        let id = format!("Local\\{identifier}");
        let name: Vec<u16> = id.encode_utf16().chain([0]).collect();
        let handle = unsafe { CreateMutexW(null(), 0, name.as_ptr()) };
        if handle.is_null() {
            return Err(io::Error::last_os_error());
        }
        let existing = unsafe { GetLastError() } == 183;
        Ok((!existing).then_some(Instance(handle)))
    }

    pub fn track(window: &tauri::WebviewWindow, app: &tauri::AppHandle) {
        let Ok(handle) = window.hwnd() else {
            return;
        };
        let data = Box::into_raw(Box::new(app.clone()));
        // The HWND belongs to this thread. WM_NCDESTROY releases our AppHandle.
        if unsafe { SetWindowSubclass(handle.0, window_callback, SUBCLASS_ID, data as usize) } == 0 {
            unsafe { drop(Box::from_raw(data)) };
            return;
        }
        let state = app.state::<Desktop>();
        state.sleep_tracking.store(true, Ordering::Relaxed);
        state.lock_tracking.store(
            unsafe { WTSRegisterSessionNotification(handle.0, 0) } != 0,
            Ordering::Relaxed,
        );
    }

    unsafe extern "system" fn window_callback(
        hwnd: Hwnd,
        message: u32,
        word: usize,
        long: isize,
        id: usize,
        data: usize,
    ) -> isize {
        if message == DESTROY {
            WTSUnRegisterSessionNotification(hwnd);
            RemoveWindowSubclass(hwnd, window_callback, id);
            drop(Box::from_raw(data as *mut tauri::AppHandle));
            return DefSubclassProc(hwnd, message, word, long);
        }
        let event = match (message, word) {
            (SESSION_CHANGE, 0x07) => Some(("lock", true)),
            (SESSION_CHANGE, 0x08) => Some(("lock", false)),
            (POWER_BROADCAST, 0x04) => Some(("sleep", true)),
            (POWER_BROADCAST, 0x07 | 0x12) => Some(("sleep", false)),
            _ => None,
        };
        if let Some((kind, active)) = event {
            let app = &*(data as *const tauri::AppHandle);
            if let Some(state) = app.try_state::<Desktop>() {
                if let Ok(mut signals) = state.signals.lock() {
                    signals.push(Signal {
                        kind,
                        active,
                        at: now(),
                    });
                }
            }
        }
        DefSubclassProc(hwnd, message, word, long)
    }
}
