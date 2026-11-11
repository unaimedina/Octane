import type { MessageWithParts, TextPart, Todo } from "./types";

const MAX_TASKS = 40;

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function cleanTask(value: string): string {
  return value
    .replace(/^\s*\[[ xX]\]\s+/, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

type ParsedLine = {
  content: string;
  completed: boolean;
};

function parseLine(line: string): ParsedLine | null {
  const match =
    /^\s*(?:#{2,4}\s+)?(?:\d+[.)]|[-*+]|(?:step|phase|task)\s+\d+[:.)-])\s+(?:\[([ xX])\]\s+)?(.+)$/i.exec(
      line,
    );
  if (!match) return null;
  const content = cleanTask(match[2] ?? "");
  if (content.length < 4 || content.length > 500) return null;
  return {
    content,
    completed: (match[1] ?? "").toLowerCase() === "x",
  };
}

/** Turn a markdown plan into tasks without depending on a todo API. */
export function parsePlanText(value: string): Todo[] {
  const tasks: Todo[] = [];
  const seen = new Set<string>();
  let fenced = false;

  for (const rawLine of value.split(/\r?\n/)) {
    if (/^\s*```/.test(rawLine)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;

    const parsed = parseLine(rawLine);
    if (!parsed) continue;
    const key = parsed.content.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    tasks.push({
      id: `plan-${tasks.length + 1}`,
      content: parsed.content,
      status: parsed.completed ? "completed" : "pending",
      priority: "medium",
    });
    if (tasks.length >= MAX_TASKS) break;
  }

  return tasks;
}

function tasksFromToolParts(parts: MessageWithParts["parts"]): Todo[] {
  for (const part of parts) {
    if (part.type !== "tool") continue;
    const input = part.state.input ?? {};

    if (part.tool === "todowrite" || part.tool === "todo") {
      const items = input.todos ?? input.items;
      if (Array.isArray(items)) {
        const tasks = items
          .map((item, index) => {
            const record =
              item && typeof item === "object"
                ? (item as Record<string, unknown>)
                : {};
            return {
              id: asText(record.id) || `plan-tool-${index + 1}`,
              content: cleanTask(
                asText(record.content) ||
                  asText(record.task) ||
                  asText(record.title),
              ),
              status: asText(record.status) || "pending",
              priority: asText(record.priority) || "medium",
            };
          })
          .filter((task) => task.content);
        if (tasks.length > 0) return tasks;
      }
    }

    if (part.tool === "write" || part.tool === "edit") {
      const file =
        asText(input.filePath) || asText(input.path) || asText(input.file);
      const content = asText(input.content) || asText(input.newString);
      if (/plan/i.test(file) && content) {
        const tasks = parsePlanText(content);
        if (tasks.length > 0) return tasks;
      }
    }
  }
  return [];
}

/**
 * Derive the task list from the latest plan-agent response. OpenCode v2 does
 * not expose a todo endpoint, so the plan text (or a plan file the agent wrote)
 * is the only portable source.
 */
export function derivePlanTasks(messages: MessageWithParts[]): Todo[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.info.role !== "assistant") continue;
    const mode = message.info.mode?.toLowerCase() ?? "";
    if (mode !== "plan" && !mode.startsWith("plan")) continue;

    const fromTools = tasksFromToolParts(message.parts);
    if (fromTools.length > 0) return fromTools;

    const text = message.parts
      .filter((part): part is TextPart => part.type === "text")
      .map((part) => part.text)
      .join("\n");
    const tasks = parsePlanText(text);
    if (tasks.length > 0) return tasks;
  }
  return [];
}
