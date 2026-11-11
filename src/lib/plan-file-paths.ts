/**
 * Detects whether a session event touched an improve-style plan file
 * (`plans/NNN-*.md`, `plans/README.md`, or the same under `advisor-plans/`). Pure, so the chat view can call it
 * on every streamed part without extra requests.
 */
const PLAN_FILE_PATH =
  /(?:^|[\\/"'\s])(?:advisor-)?plans(?:[\\/]|\\\\)(?:\d{3}-[^\\/"'\s]*|README)\.md(?![\w.-])/i;

export function isPlanFilePath(path: string): boolean {
  return PLAN_FILE_PATH.test(path);
}

type PartLike = {
  type?: string;
  tool?: string;
  state?: { status?: string; input?: unknown };
  files?: unknown;
};

/** True when a finished tool call or patch part wrote a plan file. */
export function partTouchesPlanFiles(part: PartLike): boolean {
  if (part.type === "patch" && Array.isArray(part.files)) {
    return part.files.some((file) => typeof file === "string" && isPlanFilePath(file));
  }
  if (part.type !== "tool" || part.state?.status !== "completed") return false;
  let input: string;
  try {
    input = JSON.stringify(part.state.input ?? "");
  } catch {
    return false;
  }
  return isPlanFilePath(input);
}

/** True when a session diff lists at least one plan file. */
export function diffTouchesPlanFiles(diff: ReadonlyArray<{ file?: string }>): boolean {
  return diff.some((entry) => typeof entry.file === "string" && isPlanFilePath(entry.file));
}
