import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currentActivity,
  describeTool,
  exploreSummary,
  groupExploration,
  isExploreTool,
  sentenceText,
  type ToolLike,
} from "./tool-activity.ts";

const ROOT = "D:/repo";
const t = (tool: string, status: string, input: unknown, extra: Partial<ToolLike["state"]> = {}): ToolLike => ({
  tool,
  state: { status, input, ...extra },
});
const text = (tool: ToolLike, root = ROOT) => sentenceText(describeTool(tool, root));

test("read running and completed", () => {
  const input = { path: String.raw`D:\repo\src\a.ts`, offset: 24, limit: 30 };
  assert.equal(text(t("read", "running", input)), "Reading src/a.ts");
  const done = t("read", "completed", input, {
    output: String.raw`Read file D:\repo\src\a.ts, lines 24-53` + "\n24: a\n25: b",
    metadata: { truncated: true },
  });
  assert.equal(text(done), "Read src/a.ts · lines 24–53 (truncated)");
});

test("read falls back to filePath and offset/limit", () => {
  const done = t("read", "completed", { filePath: "/r/x.ts", offset: 5, limit: 10 }, { output: "raw" });
  assert.equal(text(done, "/r"), "Read x.ts · lines 5–14");
});

test("grep running and completed", () => {
  const input = { pattern: "userKey", path: String.raw`D:\repo\src` };
  assert.equal(text(t("grep", "running", input)), "Searching for “userKey” in src");
  const done = t("grep", "completed", input, {
    output: "Found 2 matches\nD:\\repo\\src\\a.ts:\n  Line 1: x\n  Line 2: y\n",
    metadata: { matches: 2 },
  });
  assert.equal(text(done), "Searched “userKey” in src · 2 matches in 1 file");
  const one = t("grep", "completed", { pattern: "p" }, { output: "Found 1 matches\n/a/b:\n  Line 1: p", metadata: { matches: 1 } });
  assert.equal(text(one), "Searched “p” · 1 match in 1 file");
});

test("glob and list", () => {
  const glob = t("glob", "completed", { pattern: "src/**/*.ts" }, { output: "/a\n/b", metadata: { count: 35 } });
  assert.equal(text(glob), "Found files src/**/*.ts · 35 files");
  const list = t("list", "completed", { path: "/r/src" }, { output: "/r/src/a\n/r/src/b" });
  assert.equal(text(list, "/r"), "Listed src · 2 files");
  assert.equal(text(t("glob", "running", { pattern: "*.md" })), "Finding files *.md");
});

test("edit running, completed and failed", () => {
  const input = { path: String.raw`D:\repo\.env.example`, oldString: "a", newString: "b" };
  assert.equal(text(t("edit", "running", input)), "Editing .env.example");
  const patch = "Index: x\n====\n--- x\n+++ x\n@@ -1 +1 @@\n-a\n+b\n+c";
  const done = t("edit", "completed", input, { metadata: { files: [{ file: ".env.example", patch }] } });
  assert.equal(text(done), "Edited .env.example · +2 −1");
  const noPatch = t("edit", "completed", input, { metadata: {} });
  assert.equal(text(noPatch), "Edited .env.example");
  const failed = t("edit", "error", input, { error: "No changes to apply: oldString and newString are identical" });
  assert.equal(text(failed), "Failed to edit .env.example · No changes to apply: oldString and newString are identical");
});

test("write", () => {
  const done = t("write", "completed", { path: "/r/a.cjs", content: "a\nb\nc" });
  assert.equal(text(done, "/r"), "Wrote a.cjs · 3 lines");
});

test("shell uses description or command", () => {
  assert.equal(text(t("shell", "running", { command: "npm test\nmore" })), "Running npm test");
  assert.equal(
    text(t("shell", "completed", { command: "npm test", description: "Run tests" }, { metadata: { exit: 0 } })),
    "Ran Run tests · exit 0",
  );
  assert.equal(text(t("bash", "running", { command: "ls" })), "Running ls");
});

test("web tools", () => {
  assert.equal(text(t("webfetch", "completed", { url: "https://example.com/docs/a" })), "Fetched example.com/docs/a");
  assert.equal(text(t("webfetch", "running", { url: "not a url" })), "Fetching not a url");
  assert.equal(text(t("websearch", "completed", { query: "next 16" })), "Searched the web for “next 16”");
});

