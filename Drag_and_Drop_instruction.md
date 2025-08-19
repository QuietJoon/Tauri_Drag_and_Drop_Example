# Drag & Drop in Tauri v2 — Practical Guide

## Checklist (Quick Start)
- Config: Ensure `src-tauri/tauri.conf.json` uses schema `https://schema.tauri.app/config/2` and has `build.devUrl` or `build.frontendDist` set correctly.
- Rust deps: In `src-tauri/Cargo.toml`, use `tauri = "2"`, add `tauri-plugin-opener = "2"`, `tauri-plugin-fs = "2"`.
- Capabilities: In `src-tauri/capabilities/default.json`, include `"core:default"`, `"opener:default"`, `"fs:default"`.
- Initialize plugins: In `src-tauri/src/lib.rs`, call `.plugin(tauri_plugin_opener::init())` and `.plugin(tauri_plugin_fs::init())` on the `Builder`.
- Backend events (recommended): Handle `WindowEvent::DragDrop(DragDropEvent)` in `.on_window_event` and emit custom labels `"file-drop-hover"`, `"file-drop"`, `"file-drop-cancelled"`.
- Backend command (fallback for open): Add `#[tauri::command] fn open_path_cmd(...)` that calls `app.opener().open_path(...)` and register it via `.invoke_handler(...)`.
- JS deps: Install `@tauri-apps/api@^2`, `@tauri-apps/plugin-opener@^2`, `@tauri-apps/plugin-fs@^2`.
- Frontend hook: Implement a hook that listens to built-in `tauri://drag-enter|over|drop|leave` and the custom `file-drop-*` labels; guard to no-op outside Tauri.
- UI: Build a drop zone that shows hover, lists dropped paths, a Preview (reads via fs plugin), and Open (uses opener plugin; fallback to `invoke`).
- Security: Rely on v2 drop-time scoping (no v1 allowlist); keep capabilities minimal and v2.
- Test: Run `npm run tauri dev`, drag a file onto the window, verify hover → drop → list; preview and open actions should work.
- Optional: Add `reveal_in_dir_cmd` using opener’s `reveal_item_in_dir` for a “Reveal in folder” action.

This guide explains how to implement file drag & drop in a Tauri v2 app (with a React + TypeScript frontend as an example) using only v2 APIs and configuration. It covers: receiving drag events, showing UI feedback, reading file contents, and opening files with the OS default application.

All steps and snippets are v2-only. Do not use v1 allowlist or deprecated keys.

---

## 1) Confirm a Tauri v2 Setup

- `tauri.conf.json` uses the v2 schema:
  ```json
  {
    "$schema": "https://schema.tauri.app/config/2",
    "productName": "your_app",
    "version": "0.1.0",
    "identifier": "com.example.your_app",
    "build": {
      "beforeDevCommand": "npm run dev",
      "devUrl": "http://localhost:1420",
      "beforeBuildCommand": "npm run build",
      "frontendDist": "../dist"
    },
    "app": {
      "windows": [{ "title": "your_app", "width": 800, "height": 600 }],
      "security": { "csp": null }
    }
  }
  ```

- Cargo dependencies (`src-tauri/Cargo.toml`) use v2:
  ```toml
  [build-dependencies]
  tauri-build = { version = "2", features = [] }

  [dependencies]
  tauri = { version = "2", features = [] }
  tauri-plugin-opener = "2"
  tauri-plugin-fs = "2"
  ```

- JS dependencies (`package.json`) use v2:
  ```json
  {
    "dependencies": {
      "@tauri-apps/api": "^2",
      "@tauri-apps/plugin-opener": "^2",
      "@tauri-apps/plugin-fs": "^2"
    }
  }
  ```

- Capabilities (`src-tauri/capabilities/default.json`) include v2 plugin permissions:
  ```json
  {
    "$schema": "../gen/schemas/desktop-schema.json",
    "identifier": "default",
    "description": "Capability for the main window",
    "windows": ["main"],
    "permissions": [
      "core:default",
      "opener:default",
      "fs:default"
    ]
  }
  ```

