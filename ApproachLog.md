# Drag & Drop — Tauri v2 Approach Log

Purpose: document practical, v2-only ways to make drag & drop work reliably across platforms, plus decisions and pitfalls we validated in this repo.

## Baseline: Verified Tauri v2 Setup
- Config schema: `src-tauri/tauri.conf.json` uses `"$schema": "https://schema.tauri.app/config/2"`.
- Rust crates: `tauri = "2"`, `tauri-build = "2"` in `src-tauri/Cargo.toml`.
- JS API: `@tauri-apps/api@^2` present in `package.json`.
- Capabilities: `src-tauri/capabilities/default.json` includes `core:default` (which includes `core:event:default`), and enables plugin permissions we use: `opener:default`, `fs:default`.

No Tauri v1 allowlist or deprecated keys are used anywhere.

---

## Approach A — Frontend-only listeners for built-in v2 labels

Files:
- `src/hooks/useTauriFileDrop.ts`

What we did:
- Subscribed to Tauri v2’s built-in drag & drop event labels via `@tauri-apps/api/event`:
  - `tauri://drag-enter`
  - `tauri://drag-over`
  - `tauri://drag-drop`
  - `tauri://drag-leave`
- Registered both app-level (`listen`) and window-scoped (`getCurrentWindow().listen`) listeners.
- Accept both payload shapes (array of paths or `{ paths: string[] }`).
- Guarded runtime: no-op outside a Tauri WebView (so `npm run dev` works without errors).

Why this sometimes “does nothing” for people:
- In some setups the built-in labels don’t reach the webview as expected (tooling, OS nuances, or app-level listeners only). This is why many examples appear flaky.

Outcome here:
- Kept this in place for completeness and to support environments where it works out of the box.

---

## Approach B — Backend-forwarded window events (reliable)

Files:
- `src-tauri/src/lib.rs`
- `src/hooks/useTauriFileDrop.ts`

What we did:
- Hooked `Builder.on_window_event` and matched `WindowEvent::DragDrop(DragDropEvent)` (v2 API).
- Emitted our own, window-scoped labels back to the frontend:
  - `file-drop-hover`
  - `file-drop`
  - `file-drop-cancelled`
- The hook now also listens to those custom labels as a fallback.

Why this helps:
- Removes ambiguity about whether built-in `tauri://` labels propagate to your webview; we forward OS drag/drop to explicit window events ourselves.
- Fully v2-compliant: uses `tauri::WindowEvent::DragDrop` and `window.emit` on v2.

Outcome here:
- Verified reliable delivery in desktop runtime (`npm run tauri dev`).

---

## Approach C — Safe content preview (v2 fs plugin)

Files:
- Backend: `src-tauri/src/lib.rs` (adds `.plugin(tauri_plugin_fs::init())`)
- Backend deps: `src-tauri/Cargo.toml` (`tauri-plugin-fs = "2"`)
- Capabilities: `src-tauri/capabilities/default.json` (`"fs:default"`)
- Frontend: `src/lib/fs.ts` (reads file contents), `src/components/DragDropZone.tsx` (UI)

What we did:
- Use the Tauri v2 FS plugin to read text contents of dropped files.
- Added a small wrapper that dynamically imports `@tauri-apps/plugin-fs` and resolves the function regardless of ESM export shape.
- Truncate previews to ~200KB to keep the UI responsive; show errors for unreadable files.

Why this is v2-correct and secure:
- Drag/drop paths are scoped by Tauri v2 (see manager/window.rs using `allow_file`/`allow_directory` on drop), so reading dropped files does not require manual allowlisting.
- Uses v2 plugin + capabilities model (`fs:default`), no v1 allowlist.

Outcome here:
- Clicking “preview” shows the file content inline; clicking the path still opens with the OS default app.

---

## UI/UX Layer

Files:
- `src/components/DragDropZone.tsx` — simple zone that shows hover state and the final dropped list.
- `src/App.tsx` — mounts the drag/drop zone.
- `src/App.css` — minimal styling additions.

Notes:
- The UI does not rely on HTML5 dragover/drop to extract paths (browsers sandbox paths). It uses Tauri events for real file system paths.
- In web preview (`npm run dev`), the hook safely no-ops and the UI just renders.
- The opener plugin had an ESM export mismatch in some setups; we added `src/lib/opener.ts` wrapper which resolves `open` whether it is default or named export.

---

## Approach D — Reliable "Open with default app" fallback

Files:
- Backend: `src-tauri/src/lib.rs` adds `#[tauri::command] fn open_path_cmd(...)` using `tauri_plugin_opener::OpenerExt`.
- Frontend: `src/lib/opener.ts` now prefers the JS plugin, but falls back to `invoke("open_path_cmd", { path })` if the JS export is unavailable.

Why this helps:
- Some bundlers/environments surface `@tauri-apps/plugin-opener` with differing export shapes. The command fallback guarantees functionality without relying on client-side ESM shape.
- Still v2: uses the v2 opener plugin on the backend, and v2 `@tauri-apps/api/core` for `invoke`.


---

## Troubleshooting & Pitfalls (v2-specific)

- Run desktop app: Test via `npm run tauri dev` (not the browser preview). Web preview intentionally won’t receive Tauri events.
- Drop target: Drop on the app’s window content (not devtools, not outside the window).
- macOS permissions: If dragging from protected folders, grant access or try from `~/Desktop` or `~/Downloads`.
- Multiple listeners: We intentionally register both global and window-scoped listeners plus backend-forwarded labels to cover platform differences.
- Capabilities: Default capability includes event permissions; no v1 allowlist is required (and none is used).

---

## Alternatives Considered (avoided v1-only patterns)

- v1 allowlist keys in `tauri.conf.json`: Not used. v2 uses capabilities and plugin ACLs.
- Direct HTML5 drop for file paths: Browsers don’t expose real system paths; only Tauri events give reliable absolute paths.

---

## Code Pointers

- Backend forwarding (v2):
  - `src-tauri/src/lib.rs` — `.on_window_event` -> match `WindowEvent::DragDrop(DragDropEvent)` -> `window.emit("file-drop…", …)`.

- Frontend hook (v2):
  - `src/hooks/useTauriFileDrop.ts` — listens to:
    - Built-ins: `tauri://drag-enter`, `tauri://drag-over`, `tauri://drag-drop`, `tauri://drag-leave` (global + window scope)
    - Custom: `file-drop-hover`, `file-drop`, `file-drop-cancelled` (window scope)
  - Guards non-Tauri runtime, normalizes payloads, tracks `hovering` and `files`.

---

## Next Extensions (optional)

- Open-on-click: Use `@tauri-apps/plugin-opener` to open dropped files with the OS default app.
- Filtering: Accept only certain extensions and show validation messages.
- Persistence: Save the last dropped file list via app data dir.

This log is intentionally v2-only. No v1 configuration or APIs were introduced.
