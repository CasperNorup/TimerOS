#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod desktop;
mod surface;

fn main() {
    let context = tauri::generate_context!();
    #[cfg(windows)]
    let Some(_instance) = desktop::single_instance(&context.config().identifier)
        .expect("TimerOS instance check failed")
    else {
        return;
    };

    tauri::Builder::default()
        .setup(desktop::setup)
        .invoke_handler(tauri::generate_handler![
            desktop::load_workspace,
            desktop::save_workspace,
            desktop::take_signals,
            surface::present_desktop
        ])
        .on_window_event(|window, event| {
            #[cfg(windows)]
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    if let Some(can_hide) = surface::keep_running_on_close() {
                        api.prevent_close();
                        if can_hide {
                            let _ = window.hide();
                        } else {
                            let _ = window.minimize();
                        }
                    }
                }
            }
        })
        .build(context)
        .expect("TimerOS could not start")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                desktop::record_exit(app);
            }
        });
}
