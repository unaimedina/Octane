import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTaskRunText, parseTaskResult } from "./task-prompt.ts";
import type { Task } from "./types.ts";

test("marker on the last line", () => {
  const result = parseTaskResult("Did stuff.\nTASK_RESULT: done — all good");
  assert.deepEqual(result, { outcome: "done", summary: "all good" });
});

test("marker in bold", () => {
  const result = parseTaskResult("**TASK_RESULT**: done — x");
  assert.deepEqual(result, { outcome: "done", summary: "x" });
});

test("en-dash, hyphen and colon separators", () => {
  assert.equal(parseTaskResult("TASK_RESULT: done – a")?.summary, "a");
  assert.equal(parseTaskResult("TASK_RESULT: done - b")?.summary, "b");
  assert.equal(parseTaskResult("TASK_RESULT: done: c")?.summary, "c");
});

test("the last marker wins", () => {
  const result = parseTaskResult(
    "TASK_RESULT: blocked — first\nmore\nTASK_RESULT: done — second",
  );
  assert.deepEqual(result, { outcome: "done", summary: "second" });
});

test("no marker returns null", () => {
  assert.equal(parseTaskResult("I finished everything."), null);
  assert.equal(parseTaskResult("TASK_RESULT: maybe — hmm"), null);
});

test("blocked with a reason", () => {
  const result = parseTaskResult("TASK_RESULT: blocked — missing API key");
  assert.deepEqual(result, { outcome: "blocked", summary: "missing API key" });
});

test("summary over 500 chars is truncated", () => {
  const result = parseTaskResult(`TASK_RESULT: done — ${"x".repeat(900)}`);
  assert.equal(result?.summary.length, 500);
});

test("matching is case-insensitive", () => {
  assert.equal(parseTaskResult("task_result: DONE — ok")?.outcome, "done");
});

test("buildTaskRunText includes the protocol footer", () => {
  const task = {
    title: "Fix it",
    description: "",
    prompt: "",
  } as Task;
  const text = buildTaskRunText(task);
  assert.ok(text.startsWith("Task: Fix it"));
  assert.ok(text.includes("TASK_RESULT: done"));
  assert.ok(text.includes("TASK_RESULT: blocked"));
});