---

## 2) Understand v2 Drag Event Names

In Tauri v2, the built-in drag/drop events emitted to the webview are:
- `tauri://drag-enter`
- `tauri://drag-over`
- `tauri://drag-drop`
- `tauri://drag-leave`

You can listen to them at the app level or window level.

Optionally, you can also forward OS drag/drop from the backend to custom labels (e.g., `file-drop-*`) for consistency across environments (see step 4).

---

## 3) Frontend Listener Hook (React + TS Example)

Create a hook that subscribes to Tauri v2 drag events and optionally a backend fallback. Guard it so it no-ops in the browser (when not running inside Tauri):

```ts
// useTauriFileDrop.ts
import { useEffect, useState } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

type FileDropState = { hovering: boolean; files: string[] };

function extractPaths(payload: unknown): string[] {
  if (Array.isArray(payload) && payload.every((p) => typeof p === "string")) return payload as string[];
  if (payload && typeof payload === "object" && "paths" in (payload as any)) {
    const arr = (payload as any).paths;
    return Array.isArray(arr) ? arr.filter((p) => typeof p === "string") : [];
  }
  return [];
}

export function useTauriFileDrop(): FileDropState {
  const [state, setState] = useState<FileDropState>({ hovering: false, files: [] });

  useEffect(() => {
    let unlisten: UnlistenFn[] = [];

    async function setup() {
      // Only attach listeners inside Tauri
      const isTauri = Boolean((globalThis as any).__TAURI_INTERNALS__);
      if (!isTauri) return;

      const win = getCurrentWindow();

      // Built-in v2 labels (global)
      unlisten.push(await listen("tauri://drag-enter", (e) => {
        const paths = extractPaths(e.payload);
        setState((prev) => ({ ...prev, hovering: true, files: paths.length ? paths : prev.files }));
      }));
      unlisten.push(await listen("tauri://drag-over", () => setState((p) => ({ ...p, hovering: true }))));
      unlisten.push(await listen("tauri://drag-drop", (e) => {
        const paths = extractPaths(e.payload);
        setState({ hovering: false, files: paths });
      }));
      unlisten.push(await listen("tauri://drag-leave", () => setState((p) => ({ ...p, hovering: false }))));

      // Built-in v2 labels (window scope)
      unlisten.push(await win.listen("tauri://drag-enter", (e) => {
        const paths = extractPaths(e.payload);
        setState((prev) => ({ ...prev, hovering: true, files: paths.length ? paths : prev.files }));
      }));
      unlisten.push(await win.listen("tauri://drag-over", () => setState((p) => ({ ...p, hovering: true }))));
      unlisten.push(await win.listen("tauri://drag-drop", (e) => {
        const paths = extractPaths(e.payload);
        setState({ hovering: false, files: paths });
      }));
      unlisten.push(await win.listen("tauri://drag-leave", () => setState((p) => ({ ...p, hovering: false }))));

      // Optional backend-forwarded fallback (custom labels)
      unlisten.push(await win.listen("file-drop-hover", (e) => {
        const paths = extractPaths(e.payload);
        setState((prev) => ({ ...prev, hovering: true, files: paths.length ? paths : prev.files }));
      }));
      unlisten.push(await win.listen("file-drop", (e) => {
        const paths = extractPaths(e.payload);
        setState({ hovering: false, files: paths });
      }));
      unlisten.push(await win.listen("file-drop-cancelled", () => setState((p) => ({ ...p, hovering: false }))));
    }

    setup();
    return () => unlisten.forEach((u) => { try { u(); } catch {} });
  }, []);

  return state;
}
```

Use the hook in your component and display hover state and dropped files.

---

## 4) Backend Event Forwarding (Optional, v2)

Forward OS drag/drop to your own event labels if you want extra reliability.

