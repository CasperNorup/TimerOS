use super::panel::{mix, rgb, wide, Bounds, Paint, Panel, Shape};
use super::{Alert, DisplayInfo, Frame, FreePosition, Report};
use std::cell::RefCell;
use std::mem::{size_of, zeroed};
use std::ptr::{null, null_mut};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use windows_sys::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM},
    Graphics::Gdi::{EnumDisplayMonitors, GetMonitorInfoW, MonitorFromWindow, HDC, HMONITOR,
        MONITORINFOEXW, MONITOR_DEFAULTTONEAREST},
    Media::Audio::{PlaySoundW, SND_MEMORY, SND_NODEFAULT, SND_SYNC},
    UI::{Input::KeyboardAndMouse::{RegisterHotKey, UnregisterHotKey, MOD_ALT, MOD_CONTROL,
            MOD_NOREPEAT, MOD_SHIFT},
        Shell::{Shell_NotifyIconW, NOTIFYICONDATAW, NIF_ICON, NIF_MESSAGE, NIF_TIP,
            NIM_ADD, NIM_DELETE, NIM_MODIFY},
        WindowsAndMessaging::*},
};

const TRAY_MESSAGE: u32 = WM_APP + 13;
const ALERT_TIMER: usize = 271;
const MIN_PULSE_MS: u64 = 2000;
const FADE_FRAME_MS: u32 = 16;
const WAIT_FRAME_MS: u32 = 100;
const ACTIONS: [&str; 5] = ["pause", "next", "mini", "open", "dismiss"];

#[link(name = "shcore")]
extern "system" {
    fn GetDpiForMonitor(monitor: HMONITOR, kind: i32, x: *mut u32, y: *mut u32) -> i32;
}

thread_local! {
    static DESKTOP: RefCell<Option<DesktopUi>> = const { RefCell::new(None) };
}

#[derive(Clone, Debug)]
struct Display {
    info: DisplayInfo,
    full: Bounds,
    work: Bounds,
    scale: f64,
}

fn displays() -> Vec<Display> {
    unsafe extern "system" fn collect(monitor: HMONITOR, _: HDC, _: *mut RECT, data: LPARAM) -> i32 {
        let list = &mut *(data as *mut Vec<Display>);
        let mut info: MONITORINFOEXW = zeroed();
        info.monitorInfo.cbSize = size_of::<MONITORINFOEXW>() as u32;
        if GetMonitorInfoW(monitor, &mut info.monitorInfo) == 0 { return 1; }
        let end = info.szDevice.iter().position(|ch| *ch == 0).unwrap_or(info.szDevice.len());
        let id = String::from_utf16_lossy(&info.szDevice[..end]);
        let primary = (info.monitorInfo.dwFlags & 1) != 0;
        let mut x = 96;
        let mut y = 96;
        let dpi = if GetDpiForMonitor(monitor, 0, &mut x, &mut y) == 0 { x } else { 96 };
        let name = id.trim_start_matches(r"\\.\").replace("DISPLAY", "Display ");
        list.push(Display {
            info: DisplayInfo { id, name, primary },
            full: Bounds::from_rect(info.monitorInfo.rcMonitor),
            work: Bounds::from_rect(info.monitorInfo.rcWork),
            scale: (dpi as f64 / 96.0).clamp(0.75, 4.0),
        });
        1
    }

    let mut list: Vec<Display> = Vec::new();
    unsafe {
        EnumDisplayMonitors(null_mut(), null(), Some(collect), &mut list as *mut Vec<Display> as LPARAM);
    }
    list.sort_by(|a, b| (!a.info.primary, &a.info.id).cmp(&(!b.info.primary, &b.info.id)));
    list
}

fn selected<'a>(displays: &'a [Display], id: &str) -> Option<&'a Display> {
    displays.iter().find(|display| display.info.id == id).or_else(|| displays.first())
}

struct Pulse {
    alert: Alert,
    start: Instant,
}

