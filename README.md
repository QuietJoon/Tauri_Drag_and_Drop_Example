# Drag & Drop — Tauri v2 + React + TypeScript

Minimal, correct drag & drop sample for Tauri v2 with a React UI. It shows dropped file paths, previews text content, and opens files with the OS default app — strictly using Tauri v2 APIs and configuration.

## Features
- v2 drag events: listens to `tauri://drag-enter`, `tauri://drag-over`, `tauri://drag-drop`, `tauri://drag-leave` and a backend-forwarded fallback (`file-drop-*`).
- Open with default app: uses the v2 opener plugin; falls back to a Rust command if JS export shape differs.
- File preview: uses the v2 fs plugin to read text content (truncated for large files).
- Strict v2: config schema `.../config/2`, crates `tauri = "2"`, `@tauri-apps/api@^2`, capabilities for `core`, `opener`, and `fs`. No v1 allowlist/keys.

## Key Files
- UI
  - `src/components/DragDropZone.tsx`: drop zone, list, preview, open buttons.
  - `src/hooks/useTauriFileDrop.ts`: subscribes to v2 drag events and backend fallback.
  - `src/lib/fs.ts`: reads text via `@tauri-apps/plugin-fs` (v2).
  - `src/lib/opener.ts`: opens paths via `@tauri-apps/plugin-opener` with `invoke` fallback.
- Backend
  - `src-tauri/src/lib.rs`: v2 setup; forwards `WindowEvent::DragDrop(DragDropEvent)` to `file-drop-*`; registers `open_path_cmd` command; initializes `opener` and `fs` plugins.
  - `src-tauri/tauri.conf.json`: v2 schema config.
  - `src-tauri/capabilities/default.json`: includes `core:default`, `opener:default`, `fs:default`.

## Notes
- Dropped paths are auto-scoped by Tauri v2 at drop-time; fs reads do not require manual allowlisting.
- The opener plugin’s ESM export can vary by bundler; `src/lib/opener.ts` resolves multiple shapes and falls back to `invoke("open_path_cmd")` if needed.
- Previews limit to ~200KB and display errors for unreadable/binary data.