```rust
// src-tauri/src/lib.rs
use tauri::{Emitter, WindowEvent, DragDropEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // v2 plugins as needed
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_fs::init())
    .on_window_event(|window, event| {
      match event {
        WindowEvent::DragDrop(ev) => match ev {
          DragDropEvent::Enter { paths, .. } => {
            let payload: Vec<String> = paths.into_iter().map(|p| p.to_string_lossy().into_owned()).collect();
            let _ = window.emit("file-drop-hover", payload);
          }
          DragDropEvent::Over { .. } => { let _ = window.emit("file-drop-hover", Vec::<String>::new()); }
          DragDropEvent::Drop { paths, .. } => {
            let payload: Vec<String> = paths.into_iter().map(|p| p.to_string_lossy().into_owned()).collect();
            let _ = window.emit("file-drop", payload);
          }
          DragDropEvent::Leave => { let _ = window.emit("file-drop-cancelled", ()); }
          _ => {}
        },
        _ => {}
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
```

Note: This is fully v2. The variants are `WindowEvent::DragDrop(DragDropEvent::{Enter, Over, Drop, Leave})`.

---

## 5) Open Files with OS Default App (v2)

Preferred: use `@tauri-apps/plugin-opener` directly from the webview:

```ts
import { open as openPath } from "@tauri-apps/plugin-opener";
await openPath("/absolute/path/to/file.txt");
```

If your bundler exposes a different ESM shape, you can use a robust dynamic import or a backend command fallback:

Backend command using the v2 plugin:
```rust
// src-tauri/src/lib.rs
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
fn open_path_cmd(path: String, app: AppHandle) -> Result<(), String> {
  app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string())
}
```
Register the command with `.invoke_handler(tauri::generate_handler![open_path_cmd])`.

Frontend fallback with `invoke`:
```ts
import { invoke } from "@tauri-apps/api/core";
await invoke("open_path_cmd", { path: "/absolute/path" });
```

This stays v2-only: the backend still uses the v2 opener plugin.

---

## 6) Read File Content (v2 fs plugin)

Use `@tauri-apps/plugin-fs` to read and show text content. Dropped paths are scoped by Tauri v2 on drop, so manual allowlisting is not required.

```ts
import { readTextFile } from "@tauri-apps/plugin-fs";

const text = await readTextFile("/absolute/path/to/file.txt");
```

Tips:
- Truncate very large files for responsiveness (e.g., first 200KB).
- Handle unreadable/binary files with a friendly error message.

---

## 7) UX Considerations

- Show clear visual feedback on drag enter/over (e.g., highlight the drop area).
- Keep a list of dropped files; offer actions:
  - Open with default app
  - Preview content
  - Reveal in folder (via opener’s `reveal_item_in_dir` on backend)
- In dev (browser preview), guard event listeners so they don’t run outside Tauri.

Reveal-in-folder backend (optional):
```rust
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
fn reveal_in_dir_cmd(path: String, app: AppHandle) -> Result<(), String> {
  app.opener().reveal_item_in_dir(path).map_err(|e| e.to_string())
}
```

---

## 8) Testing & Troubleshooting

- Run desktop dev: `npm run tauri dev`. Drag & drop works only inside the Tauri app window, not in plain browser preview.
- Try dropping from `~/Desktop` or `~/Downloads` on macOS if you suspect permissions.
- If built-in labels (`tauri://drag-*`) don’t seem to arrive, add backend forwarding (step 4) and listen to your custom labels.
- Ensure capabilities include `core:default`, and any plugin permissions you use (`opener:default`, `fs:default`).

---

## 9) Recap of v2-Only Rules

- Config schema: `https://schema.tauri.app/config/2`.
- Event names: `tauri://drag-enter/over/drop/leave`.
- Backend event: `WindowEvent::DragDrop(DragDropEvent)`.
- Plugins: use `tauri-plugin-opener` and `tauri-plugin-fs` v2.
- Capabilities: use v2 permissions (no v1 allowlist).
- Avoid `@tauri-apps/api/fs` v1 patterns; use the v2 plugin instead.

With these steps, you get a minimal, reliable drag & drop pipeline in Tauri v2 with clean UX and correct security posture.
