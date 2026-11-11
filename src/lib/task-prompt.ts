import type { Task } from "./types.ts";

export const MAX_RESULT_SUMMARY = 500;

export function buildTaskRunText(task: Task): string {
  const title = task.title.trim();
  const definition = task.description.trim();
  const prompt = task.prompt.trim() || definition || title;
  return [
    `Task: ${title}`,
    definition && definition !== title ? `Definition:\n${definition}` : "",
    `Instructions:\n${prompt}`,
    "Work only on this task and report what you changed.",
    [
      "When you finish, end your final message with exactly one line:",
      "TASK_RESULT: done — <one-sentence summary>",
      "or, if you could not complete it:",
      "TASK_RESULT: blocked — <reason>",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export type ParsedTaskResult = {
  outcome: "done" | "blocked";
  summary: string;
};

const RESULT_LINE = /^\s*\**TASK_RESULT\**:\s*(done|blocked)\b\s*[—–:-]?\s*(.*)$/gim;

/** Parse the last TASK_RESULT line in `text`, or null when there is none. */
export function parseTaskResult(text: string): ParsedTaskResult | null {
  let last: RegExpExecArray | null = null;
  for (const match of text.matchAll(RESULT_LINE)) last = match;
  if (!last) return null;
  const summary = last[2]
    .trim()
    .replace(/\*+$/, "")
    .trim()
    .slice(0, MAX_RESULT_SUMMARY);
  return { outcome: last[1].toLowerCase() as "done" | "blocked", summary };
}
