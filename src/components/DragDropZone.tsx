import { FC, useState } from "react";
import { useTauriFileDrop } from "../hooks/useTauriFileDrop";
import { openPath } from "../lib/opener";
import { readText } from "../lib/fs";

export type DragDropZoneProps = {
  title?: string;
};

export const DragDropZone: FC<DragDropZoneProps> = ({ title = "Drop files here" }) => {
  const { hovering, files } = useTauriFileDrop();
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const hasFiles = files.length > 0;

  async function preview(path: string) {
    setSelected(path);
    setContent("");
    setError("");
    setLoading(true);
    try {
      const text = await readText(path);
      // Truncate very large files to keep UI responsive
      const limit = 200_000; // ~200KB
      setContent(text.length > limit ? text.slice(0, limit) + "\n\n… [truncated]" : text);
    } catch (e) {
      setError((e as Error).message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="dragdrop">
      <div className={`drop-area ${hovering ? "hovering" : ""}`}>
        <p className="drop-title">{title}</p>
        <p className="drop-sub">Drag files from your OS into this window.</p>
      </div>

      {hasFiles && (
        <div className="dropped">
          <h3>Dropped files ({files.length})</h3>
          <ul>
            {files.map((p) => (
              <li key={p}>
                <button
                  type="button"
                  className="linklike"
                  onClick={() => void openPath(p)}
                  title="Open with default application"
                >
                  {p}
                </button>
                <span> · </span>
                <button
                  type="button"
                  className="linklike"
                  onClick={() => void preview(p)}
                  title="Preview file content"
                >
                  preview
                </button>
              </li>
            ))}
          </ul>
          {(selected || loading || error) && (
            <div className="preview">
              <h4>Preview{selected ? `: ${selected}` : ""}</h4>
              {loading && <p>Loading…</p>}
              {error && <p style={{ color: "#f66" }}>Error: {error}</p>}
              {!loading && !error && content && (
                <pre className="preview-pre"><code>{content}</code></pre>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
