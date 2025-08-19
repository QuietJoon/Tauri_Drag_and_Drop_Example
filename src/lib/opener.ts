// Wrapper to tolerate different ESM export shapes of the opener plugin
// in various environments/bundlers.
import { invoke } from "@tauri-apps/api/core";

export async function openPath(target: string) {
  try {
    const mod: any = await import("@tauri-apps/plugin-opener");
    const candidates = [mod?.open, mod?.default?.open, mod?.default, mod];
    for (const c of candidates) {
      if (typeof c === "function") {
        return await c(target);
      }
    }
    // Fall back to Rust command if plugin export shape not found
    return await invoke("open_path_cmd", { path: target });
  } catch (e) {
    // Fallback for bundler resolution failure
    return await invoke("open_path_cmd", { path: target });
  }
}