impl Pulse {
    fn timing(&self) -> (u64, u64) {
        let fade = self.alert.fade_ms.clamp(250, 2500);
        let period = (2 * fade + self.alert.gap_ms.min(5000)).max(MIN_PULSE_MS);
        (fade, period)
    }

    fn opacity(&self, now: Instant, reduced: bool) -> Option<(u64, u8)> {
        if now < self.start { return Some((0, 0)); }
        let (fade, period) = self.timing();
        let elapsed = now.duration_since(self.start).as_millis() as u64;
        let cycle = elapsed / period;
        if !self.alert.repeat && cycle >= self.alert.count.clamp(1, 6) { return None; }
        let cap = self.alert.opacity.clamp(5, 55) as f64 * 255.0 / 100.0;
        let step = elapsed % period;
        let level = if self.still(reduced) { 1.0 }
            else if step < fade { step as f64 / fade as f64 }
            else if step < 2 * fade { (2 * fade - step) as f64 / fade as f64 }
            else { 0.0 };
        let eased = level * level * (3.0 - 2.0 * level);
        Some((cycle, (cap * eased).round() as u8))
    }

    fn still(&self, reduced: bool) -> bool { reduced || self.alert.style == "static" }

    fn interval(&self, now: Instant, reduced: bool) -> u32 {
        let remaining = |ms: u64| ms.clamp(1, u64::from(WAIT_FRAME_MS)) as u32;
        if now < self.start { return remaining((self.start - now).as_millis() as u64); }
        let (fade, period) = self.timing();
        let step = (now - self.start).as_millis() as u64 % period;
        if !self.still(reduced) && step < 2 * fade { FADE_FRAME_MS }
        else { remaining(period - step) }
    }
}

struct DesktopUi {
    main: HWND,
    mini: Option<Panel>,
    overlays: Vec<Panel>,
    frame: Option<Frame>,
    displays: Vec<Display>,
    shortcuts: Option<[String; 5]>,
    shortcut_errors: Vec<Option<String>>,
    pulse: Option<Pulse>,
    alert_interval: Option<u32>,
    recent_pulse: Option<Instant>,
    last_token: String,
    message: String,
    moving: bool,
    quitting: bool,
    actions: Vec<&'static str>,
    tray: bool,
    taskbar_created: u32,
}

pub fn install(main: HWND) {
    DESKTOP.with(|cell| {
        let mut ui = DesktopUi {
            main, mini: None, overlays: Vec::new(), frame: None, displays: displays(),
            shortcuts: None, shortcut_errors: vec![None; 5], pulse: None, alert_interval: None, recent_pulse: None,
            last_token: String::new(), message: String::new(), moving: false, quitting: false, actions: Vec::new(),
            tray: false, taskbar_created: unsafe { RegisterWindowMessageW(wide("TaskbarCreated").as_ptr()) },
        };
        ui.tray = unsafe { Shell_NotifyIconW(NIM_ADD, &ui.tray_data()) } != 0;
        *cell.borrow_mut() = Some(ui);
    });
}

pub fn keep_running_on_close() -> Option<bool> {
    DESKTOP.with(|cell| {
        let ui = cell.try_borrow().ok()?;
        let ui = ui.as_ref()?;
        (!ui.quitting && ui.frame.as_ref()?.active).then_some(ui.tray)
    })
}

pub fn shutdown() { DESKTOP.with(|cell| { let _ = cell.try_borrow_mut().map(|mut ui| ui.take()); }); }

fn request_quit(app: &AppHandle) {
    let posted = DESKTOP.with(|cell| {
        let mut holder = cell.borrow_mut();
        let Some(ui) = holder.as_mut() else { return false };
        ui.quitting = true;
        ui.moving = false;
        ui.dismiss();
        ui.mini.take();
        // Let the main window follow the ordinary close and recovery lifecycle.
        unsafe { PostMessageW(ui.main, WM_CLOSE, 0, 0) != 0 }
    });
    if !posted { app.exit(0); }
}

