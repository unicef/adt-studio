use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

struct SidecarState(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(SidecarState(Mutex::new(None)))
        .setup(|app| {
            let shell = app.shell();

            // Resolve resource paths for bundled assets
            let resource_dir = app
                .path()
                .resource_dir()
                .expect("failed to resolve resource dir");

            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");

            let books_dir = app_data_dir.join("books");
            std::fs::create_dir_all(&books_dir).expect("failed to create books dir");

            let prompts_dir = resource_dir.join("prompts");
            let config_path = resource_dir.join("config.yaml");
            let adt_resources_zip = resource_dir.join("assets").join("adt-resources.zip");

            let sidecar_cmd = shell
                .sidecar("api-server")
                .expect("failed to create sidecar command")
                .env("PORT", "3001")
                .env("BOOKS_DIR", books_dir.to_string_lossy().to_string())
                .env("PROMPTS_DIR", prompts_dir.to_string_lossy().to_string())
                .env("CONFIG_PATH", config_path.to_string_lossy().to_string())
                .env("ADT_RESOURCES_ZIP", adt_resources_zip.to_string_lossy().to_string());

            let (mut rx, child) = sidecar_cmd.spawn().expect("failed to spawn sidecar");

            // Store child handle for cleanup
            let state = app.state::<SidecarState>();
            *state.0.lock().unwrap() = Some(child);

            // Log sidecar stdout/stderr
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_shell::process::CommandEvent;
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            println!("[api] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Stderr(line) => {
                            eprintln!("[api] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Terminated(payload) => {
                            println!(
                                "[api] process exited with code {:?}, signal {:?}",
                                payload.code, payload.signal
                            );
                            break;
                        }
                        CommandEvent::Error(err) => {
                            eprintln!("[api] error: {}", err);
                        }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if window.label() == "main" {
                    let child = window.state::<SidecarState>().0.lock().unwrap().take();
                    if let Some(child) = child {
                        let _ = child.kill();
                        println!("[api] sidecar killed");
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