test("skill, question, todo, execute, subagent", () => {
  assert.equal(text(t("skill", "completed", { id: "apple-design" })), "Loaded skill apple-design");
  const q = t(
    "question",
    "completed",
    { questions: [{ question: "Which?", header: "Pick one", options: [] }] },
    { metadata: { answers: [["Option A"]] } },
  );
  assert.equal(text(q), "Asked you Pick one · answered: Option A");
  assert.equal(text(t("todowrite", "completed", { todos: [1, 2] })), "Updated the to-do list · 2 items");
  assert.equal(
    text(t("execute", "completed", { code: "x" }, { metadata: { toolCalls: [{}, {}, {}] } })),
    "Ran a script · 3 tool calls",
  );
  assert.equal(text(t("subagent", "running", { description: "Explore code" })), "Delegating Explore code");
});

test("unknown tool falls back", () => {
  assert.equal(text(t("mystery", "completed", { query: "abc" })), "Used mystery abc");
  assert.equal(text(t("mystery", "running", {}, { title: "Doing it" })), "Using Doing it");
  assert.equal(text(t("mystery", "pending", {})), "Using mystery");
});

test("sentenceText formatting", () => {
  assert.equal(sentenceText({ kind: "other", verb: "Ran a script", target: "" }), "Ran a script");
  assert.equal(sentenceText({ kind: "other", verb: "A", target: "b", detail: "c" }), "A b · c");
});

type P = { type: string; id: string; text?: string; tool?: string };
const tool = (id: string, name = "read"): P => ({ type: "tool", id, tool: name });
const isEx = (p: P) => p.type === "tool" && isExploreTool(p.tool ?? "");

test("groupExploration", () => {
  const grouped = groupExploration([tool("1"), tool("2", "grep"), tool("3", "glob")], isEx);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].type, "explore");

  const single = groupExploration([tool("1"), { type: "text", id: "t", text: "hi" }, tool("2")], isEx);
  assert.deepEqual(single.map((i) => i.type), ["part", "part", "part"]);

  const blank = groupExploration([tool("1"), { type: "text", id: "t", text: "  " }, tool("2")], isEx);
  assert.deepEqual(blank.map((i) => i.type), ["explore"]);

  const reasoning = groupExploration([tool("1"), { type: "reasoning", id: "r" }, tool("2")], isEx);
  assert.deepEqual(reasoning.map((i) => i.type), ["part", "part", "part"]);

  const edit = groupExploration([tool("1"), tool("2"), tool("3", "edit"), tool("4")], isEx);
  assert.deepEqual(edit.map((i) => i.type), ["explore", "part", "part"]);
});

test("exploreSummary", () => {
  const read = t("read", "completed", {});
  const grep = t("grep", "completed", {});
  assert.deepEqual(exploreSummary([read, read, read, grep, grep]), { running: false, text: "Explored 3 files, 2 searches" });
  assert.deepEqual(exploreSummary([read, grep, t("read", "running", {})]), {
    running: true,
    text: "Exploring… · 2 files, 1 search",
  });
  assert.equal(exploreSummary([read, t("read", "error", {})]).text, "Explored 2 files · 1 failed");
});

test("currentActivity", () => {
  const assistant = (parts: never[] | unknown[]) => ({ info: { role: "assistant" }, parts: parts as never[] });
  const running = assistant([
    { type: "text", text: "ok", time: { start: 1, end: 2 } },
    { type: "tool", tool: "shell", state: { status: "running", input: { command: "npm test" } } },
  ]);
  assert.equal(currentActivity([{ info: { role: "user" }, parts: [] }, running]), "Running npm test…");
  assert.equal(currentActivity([assistant([{ type: "reasoning", text: "x", time: { start: 1 } }])]), "Thinking…");
  assert.equal(currentActivity([assistant([{ type: "text", text: "hello", time: { start: 1 } }])]), "Writing the response…");
  assert.equal(currentActivity([assistant([{ type: "text", text: "done", time: { start: 1, end: 2 } }])]), null);
  assert.equal(currentActivity([]), null);
});