impl Drop for DesktopUi {
    fn drop(&mut self) {
        unsafe {
            KillTimer(self.main, ALERT_TIMER);
            for id in 1..=5 { UnregisterHotKey(self.main, id); }
            if self.tray { Shell_NotifyIconW(NIM_DELETE, &self.tray_data()); }
        }
    }
}

pub fn present(app: &AppHandle, mut frame: Frame) -> Report {
    let command = frame.command.take();
    let alert = frame.alert.take();
    let report = DESKTOP.with(|cell| {
        let mut holder = cell.borrow_mut();
        let Some(ui) = holder.as_mut() else { return Report::default() };
        ui.displays = displays();
        ui.set_shortcuts(&frame.shortcuts);
        let mut position = None;
        match command.as_deref() {
            Some("move") => ui.moving = true,
            Some("save-move") | Some("cancel-move") if ui.moving => {
                ui.moving = false;
                if command.as_deref() == Some("save-move") {
                    position = ui.capture();
                }
                if let Some(mini) = &mut ui.mini { mini.forget_position(); }
                if let Some(position) = &position {
                    frame.mini.placement = "free".into();
                    frame.mini.monitor = position.monitor.clone();
                    frame.mini.free_x = position.x;
                    frame.mini.free_y = position.y;
                }
            }
            Some("dismiss") => ui.dismiss(),
            _ => {}
        }
        if let Some(alert) = alert { ui.begin_alert(alert); }
        let tip_changed = ui.frame.as_ref().is_none_or(|previous|
            previous.active != frame.active || previous.language != frame.language);
        ui.frame = Some(frame);
        if tip_changed { ui.update_tip(); }
        ui.render(Instant::now(), true);
        Report {
            actions: std::mem::take(&mut ui.actions),
            displays: ui.displays.iter().map(|screen| screen.info.clone()).collect(),
            shortcut_errors: ui.shortcut_errors.clone(),
            moving: ui.moving, position, alert_active: ui.pulse.is_some(), message: ui.message.clone(),
        }
    });
    match command.as_deref() {
        Some("start") => {
            if let Some(window) = app.get_webview_window("main") { let _ = window.minimize(); }
        }
        Some("quit") => request_quit(app),
        _ => {}
    }
    report
}

impl DesktopUi {
    fn capture(&self) -> Option<FreePosition> {
        let mini = self.mini.as_ref()?;
        let bounds = mini.current_bounds()?;
        let monitor = unsafe { MonitorFromWindow(mini.hwnd, MONITOR_DEFAULTTONEAREST) };
        let mut info: MONITORINFOEXW = unsafe { zeroed() };
        info.monitorInfo.cbSize = size_of::<MONITORINFOEXW>() as u32;
        if unsafe { GetMonitorInfoW(monitor, &mut info.monitorInfo) } == 0 { return None; }
        let work = Bounds::from_rect(info.monitorInfo.rcWork);
        let screen = self.displays.iter().find(|display| display.work == work)?;
        let (x, y) = work.relative_position(bounds, (screen.scale * 12.0).round() as i32);
        Some(FreePosition { monitor: screen.info.id.clone(), x, y })
    }

    fn set_shortcuts(&mut self, shortcuts: &[String; 5]) {
        if self.shortcuts.as_ref() == Some(shortcuts) { return; }
        for id in 1..=5 { unsafe { UnregisterHotKey(self.main, id); } }
        for (index, chord) in shortcuts.iter().enumerate() {
            self.shortcut_errors[index] = None;
            if chord.is_empty() { continue; }
            match parse_shortcut(chord) {
                Some((mods, key)) if unsafe { RegisterHotKey(self.main, index as i32 + 1, mods, key) } != 0 => {}
                _ => self.shortcut_errors[index] = Some(chord.clone()),
            }
        }
        self.shortcuts = Some(shortcuts.clone());
    }

