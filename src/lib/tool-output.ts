// Pure, total parsers for OpenCode tool output. They never throw and return
// null / empty results on unexpected input so callers can fall back to raw text.

export type ReadOutput = {
  file?: string;
  startLine: number;
  endLine?: number;
  lines: { n: number; text: string }[];
};

function normalize(text: string): string {
  return typeof text === "string" ? text.replace(/\r\n?/g, "\n") : "";
}

export function parseReadOutput(text: string): ReadOutput | null {
  try {
    const rows = normalize(text).split("\n");
    let file: string | undefined;
    let startLine: number | undefined;
    let endLine: number | undefined;
    const lines: { n: number; text: string }[] = [];
    for (const row of rows) {
      const header = /^Read file (.+?), lines (\d+)-(\d+)\s*$/.exec(row);
      if (header && lines.length === 0) {
        file = header[1];
        startLine = Number(header[2]);
        endLine = Number(header[3]);
        continue;
      }
      if (row === "<file>" || row === "</file>") continue;
      const v2 = /^(\d+): ?(.*)$/.exec(row);
      if (v2) {
        lines.push({ n: Number(v2[1]), text: v2[2] });
        continue;
      }
      const v1 = /^0*(\d+)\| ?(.*)$/.exec(row);
      if (v1) lines.push({ n: Number(v1[1]), text: v1[2] });
    }
    if (lines.length === 0) return null;
    return { file, startLine: startLine ?? lines[0].n, endLine, lines };
  } catch {
    return null;
  }
}

export type GrepFile = { file: string; matches: { line: number; text: string }[] };
export type GrepOutput = { total?: number; files: GrepFile[] };

export function parseGrepOutput(text: string): GrepOutput | null {
  try {
    const rows = normalize(text).split("\n");
    let total: number | undefined;
    const files: GrepFile[] = [];
    let current: GrepFile | undefined;
    for (const row of rows) {
      const found = /^Found (\d+) matches?\s*$/.exec(row);
      if (found) {
        total = Number(found[1]);
        continue;
      }
      const match = /^\s+Line (\d+): ?(.*)$/.exec(row);
      if (match) {
        if (current) current.matches.push({ line: Number(match[1]), text: match[2].replace(/\r$/, "") });
        continue;
      }
      if (row.length > 0 && !/^\s/.test(row) && row.endsWith(":")) {
        current = { file: row.slice(0, -1), matches: [] };
        files.push(current);
      }
    }
    if (files.length > 0) return { total, files };
    if (total === 0 || /No files found|No matches found/i.test(text)) return { total: 0, files: [] };
    return null;
  } catch {
    return null;
  }
}

export function parseGlobOutput(text: string): string[] {
  try {
    return normalize(text)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("("));
  } catch {
    return [];
  }
}

export function patchStats(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  try {
    for (const line of normalize(patch).split("\n")) {
      if (line.startsWith("+++") || line.startsWith("---")) continue;
      if (line.startsWith("+")) additions++;
      else if (line.startsWith("-")) deletions++;
    }
  } catch {
    // ignore
  }
  return { additions, deletions };
}

export function shortPath(path: string, root?: string): string {
  if (!path) return "";
  const norm = (value: string) => value.replace(/\\/g, "/").replace(/\/+$/, "");
  const p = norm(path);
  const r = root ? norm(root) : "";
  if (r) {
    const ci = /^[A-Za-z]:/.test(p) || /^[A-Za-z]:/.test(r);
    const pc = ci ? p.toLowerCase() : p;
    const rc = ci ? r.toLowerCase() : r;
    if (pc === rc) return ".";
    if (pc.startsWith(`${rc}/`)) return p.slice(r.length + 1);
  }
  const segments = p.split("/").filter(Boolean);
  return segments.slice(-2).join("/");
}
