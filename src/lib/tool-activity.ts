// Pure helpers that turn tool calls into short human sentences, group runs of
// exploration steps and compute the live "what is the AI doing" line.
import { parseGlobOutput, parseGrepOutput, parseReadOutput, patchStats, shortPath } from "./tool-output.ts";

export type ToolLike = {
  tool: string;
  state: { status: string; input?: unknown; output?: string; error?: string; title?: string; metadata?: unknown };
};
export type ToolKind =
  | "read"
  | "search"
  | "files"
  | "edit"
  | "write"
  | "shell"
  | "web"
  | "skill"
  | "question"
  | "todo"
  | "script"
  | "agent"
  | "other";
export type ToolSentence = {
  kind: ToolKind;
  verb: string;
  target: string;
  detail?: string;
};

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function cut(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function pathOf(input: Record<string, unknown>): string {
  return str(input.path) || str(input.filePath) || str(input.file_path);
}

function firstLine(value: string): string {
  return value.split(/\r?\n/, 1)[0] ?? "";
}

type Row = { running: string; done: string; failed: string };

const rows: Record<string, Row> = {
  read: { running: "Reading", done: "Read", failed: "Failed to read" },
  grep: { running: "Searching for", done: "Searched", failed: "Failed to search for" },
  glob: { running: "Finding files", done: "Found files", failed: "Failed to find files" },
  list: { running: "Listing", done: "Listed", failed: "Failed to list" },
  edit: { running: "Editing", done: "Edited", failed: "Failed to edit" },
  write: { running: "Writing", done: "Wrote", failed: "Failed to write" },
  shell: { running: "Running", done: "Ran", failed: "Failed to run" },
  webfetch: { running: "Fetching", done: "Fetched", failed: "Failed to fetch" },
  websearch: { running: "Searching the web for", done: "Searched the web for", failed: "Failed to search the web for" },
  skill: { running: "Loading skill", done: "Loaded skill", failed: "Failed to load skill" },
  question: { running: "Asking you", done: "Asked you", failed: "Failed to ask" },
  todo: { running: "Updating the to-do list", done: "Updated the to-do list", failed: "Failed to update the to-do list" },
  execute: { running: "Running a script", done: "Ran a script", failed: "Failed to run a script" },
  agent: { running: "Delegating", done: "Delegated", failed: "Failed to delegate" },
};

const aliases: Record<string, string> = {
  create: "write",
  multiedit: "edit",
  multi_edit: "edit",
  patch: "edit",
  apply_patch: "edit",
  bash: "shell",
  terminal: "shell",
  todowrite: "todo",
  todoread: "todo",
  subagent: "agent",
  task: "agent",
};

const kinds: Record<string, ToolKind> = {
  read: "read",
  grep: "search",
  glob: "files",
  list: "files",
  edit: "edit",
  write: "write",
  shell: "shell",
  webfetch: "web",
  websearch: "web",
  skill: "skill",
  question: "question",
  todo: "todo",
  execute: "script",
  agent: "agent",
};

function hostAndPath(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.host}${path}`;
  } catch {
    return url;
  }
}

function fallbackTarget(part: ToolLike): string {
  const input = rec(part.state.input);
  const title = str(part.state.title).trim();
  if (title) return cut(title, 120);
  for (const key of ["description", "command", "file_path", "filePath", "path", "pattern", "query", "url", "prompt"]) {
    const value = str(input[key]).trim();
    if (value) return `${part.tool} ${cut(firstLine(value), 100)}`;
  }
  return part.tool;
}

export function describeTool(part: ToolLike, root?: string): ToolSentence {
  const name = (part.tool ?? "").toLowerCase();
  const key = aliases[name] ?? name;
  const state = part.state;
  const input = rec(state.input);
  const meta = rec(state.metadata);
  const output = str(state.output);
  const done = state.status === "completed";
  const failed = state.status === "error";
  const row = rows[key];

  if (!row) {
    const target = fallbackTarget(part);
    return {
      kind: "other",
      verb: failed ? "Failed to use" : done ? "Used" : "Using",
      target,
      detail: failed ? cut(firstLine(str(state.error)), 100) || undefined : undefined,
    };
  }

  const verb = failed ? row.failed : done ? row.done : row.running;
  const kind = kinds[key];
  const path = pathOf(input);
  let target = "";
  let detail: string | undefined;

  switch (key) {
    case "read": {
      target = shortPath(path, root);
      if (done) {
        const parsed = parseReadOutput(output);
        if (parsed) {
          const end = parsed.endLine ?? parsed.lines[parsed.lines.length - 1].n;
          detail = `lines ${parsed.startLine}–${end}`;
        } else if (typeof input.offset === "number") {
          const start = input.offset;
          detail =
            typeof input.limit === "number" ? `lines ${start}–${start + input.limit - 1}` : `from line ${start}`;
        }
        if (meta.truncated === true) detail = detail ? `${detail} (truncated)` : "(truncated)";
      }
      break;
    }
    case "grep": {
      const pattern = str(input.pattern);
      target = `“${pattern}”${path ? ` in ${shortPath(path, root)}` : ""}`;
      if (done) {
        const parsed = parseGrepOutput(output);
        const n = typeof meta.matches === "number" ? meta.matches : parsed?.total;
        if (typeof n === "number") {
          detail = plural(n, "match", "matches");
          if (parsed) detail += ` in ${plural(parsed.files.length, "file", "files")}`;
        }
      }
      break;
    }
    case "glob":
    case "list": {
      target = key === "glob" ? str(input.pattern) || shortPath(path, root) : shortPath(path, root) || str(input.pattern);
      if (done) {
        const n = typeof meta.count === "number" ? meta.count : output ? parseGlobOutput(output).length : undefined;
        if (typeof n === "number") detail = plural(n, "file", "files");
      }
      break;
    }
    case "edit": {
      const files = Array.isArray(meta.files) ? meta.files.map(rec) : [];
      const file = path || str(files[0]?.file);
      target = shortPath(file, root);
      if (done) {
        let additions = 0;
        let deletions = 0;
        let any = false;
        for (const entry of files) {
          const patch = str(entry.patch);
          if (!patch) continue;
          any = true;
          const stats = patchStats(patch);
          additions += stats.additions;
          deletions += stats.deletions;
        }
        if (any) detail = `+${additions} −${deletions}`;
      }
      break;
    }
    case "write": {
      target = shortPath(path, root);
      const content = str(input.content) || str(input.file_text);
      if (done && content) detail = plural(content.split("\n").length, "line", "lines");
      break;
    }
    case "shell": {
      const description = str(input.description).trim();
      const command = str(input.command) || str(input.cmd) || str(input.script);
      target = description || cut(firstLine(command.trim()), 80);
      if (done && typeof meta.exit === "number") detail = `exit ${meta.exit}`;
      break;
    }
    case "webfetch":
      target = hostAndPath(str(input.url));
      break;
    case "websearch":
      target = `“${str(input.query)}”`;
      break;
    case "skill":
      target = str(input.id) || str(input.name) || str(meta.name);
      break;
    case "question": {
      const first = rec(Array.isArray(input.questions) ? input.questions[0] : undefined);
      target = cut(str(first.header) || str(first.question), 60);
      const answers = Array.isArray(meta.answers) ? meta.answers : [];
      const label = Array.isArray(answers[0]) ? answers[0][0] : undefined;
      if (done && typeof label === "string" && label) detail = `answered: ${label}`;
      break;
    }
    case "todo":
      if (done && Array.isArray(input.todos)) detail = plural(input.todos.length, "item", "items");
      break;
    case "execute":
      if (done && Array.isArray(meta.toolCalls)) detail = plural(meta.toolCalls.length, "tool call", "tool calls");
      break;
    case "agent":
      target = str(input.description);
      break;
  }

  if (failed) detail = cut(firstLine(str(state.error)), 100) || undefined;
  return { kind, verb, target, detail };
}

export function sentenceText(s: ToolSentence): string {
  const base = [s.verb, s.target].filter(Boolean).join(" ");
  return (s.detail ? `${base} · ${s.detail}` : base).replace(/\s+/g, " ").trim();
}

export type RenderItem<P> = { type: "part"; part: P } | { type: "explore"; parts: P[] };

export function groupExploration<P extends { type: string; text?: string }>(
  parts: P[],
  isExplore: (part: P) => boolean,
): RenderItem<P>[] {
  const items: RenderItem<P>[] = [];
  let run: P[] = [];
  const flush = () => {
    if (run.length >= 2) items.push({ type: "explore", parts: run });
    else for (const part of run) items.push({ type: "part", part });
    run = [];
  };
  for (const part of parts) {
    if (part.type === "text" && !(part.text ?? "").trim()) continue;
    if (isExplore(part)) {
      run.push(part);
      continue;
    }
    flush();
    items.push({ type: "part", part });
  }
  flush();
  return items;
}

export function isExploreTool(tool: string): boolean {
  const name = (tool ?? "").toLowerCase();
  return name === "read" || name === "grep" || name === "glob" || name === "list";
}

export function exploreSummary(parts: ToolLike[]): { running: boolean; text: string } {
  const running = parts.some((p) => p.state.status === "running" || p.state.status === "pending");
  let files = 0;
  let searches = 0;
  let failed = 0;
  for (const part of parts) {
    if (part.tool.toLowerCase() === "read") files++;
    else searches++;
    if (part.state.status === "error") failed++;
  }
  const counts = [
    files ? plural(files, "file", "files") : "",
    searches ? plural(searches, "search", "searches") : "",
  ]
    .filter(Boolean)
    .join(", ");
  let text = running ? `Exploring…${counts ? ` · ${counts}` : ""}` : `Explored ${counts}`.trim();
  if (failed) text += ` · ${failed} failed`;
  return { running, text };
}

export type MessageLike = {
  info: { role: string };
  parts: Array<{ type: string; text?: string; time?: { start?: number; end?: number; created?: number } } & Partial<ToolLike>>;
};

export function currentActivity(messages: MessageLike[], root?: string): string | null {
  let last: MessageLike | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].info.role === "assistant") {
      last = messages[i];
      break;
    }
  }
  if (!last) return null;
  for (let i = last.parts.length - 1; i >= 0; i--) {
    const part = last.parts[i];
    if (part.type === "tool" && part.tool && part.state) {
      if (part.state.status === "running" || part.state.status === "pending") {
        return `${sentenceText(describeTool(part as ToolLike, root))}…`;
      }
    } else if (part.type === "reasoning" && !part.time?.end) {
      return "Thinking…";
    } else if (part.type === "text" && (part.text ?? "").trim() && !part.time?.end) {
      return "Writing the response…";
    }
  }
  return null;
}