    fn begin_alert(&mut self, alert: Alert) {
        if self.last_token == alert.token { return; }
        self.last_token = alert.token.clone();
        self.message = if alert.enabled || (alert.volume > 0 && alert.chime != "none") {
            alert.label.clone()
        } else { String::new() };
        self.pulse = None;
        self.overlays.clear();
        if alert.volume > 0 && alert.chime != "none" { play_chime(&alert.chime, alert.volume); }
        if alert.enabled {
            let now = Instant::now();
            let start = self.recent_pulse.map(|last| last + Duration::from_millis(MIN_PULSE_MS))
                .map_or(now, |next| next.max(now));
            self.pulse = Some(Pulse { alert, start });
        }
        self.update_tip();
    }

    fn dismiss(&mut self) {
        self.message.clear();
        self.pulse = None;
        self.overlays.clear();
        self.arm_alert(None);
        self.update_tip();
    }

    fn arm_alert(&mut self, interval: Option<u32>) {
        if self.alert_interval == interval { return; }
        unsafe {
            if let Some(ms) = interval { SetTimer(self.main, ALERT_TIMER, ms, None); }
            else { KillTimer(self.main, ALERT_TIMER); }
        }
        self.alert_interval = interval;
    }

    fn label<'a>(&self, en: &'a str, da: &'a str) -> &'a str {
        if self.frame.as_ref().is_some_and(|frame| frame.language == "da") { da } else { en }
    }

    fn render(&mut self, now: Instant, refresh_mini: bool) {
        if self.quitting { return; }
        let mini_cue = self.pulse.as_ref().is_some_and(|pulse| pulse.alert.target == "mini");
        let mut interval = None;
        let mut tint = None;
        let mut done = false;
        if let Some(pulse) = &self.pulse {
            let reduced = self.frame.as_ref().is_some_and(|f| f.reduced_motion);
            if let Some((cycle, opacity)) = pulse.opacity(now, reduced) {
                interval = Some(pulse.interval(now, reduced));
                if opacity > 0 {
                    let onset = pulse.start + Duration::from_millis(cycle * pulse.timing().1);
                    self.recent_pulse = Some(onset);
                }
                let color = rgb(&pulse.alert.color, 0x00ff8833);
                if pulse.alert.target == "mini" {
                    if opacity > 0 { tint = Some((color, opacity)); }
                    self.overlays.clear();
                } else {
                    let monochrome = pulse.alert.style == "edge";
                    let area = if pulse.alert.target == "selected" {
                        selected(&self.displays, &pulse.alert.monitor).map_or(&[][..], std::slice::from_ref)
                    } else { &self.displays[..] };
                    self.overlays.truncate(area.len());
                    while self.overlays.len() < area.len() {
                        if let Some(panel) = Panel::new("TimerOS Screen Alert") { self.overlays.push(panel); }
                        else { break; }
                    }
                    for (panel, display) in self.overlays.iter_mut().zip(area) {
                        panel.draw(Paint { color, ..Paint::default() });
                        let shape = if monochrome { Shape::Edge((display.scale * 16.0).round() as i32) }
                            else { Shape::Rect };
                        panel.move_to(display.full, shape, true);
                        panel.show(opacity > 0, opacity);
                    }
                }
            } else { done = true; }
        }
        if done {
            self.pulse = None;
            self.overlays.clear();
        }
        self.arm_alert(interval);
        if refresh_mini || mini_cue { self.render_mini(tint); }
    }

