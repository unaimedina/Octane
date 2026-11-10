import type { MessageWithParts } from "./types";

type TranscriptOptions = {
  maxMessages?: number;
  maxChars?: number;
};

/** A compact, plain-text snapshot of a conversation for the context field. */
export function buildTranscript(
  messages: MessageWithParts[],
  options: TranscriptOptions = {},
): string {
  const maxMessages = options.maxMessages ?? 40;
  const maxChars = options.maxChars ?? 20_000;
  const chunks: string[] = [];
  let used = 0;

  // Walk backwards so the newest real text wins even when the tail of the
  // conversation is mostly tool calls. Tool parts are intentionally omitted.
  for (let index = messages.length - 1; index >= 0; index--) {
    if (chunks.length >= maxMessages || used >= maxChars) break;
    const message = messages[index];
    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("\n")
      .trim();
    if (!text) continue;

    const role = message.info.role === "assistant" ? "Assistant" : "User";
    const prefix = `${role}:\n`;
    const remaining = maxChars - used;
    if (remaining <= prefix.length) break;

    const chunk =
      prefix.length + text.length > remaining
        ? `${prefix}${text.slice(-(remaining - prefix.length))}`
        : `${prefix}${text}`;
    chunks.push(chunk);
    used += chunk.length + 2;
  }

  return chunks.reverse().join("\n\n");
}
