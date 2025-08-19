// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn open_path_cmd(path: String, app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![greet, open_path_cmd])
        .on_window_event(|window, event| {
            use tauri::{DragDropEvent, Emitter, WindowEvent};
            match event {
                WindowEvent::DragDrop(drag) => match drag {
                    DragDropEvent::Enter { paths, .. } => {
                        let payload: Vec<String> = paths
                            .into_iter()
                            .map(|p| p.to_string_lossy().into_owned())
                            .collect();
                        let _ = window.emit("file-drop-hover", payload);
                    }
                    DragDropEvent::Over { .. } => {
                        // Keep hover state true; no path update.
                        let _ = window.emit("file-drop-hover", Vec::<String>::new());
                    }
                    DragDropEvent::Drop { paths, .. } => {
                        let payload: Vec<String> = paths
                            .into_iter()
                            .map(|p| p.to_string_lossy().into_owned())
                            .collect();
                        let _ = window.emit("file-drop", payload);
                    }
                    DragDropEvent::Leave => {
                        let _ = window.emit("file-drop-cancelled", ());
                    }
                    _ => {}
                },
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