    fn render_mini(&mut self, tint: Option<(u32, u8)>) {
        let Some(frame) = &self.frame else { return };
        let prefs = &frame.mini;
        let cue_on_mini = self.pulse.as_ref().is_some_and(|pulse| pulse.alert.target == "mini");
        if !self.moving && !cue_on_mini && !(frame.active && prefs.enabled) {
            if let Some(mini) = &mut self.mini { mini.show(false, 0); }
            return;
        }
        let Some(screen) = selected(&self.displays, &prefs.monitor) else {
            if let Some(mini) = &mut self.mini { mini.show(false, 0); }
            return;
        };
        let scale = screen.scale * prefs.size.clamp(75, 160) as f64 / 100.0;
        let padding = (12.0 * screen.scale).round() as i32;
        let (x, y) = match prefs.placement.as_str() {
            "left" => (0.0, 1.0),
            "center" => (0.5, 1.0),
            "free" => (prefs.free_x, prefs.free_y),
            _ => (1.0, 1.0),
        };
        let mut detail = Vec::new();
        if self.moving { detail.push(self.label("Drag to move", "Træk for at flytte").to_owned()); }
        else {
            if prefs.show_phase { detail.push(frame.phase.clone()); }
            if prefs.show_rounds { detail.push(format!("{} {}", frame.rounds, self.label("rounds", "runder"))); }
            if !frame.active && cue_on_mini { detail.push(self.message.clone()); }
        }
        let clock_scale = prefs.clock_scale.clamp(80, 140) as f64 / 100.0;
        let extra = (clock_scale - 1.0).max(0.0);
        let height = if detail.is_empty() { 43.0 } else { 58.0 } + 24.0 * extra;
        let width = 164.0 + 68.0 * extra;
        let bounds = screen.work.place((width * scale).round() as i32,
            (height * scale).round() as i32, padding, x, y);
        let existing = self.mini.is_some();
        if self.mini.is_none() { self.mini = Panel::new("TimerOS Mini Timer"); }
        let Some(mini) = self.mini.as_mut() else { return };
        let bg = rgb(&prefs.color, 0x00351e11);
        let tint_color = |bg| tint.map_or(bg, |(color, alpha)| mix(bg, color, alpha));
        let gradient = (!prefs.inherit_theme && prefs.background_kind == "gradient")
            .then(|| (tint_color(rgb(&prefs.background_end, bg)), prefs.gradient_direction == "vertical"));
        let show_clock = prefs.show_time
            || (frame.active && frame.progress.is_none() && !prefs.show_phase && !prefs.show_rounds);
        mini.draw(Paint {
            color: tint_color(bg), text: rgb(&prefs.text, 0x00ffffff), accent: rgb(&prefs.accent, 0x00ffb173),
            clock: if show_clock && (frame.active || self.moving) { frame.clock.clone() } else { String::new() },
            detail: detail.join(" · "),
            progress: if prefs.show_progress { frame.progress.map(|p| p.clamp(0.0, 1.0)) } else { None },
            thin: prefs.progress_style == "line", movable: self.moving, scale,
            gradient, clock_scale, font: prefs.font.clone(),
            clock_weight: match prefs.clock_weight.as_str() { "regular" => 400, "bold" => 750, _ => 650 },
        });
        let rounding = prefs.roundness.min(24);
        let shape = if rounding == 0 { Shape::Rect } else { Shape::Round((rounding as f64 * scale).round() as i32) };
        mini.move_to(bounds, shape, !self.moving || !existing);
        mini.show(true, ((prefs.opacity.clamp(35, 100) as u16 * 255) / 100) as u8);
    }

    fn tray_data(&self) -> NOTIFYICONDATAW {
        let mut data: NOTIFYICONDATAW = unsafe { zeroed() };
        data.cbSize = size_of::<NOTIFYICONDATAW>() as u32;
        data.hWnd = self.main;
        data.uID = 1;
        data.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
        data.uCallbackMessage = TRAY_MESSAGE;
        unsafe {
            data.hIcon = SendMessageW(self.main, WM_GETICON, ICON_SMALL2 as usize, 0) as HICON;
            if data.hIcon.is_null() { data.hIcon = GetClassLongPtrW(self.main, GCLP_HICONSM) as HICON; }
            if data.hIcon.is_null() { data.hIcon = LoadIconW(null_mut(), IDI_APPLICATION); }
        }
        let label = if !self.message.is_empty() { format!("TimerOS · {}", self.message) }
            else if self.frame.as_ref().is_some_and(|f| f.active) { self.label("TimerOS · Session active", "TimerOS · Session i gang").into() }
            else { "TimerOS".into() };
        let capacity = data.szTip.len() - 1;
        for (target, ch) in data.szTip.iter_mut().zip(label.encode_utf16().take(capacity)) {
            *target = ch;
        }
        data
    }

