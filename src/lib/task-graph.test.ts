import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isReady,
  readyTasks,
  removeDependency,
  TaskValidationError,
  validateDependencies,
  waitingOn,
} from "./task-graph.ts";
import type { Task } from "./types.ts";

function task(id: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    sessionID: "s",
    title: `Title ${id}`,
    description: "",
    prompt: "",
    status: "pending",
    priority: "medium",
    createdAt: 1,
    updatedAt: 1,
    dependsOn: [],
    ...extra,
  };
}

const byId = (tasks: Task[]) => new Map(tasks.map((t) => [t.id, t]));

test("rejects a self-dependency", () => {
  const tasks = [task("a")];
  assert.throws(() => validateDependencies("a", ["a"], tasks), TaskValidationError);
});

test("rejects an unknown id", () => {
  assert.throws(
    () => validateDependencies("a", ["zzz"], [task("a")]),
    TaskValidationError,
  );
});

test("rejects a 2-cycle and names titles", () => {
  const tasks = [task("a"), task("b", { dependsOn: ["a"] })];
  assert.throws(
    () => validateDependencies("a", ["b"], tasks),
    (error: Error) =>
      error instanceof TaskValidationError &&
      error.message.includes("Title a") &&
      error.message.includes("Title b"),
  );
});

test("rejects a 3-cycle and names titles", () => {
  const tasks = [
    task("a"),
    task("b", { dependsOn: ["a"] }),
    task("c", { dependsOn: ["b"] }),
  ];
  assert.throws(
    () => validateDependencies("a", ["c"], tasks),
    (error: Error) =>
      error instanceof TaskValidationError &&
      ["Title a", "Title b", "Title c"].every((t) => error.message.includes(t)),
  );
});

test("dedupes ids and accepts valid dependencies", () => {
  const tasks = [task("a"), task("b")];
  assert.deepEqual(validateDependencies("b", ["a", "a"], tasks), ["a"]);
});

test("rejects more than 20 dependencies and non-arrays", () => {
  const many = Array.from({ length: 21 }, (_, i) => task(`t${i}`));
  const ids = many.map((t) => t.id);
  assert.throws(() => validateDependencies(null, ids, many), TaskValidationError);
  assert.throws(() => validateDependencies(null, "a", many), TaskValidationError);
});

test("new task (null id) may depend on existing tasks", () => {
  assert.deepEqual(validateDependencies(null, ["a"], [task("a")]), ["a"]);
});

test("isReady is false while a dependency is pending, blocked or cancelled", () => {
  for (const status of ["pending", "blocked", "cancelled"] as const) {
    const tasks = [task("a", { status }), task("b", { dependsOn: ["a"] })];
    assert.equal(isReady(tasks[1], byId(tasks)), false, status);
  }
});

test("isReady is true once every dependency is completed", () => {
  const tasks = [
    task("a", { status: "completed" }),
    task("b", { status: "completed" }),
    task("c", { dependsOn: ["a", "b"] }),
  ];
  assert.equal(isReady(tasks[2], byId(tasks)), true);
});

test("isReady is false for a missing dependency or non-pending task", () => {
  const tasks = [task("a", { dependsOn: ["gone"] }), task("b", { status: "completed" })];
  assert.equal(isReady(tasks[0], byId(tasks)), false);
  assert.equal(isReady(tasks[1], byId(tasks)), false);
});

test("readyTasks orders by priority then createdAt", () => {
  const tasks = [
    task("low", { priority: "low", createdAt: 1 }),
    task("med2", { priority: "medium", createdAt: 5 }),
    task("high", { priority: "high", createdAt: 9 }),
    task("med1", { priority: "medium", createdAt: 2 }),
    task("blocked", { dependsOn: ["low"], priority: "high" }),
  ];
  assert.deepEqual(
    readyTasks(tasks).map((t) => t.id),
    ["high", "med1", "med2", "low"],
  );
});

test("waitingOn lists titles of unfinished dependencies", () => {
  const tasks = [
    task("a", { status: "completed" }),
    task("b"),
    task("c", { dependsOn: ["a", "b"] }),
  ];
  assert.deepEqual(waitingOn(tasks[2], byId(tasks)), ["Title b"]);
});

test("removeDependency strips the id from every task", () => {
  const tasks = [
    task("a"),
    task("b", { dependsOn: ["a"] }),
    task("c", { dependsOn: ["a", "b"] }),
  ];
  const next = removeDependency(tasks, "a");
  assert.deepEqual(next[1].dependsOn, []);
  assert.deepEqual(next[2].dependsOn, ["b"]);
  assert.equal(next[0], tasks[0]);
});
