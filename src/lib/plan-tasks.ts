import type { MessageWithParts, TextPart } from "./types";

const MAX_STEPS = 100;

export type PlanStep = {
  id: string;
  title: string;
  completed: boolean;
};

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function cleanStep(value: string): string {
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
  title: string;
  completed: boolean;
};

function parseLine(line: string): ParsedLine | null {
  const match =
    /^\s*(?:#{2,4}\s+)?(?:\d+[.)]|[-*+]|(?:step|phase|task)\s+\d+[:.)-])\s+(?:\[([ xX])\]\s+)?(.+)$/i.exec(
      line,
    );
  if (!match) return null;
  const title = cleanStep(match[2] ?? "");
  if (title.length < 4 || title.length > 500) return null;
  return {
    title,
    completed: (match[1] ?? "").toLowerCase() === "x",
  };
}

/** Turn a markdown plan into importable steps. */
export function parsePlanText(value: string): PlanStep[] {
  const steps: PlanStep[] = [];
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
    const key = parsed.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    steps.push({
      id: `plan-${steps.length + 1}`,
      title: parsed.title,
      completed: parsed.completed,
    });
    if (steps.length >= MAX_STEPS) break;
  }

  return steps;
}

function stepsFromToolParts(parts: MessageWithParts["parts"]): PlanStep[] {
  for (const part of parts) {
    if (part.type !== "tool") continue;
    const input = part.state.input ?? {};

    if (part.tool === "todowrite" || part.tool === "todo") {
      const items = input.todos ?? input.items;
      if (Array.isArray(items)) {
        const steps = items
          .map((item, index) => {
            const record =
              item && typeof item === "object"
                ? (item as Record<string, unknown>)
                : {};
            return {
              id: asText(record.id) || `plan-tool-${index + 1}`,
              title: cleanStep(
                asText(record.content) ||
                  asText(record.task) ||
                  asText(record.title),
              ),
              completed: asText(record.status) === "completed",
            };
          })
          .filter((step) => step.title);
        if (steps.length > 0) return steps;
      }
    }

    if (part.tool === "write" || part.tool === "edit") {
      const file =
        asText(input.filePath) || asText(input.path) || asText(input.file);
      const content = asText(input.content) || asText(input.newString);
      if (/plan/i.test(file) && content) {
        const steps = parsePlanText(content);
        if (steps.length > 0) return steps;
      }
    }
  }
  return [];
}

/**
 * Steps from the latest plan-agent response. These are not tasks yet; the UI
 * offers an explicit import action so the user can review and edit them first.
 */
export function derivePlanSteps(messages: MessageWithParts[]): PlanStep[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.info.role !== "assistant") continue;
    const mode = message.info.mode?.toLowerCase() ?? "";
    if (mode !== "plan" && !mode.startsWith("plan")) continue;

    const fromTools = stepsFromToolParts(message.parts);
    if (fromTools.length > 0) return fromTools;

    const text = message.parts
      .filter((part): part is TextPart => part.type === "text")
      .map((part) => part.text)
      .join("\n");
    const steps = parsePlanText(text);
    if (steps.length > 0) return steps;
  }
  return [];
}