    fn update_tip(&self) {
        if self.tray { unsafe { Shell_NotifyIconW(NIM_MODIFY, &self.tray_data()); } }
    }

    fn tray_menu(&self) -> usize {
        unsafe {
            let menu = CreatePopupMenu();
            if menu.is_null() { return 0; }
            let active = self.frame.as_ref().is_some_and(|f| f.active);
            let ready = self.frame.as_ref().is_some_and(|f| f.status == "ready");
            let paused = self.frame.as_ref().is_some_and(|f| f.status == "paused");
            let item = |id, label, enabled| {
                AppendMenuW(menu, MF_STRING | if enabled { 0 } else { MF_GRAYED }, id, wide(label).as_ptr())
            };
            item(4, self.label("Open TimerOS", "Åbn TimerOS"), true);
            item(1, if paused { self.label("Resume", "Fortsæt") } else { "Pause" }, active && !ready);
            item(2, self.label("Start next interval", "Start næste interval"), ready);
            item(3, self.label("Show / Hide mini timer", "Vis eller skjul minitimer"), true);
            item(5, self.label("Dismiss alert", "Luk besked"), !self.message.is_empty());
            AppendMenuW(menu, MF_SEPARATOR, 0, null());
            item(6, self.label("Quit TimerOS", "Afslut TimerOS"), true);
            let mut point = POINT::default();
            GetCursorPos(&mut point);
            SetForegroundWindow(self.main);
            let result = TrackPopupMenu(menu, TPM_RETURNCMD | TPM_NONOTIFY | TPM_RIGHTBUTTON,
                point.x, point.y, 0, self.main, null()) as usize;
            PostMessageW(self.main, WM_NULL, 0, 0);
            DestroyMenu(menu);
            result
        }
    }
}

pub fn handle_message(app: &AppHandle, message: u32, w: WPARAM, l: LPARAM) -> Option<LRESULT> {
    let outcome = DESKTOP.with(|cell| {
        let mut holder = cell.try_borrow_mut().ok()?;
        let ui = holder.as_mut()?;
        let key = if message == WM_HOTKEY && (1..=5).contains(&w) { w }
            else if message == TRAY_MESSAGE {
                match l as u32 { WM_LBUTTONUP | WM_LBUTTONDBLCLK => 4, WM_RBUTTONUP => ui.tray_menu(), _ => 0 }
            } else {
                match message {
                    WM_TIMER if w == ALERT_TIMER => {
                        ui.render(Instant::now(), false);
                        return Some(0);
                    }
                    WM_DISPLAYCHANGE | WM_SETTINGCHANGE => {
                        ui.displays = displays();
                        ui.render(Instant::now(), true);
                        return None;
                    }
                    _ if message == ui.taskbar_created && message != 0 => {
                        ui.tray = unsafe { Shell_NotifyIconW(NIM_ADD, &ui.tray_data()) } != 0;
                        return Some(0);
                    }
                    _ => return None,
                }
            };
        match key {
            1..=3 => ui.actions.push(ACTIONS[key - 1]),
            5 => { ui.dismiss(); ui.render(Instant::now(), true); }
            _ => {}
        }
        Some(key)
    });
    match outcome? {
        4 => {
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.show();
                let _ = main.unminimize();
                let _ = main.set_focus();
            }
        }
        6 => request_quit(app),
        _ => {}
    }
    Some(0)
}

fn parse_shortcut(text: &str) -> Option<(u32, u32)> {
    let (mods, key) = text.rsplit_once('+')?;
    let mut bits = MOD_NOREPEAT;
    for token in mods.split('+') {
        let flag = match token { "Alt" => MOD_ALT, "Ctrl" => MOD_CONTROL, "Shift" => MOD_SHIFT, _ => return None };
        if bits & flag != 0 { return None; }
        bits |= flag;
    }
    if bits & (MOD_ALT | MOD_CONTROL) == 0 { return None; }
    if let Some(f) = key.strip_prefix('F').and_then(|f| f.parse::<u32>().ok()) {
        return (1..=12).contains(&f).then_some((bits, 0x6f + f));
    }
    let bytes = key.as_bytes();
    (bytes.len() == 1 && (bytes[0].is_ascii_uppercase() || bytes[0].is_ascii_digit()))
        .then(|| (bits, u32::from(bytes[0])))
}

