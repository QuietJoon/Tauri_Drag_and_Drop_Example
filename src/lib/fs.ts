// v2 File System plugin wrapper
export async function readText(path: string): Promise<string> {
  const mod: any = await import("@tauri-apps/plugin-fs");
  const fn = mod?.readTextFile ?? mod?.readText ?? mod?.default?.readTextFile;
  if (typeof fn === "function") {
    return fn(path);
  }
  // Fallback: try reading bytes then decode as UTF-8
  const readFile = mod?.readFile ?? mod?.default?.readFile;
  if (typeof readFile === "function") {
    const bytes: Uint8Array = await readFile(path);
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
  throw new Error("@tauri-apps/plugin-fs API not found");
}

