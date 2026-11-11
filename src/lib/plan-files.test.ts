import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePlanFile, parsePlanIndex, planTaskPrompt } from "./plan-files.ts";

const INDEX = `# Implementation Plans

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001 | Projects workspace with local directories, global context and GitHub links | P1 | L | — | DONE |
| 003 | Replace project global context with AGENTS.md and uploaded context files | P1 | L | none | TODO |
| 004 | Task dependencies, server-owned run lifecycle and verified completion | P1 | L | 002 (soft) | IN PROGRESS |
| 005 | Import improve-style plan files as a dependency-aware task list | P2 | M | 004 | BLOCKED (waiting on creds) |
| 006 | Parallel worker sessions and Auto-run button | P3 | L | 004, 005 (soft) | TODO |

Status values: \`TODO\` | \`IN PROGRESS\` | \`DONE\` | \`BLOCKED\` | \`REJECTED\`.
`;

const PLAN_004 = `# Plan 004: Add task dependencies, a server-owned run lifecycle and verified completion

> **Executor instructions**: Follow this plan step by step.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MEDIUM (store format migration)
- **Depends on**: plans/002-tasks-panel-row-overflow.md (soft: same file, apply 002 first to avoid conflicts)
- **Category**: direction / bug

## Why this matters

Today the Tasks system is a flat checklist. The browser tab decides when a
task ends.

1. If you close the tab, the task stays \`in_progress\` forever.

## Current state

- Something else.
`;

test("index parses numbers, titles, priority and statuses", () => {
  const rows = parsePlanIndex(INDEX);
  assert.equal(rows.length, 5);
  assert.deepEqual(
    rows.map((row) => row.number),
    ["001", "003", "004", "005", "006"],
  );
  assert.equal(
    rows[0].title,
    "Projects workspace with local directories, global context and GitHub links",
  );
  assert.deepEqual(
    rows.map((row) => row.status),
    ["DONE", "TODO", "IN PROGRESS", "BLOCKED", "TODO"],
  );
  assert.deepEqual(
    rows.map((row) => row.priority),
    ["P1", "P1", "P1", "P2", "P3"],
  );
});

test("index BLOCKED with trailing text maps to BLOCKED", () => {
  assert.equal(parsePlanIndex(INDEX)[3].status, "BLOCKED");
});

test("index depends-on cell variants", () => {
  const rows = parsePlanIndex(INDEX);
  assert.deepEqual(rows[0].dependsOn, []); // —
  assert.deepEqual(rows[1].dependsOn, []); // none
  assert.deepEqual(rows[2].dependsOn, ["002"]); // 002 (soft)
  assert.deepEqual(rows[3].dependsOn, ["004"]); // 004
  assert.deepEqual(rows[4].dependsOn, ["004", "005"]); // 004, 005 (soft)
});

test("index depends-on supports hyphen and plain 002, 003", () => {
  const rows = parsePlanIndex(`| Plan | Status | Depends on |
|---|---|---|
| 001 | TODO | - |
| 004 | TODO | 002, 003 |
| 005 | TODO | 005, 004 |
`);
  assert.deepEqual(rows[0].dependsOn, []);
  assert.deepEqual(rows[1].dependsOn, ["002", "003"]);
  assert.deepEqual(rows[2].dependsOn, ["004"]); // own number excluded
});

test("index maps columns by header name, not position", () => {
  const rows = parsePlanIndex(`| Status | Depends on | Title | Plan | Priority |
|---|---|---|---|---|
| DONE | 001 | Second plan | 002 | P2 |
`);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    number: "002",
    title: "Second plan",
    priority: "P2",
    dependsOn: ["001"],
    status: "DONE",
  });
});

test("index without a Status column yields no rows", () => {
  assert.deepEqual(
    parsePlanIndex(`| Plan | Title |
|---|---|
| 001 | Something |
`),
    [],
  );
});

test("index keeps escaped pipes inside cells and skips unnumbered rows", () => {
  const rows = parsePlanIndex(`| Plan | Title | Status |
|---|---|---|
| 001 | Use a \\| b | TODO |
| n/a | No number | TODO |
| 002 | Odd status | WHATEVER |
`);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, "Use a | b");
  assert.equal(rows[1].status, "UNKNOWN");
});

test("plan file parses title, priority, dependencies and why", () => {
  const info = parsePlanFile(PLAN_004, "004");
  assert.equal(info.number, "004");
  assert.equal(
    info.title,
    "Add task dependencies, a server-owned run lifecycle and verified completion",
  );
  assert.equal(info.priority, "P1");
  assert.deepEqual(info.dependsOn, ["002"]);
  assert.ok(info.why.startsWith("Today the Tasks system is a flat checklist."));
  assert.ok(info.why.includes("stays `in_progress` forever"));
  assert.ok(!info.why.includes("Current state"));
  assert.ok(!info.why.includes("Something else"));
});

test("plan file with Depends on: none has no dependencies", () => {
  const info = parsePlanFile(
    "# Plan 002: X\n\n## Status\n\n- **Priority**: P2\n- **Depends on**: none\n",
    "002",
  );
  assert.deepEqual(info.dependsOn, []);
  assert.equal(info.priority, "P2");
  assert.equal(info.why, "");
});

test("plan file without a Plan heading falls back", () => {
  const plain = parsePlanFile("Just some text.\n", "007");
  assert.equal(plain.title, "Plan 007");
  assert.equal(plain.number, "007");
  const headed = parsePlanFile("# Fix the thing\n", "008");
  assert.equal(headed.title, "Fix the thing");
});

test("planTaskPrompt names the plan file and the index", () => {
  const prompt = planTaskPrompt("plans", "004-task-graph.md");
  assert.ok(prompt.includes("`plans/004-task-graph.md`"));
  assert.ok(prompt.includes("`plans/README.md`"));
  assert.ok(prompt.includes("STOP conditions"));
});