fn play_chime(sound: &str, volume: u8) {
    let notes: &[f64] = match sound {
        "low" => &[392.0], "bright" => &[587.33], "double" => &[523.25, 659.25], _ => return,
    };
    let amplitude = f64::from(volume.min(100)) / 100.0 * 5000.0;
    std::thread::spawn(move || {
        let rate: u32 = 16_000;
        let samples = 3_520 * notes.len() as u32;
        let bytes = 2 * samples;
        let mut wave = Vec::with_capacity((44 + bytes) as usize);
        wave.extend_from_slice(b"RIFF");
        wave.extend_from_slice(&(36 + bytes).to_le_bytes());
        wave.extend_from_slice(b"WAVEfmt ");
        wave.extend_from_slice(&16_u32.to_le_bytes());
        wave.extend_from_slice(&[1, 0, 1, 0]);
        wave.extend_from_slice(&rate.to_le_bytes());
        wave.extend_from_slice(&(2 * rate).to_le_bytes());
        wave.extend_from_slice(&[2, 0, 16, 0]);
        wave.extend_from_slice(b"data");
        wave.extend_from_slice(&bytes.to_le_bytes());
        for tone in notes {
            for sample in 0..3520 {
                let t = sample as f64 / rate as f64;
                let envelope = (t / 0.014).min(1.0) * (1.0 - t / 0.22).max(0.0).powi(2);
                let pcm = (amplitude * envelope * (std::f64::consts::TAU * tone * t).sin()) as i16;
                wave.extend_from_slice(&pcm.to_le_bytes());
            }
        }
        unsafe { PlaySoundW(wave.as_ptr().cast(), null_mut(), SND_SYNC | SND_MEMORY | SND_NODEFAULT); }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pulse_cadence_is_bounded_and_finite_alerts_finish() {
        let start = Instant::now();
        let alert = Alert {
            token: "test".to_owned(), label: "Break".to_owned(), target: "all".to_owned(),
            monitor: String::new(), enabled: true, color: "#3344ff".into(), opacity: 22,
            style: "fade".into(), fade_ms: 250, gap_ms: 0, count: 2, repeat: false,
            chime: "none".into(), volume: 0,
        };
        let pulse = Pulse { alert, start };
        assert_eq!(pulse.timing(), (250, 2000));
        assert_eq!(pulse.opacity(start, false), Some((0, 0)));
        assert_eq!(pulse.interval(start, false), FADE_FRAME_MS);
        assert_eq!(pulse.interval(start, true), WAIT_FRAME_MS);
        assert!(pulse.opacity(start + Duration::from_millis(62), false).unwrap().1 < 11);
        assert!(pulse.opacity(start + Duration::from_millis(250), false).unwrap().1 > 0);
        assert_eq!(pulse.opacity(start + Duration::from_millis(375), false),
            pulse.opacity(start + Duration::from_millis(125), false));
        assert_eq!(pulse.opacity(start + Duration::from_millis(1000), false), Some((0, 0)));
        assert_eq!(pulse.interval(start + Duration::from_millis(1000), false), WAIT_FRAME_MS);
        assert!(pulse.opacity(start + Duration::from_millis(1000), true).unwrap().1 > 0);
        assert_eq!(pulse.opacity(start + Duration::from_millis(4000), true), None);
    }

    #[test]
    fn key_parser_uses_windows_codes_with_repeat_disabled() {
        assert_eq!(parse_shortcut("Ctrl+Alt+F8"), Some((MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, 0x77)));
        assert_eq!(parse_shortcut("Shift+M"), None);
        assert_eq!(parse_shortcut("Ctrl+Ctrl+A"), None);
    }
}
