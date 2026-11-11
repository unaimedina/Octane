// Pure helpers for the OCTANE-managed context-files block in AGENTS.md.
// No fs access here so these can run under `node --test`.

export const CONTEXT_BEGIN = "<!-- BEGIN:octane-context-files -->";
export const CONTEXT_END = "<!-- END:octane-context-files -->";
export const CONTEXT_DIR = ".octane/context";

export const CONTEXT_EXTENSIONS = [
  ".md",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".csv",
  ".xml",
  ".html",
  ".css",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".lua",
  ".py",
  ".sql",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".pdf",
] as const;

const MAX_NAME = 120;

/** Sanitize an uploaded file name. Returns null when it is unusable. */
export function sanitizeContextFilename(name: string): string | null {
  if (typeof name !== "string") return null;
  const base = name.split(/[\\/]/).pop() ?? "";
  let clean = base
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^\.+/, "");
  if (!clean) return null;

  const dot = clean.lastIndexOf(".");
  const extension = dot > 0 ? clean.slice(dot).toLowerCase() : "";
  if (!(CONTEXT_EXTENSIONS as readonly string[]).includes(extension)) return null;

  if (clean.length > MAX_NAME) {
    const stem = clean.slice(0, dot).slice(0, MAX_NAME - extension.length);
    clean = `${stem}${clean.slice(dot)}`;
  }
  return clean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Render the managed block with `\n` line endings. "" for an empty list. */
export function renderContextBlock(
  files: { name: string; size: number }[],
): string {
  if (files.length === 0) return "";
  const sorted = [...files].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  return [
    CONTEXT_BEGIN,
    "## Project context files",
    "",
    "Reference material uploaded through OCTANE. Read the relevant file before",
    "working on related tasks; do not modify these files unless asked.",
    "",
    ...sorted.map(
      (file) => `- \`${CONTEXT_DIR}/${file.name}\` (${formatSize(file.size)})`,
    ),
    CONTEXT_END,
  ].join("\n");
}

/** Insert, replace or remove the managed block, leaving everything else intact. */
export function upsertContextBlock(
  markdown: string,
  files: { name: string; size: number }[],
): string {
  const eol = markdown.includes("\r\n") ? "\r\n" : "\n";
  const block = renderContextBlock(files).replace(/\n/g, eol);
  const begin = markdown.indexOf(CONTEXT_BEGIN);
  const endMarker = begin === -1 ? -1 : markdown.indexOf(CONTEXT_END, begin);
  const hasBlock = begin !== -1 && endMarker !== -1;

  if (hasBlock) {
    const end = endMarker + CONTEXT_END.length;
    if (block) return markdown.slice(0, begin) + block + markdown.slice(end);

    let before = markdown.slice(0, begin);
    let after = markdown.slice(end);
    if (after.startsWith(eol)) after = after.slice(eol.length);
    if (before.endsWith(eol + eol)) before = before.slice(0, -eol.length);
    return before + after;
  }

  if (!block) return markdown;
  if (markdown.trim() === "") return block + eol;
  const gap = markdown.endsWith(eol) ? eol : eol + eol;
  return markdown + gap + block + eol;
}
