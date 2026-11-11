import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addWorkerRecord,
  mergeWorkerRecords,
  normalizeWorkerRecords,
  MAX_WORKER_RECORDS,
} from "./worker-records.ts";
import type { Task, WorkerRecord } from "./types.ts";

function rec(n: number, extra: Partial<WorkerRecord> = {}): WorkerRecord {
  return { sessionID: `s${n}`, taskId: `t${n}`, title: `Task ${n}`, startedAt: n, ...extra };
}

function task(id: string, run: Task["run"], title = "Title"): Task {
  return {
    id,
    sessionID: "p",
    title,
    description: "",
    prompt: "",
    status: "in_progress",
    priority: "medium",
    createdAt: 0,
    updatedAt: 0,
    dependsOn: [],
    run,
  } as Task;
}

test("normalize drops invalid input and cuts titles", () => {
  assert.deepEqual(normalizeWorkerRecords("nope"), []);
  assert.deepEqual(normalizeWorkerRecords(undefined), []);
  const out = normalizeWorkerRecords([
    { sessionID: "", taskId: "t", title: "x", startedAt: 1 },
    { sessionID: "a", taskId: "", title: "x", startedAt: 1 },
    { sessionID: "a", taskId: "t", title: "x", startedAt: "1" },
    { sessionID: "a", taskId: "t", title: "x", startedAt: Number.NaN },
    { sessionID: "a", taskId: "t", title: "x".repeat(200), startedAt: 1 },
    null,
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].title.length, 120);
});

test("duplicates by sessionID collapse", () => {
  const out = normalizeWorkerRecords([rec(1), rec(1, { title: "other" })]);
  assert.equal(out.length, 1);
});

test("output is newest first", () => {
  const out = normalizeWorkerRecords([rec(1), rec(3), rec(2)]);
  assert.deepEqual(
    out.map((r) => r.sessionID),
    ["s3", "s2", "s1"],
  );
});

test("capping keeps the newest", () => {
  const input = Array.from({ length: 250 }, (_, i) => rec(i + 1));
  const out = normalizeWorkerRecords(input);
  assert.equal(out.length, MAX_WORKER_RECORDS);
  assert.equal(out[0].startedAt, 250);
  assert.equal(out[out.length - 1].startedAt, 51);
});

test("merge adds run-only workers and ignores others", () => {
  const tasks = [
    task("a", { mode: "worker", sessionID: "w1", startedAt: 10 }, "A"),
    task("b", { mode: "session", sessionID: "x", startedAt: 20 }),
    task("c", { mode: "worker", sessionID: "", startedAt: 30 }),
    task("d", undefined),
  ];
  const out = mergeWorkerRecords([], tasks);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { sessionID: "w1", taskId: "a", title: "A", startedAt: 10 });
});

test("merge prefers the store record on a clash", () => {
  const stored = rec(1, { sessionID: "w1", title: "Stored", startedAt: 10 });
  const tasks = [task("a", { mode: "worker", sessionID: "w1", startedAt: 10 }, "Derived")];
  const out = mergeWorkerRecords([stored], tasks);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, "Stored");
});

test("addWorkerRecord replaces same sessionID and puts it first", () => {
  const out = addWorkerRecord([rec(1), rec(2)], rec(1, { title: "new", startedAt: 99 }));
  assert.equal(out.length, 2);
  assert.equal(out[0].sessionID, "s1");
  assert.equal(out[0].title, "new");
});
