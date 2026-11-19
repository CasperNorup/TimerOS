#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod desktop;

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
            desktop::take_signals
        ])
        .build(context)
        .expect("TimerOS could not start")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                desktop::record_exit(app);
            }
        });
}
