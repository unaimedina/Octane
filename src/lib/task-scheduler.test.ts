import assert from "node:assert/strict";
import { test } from "node:test";
import { clampParallel, planSchedule } from "./task-schedule-plan.ts";
import type { Task } from "./types.ts";

let clock = 0;

function task(id: string, extra: Partial<Task> = {}): Task {
  clock += 1;
  return {
    id,
    sessionID: "s",
    title: `Title ${id}`,
    description: "",
    prompt: "",
    status: "pending",
    priority: "medium",
    createdAt: clock,
    updatedAt: clock,
    dependsOn: [],
    ...extra,
  };
}

const ids = (tasks: Task[]) => tasks.map((item) => item.id);

test("starts at most maxParallel independent ready tasks", () => {
  const plan = planSchedule([task("a"), task("b"), task("c")], 2);
  assert.deepEqual(ids(plan.start), ["a", "b"]);
  assert.equal(plan.done, false);
  assert.equal(plan.stalled, false);
});

test("counts tasks that are already running", () => {
  const plan = planSchedule(
    [task("a", { status: "in_progress" }), task("b"), task("c")],
    2,
  );
  assert.deepEqual(ids(plan.start), ["b"]);
});

test("starts nothing when the parallel limit is reached", () => {
  const plan = planSchedule(
    [task("a", { status: "in_progress" }), task("b", { status: "in_progress" }), task("c")],
    2,
  );
  assert.deepEqual(plan.start, []);
  assert.equal(plan.stalled, false);
});

test("walks a diamond A -> (B, C) -> D in dependency order", () => {
  const diamond = (status: Partial<Record<string, Task["status"]>>) => [
    task("a", { status: status.a ?? "pending" }),
    task("b", { status: status.b ?? "pending", dependsOn: ["a"] }),
    task("c", { status: status.c ?? "pending", dependsOn: ["a"] }),
    task("d", { status: status.d ?? "pending", dependsOn: ["b", "c"] }),
  ];
  assert.deepEqual(ids(planSchedule(diamond({}), 4).start), ["a"]);
  assert.deepEqual(
    ids(planSchedule(diamond({ a: "completed" }), 4).start),
    ["b", "c"],
  );
  assert.deepEqual(
    ids(planSchedule(diamond({ a: "completed", b: "completed" }), 4).start),
    ["c"],
  );
  assert.deepEqual(
    ids(
      planSchedule(diamond({ a: "completed", b: "completed", c: "completed" }), 4)
        .start,
    ),
    ["d"],
  );
});

test("reports done when every task is completed or cancelled", () => {
  const plan = planSchedule(
    [task("a", { status: "completed" }), task("b", { status: "cancelled" })],
    2,
  );
  assert.deepEqual(plan.start, []);
  assert.equal(plan.done, true);
  assert.equal(plan.stalled, false);
});

test("reports stalled when a blocked task holds up its dependents", () => {
  const plan = planSchedule(
    [task("a", { status: "blocked" }), task("b", { dependsOn: ["a"] })],
    2,
  );
  assert.deepEqual(plan.start, []);
  assert.equal(plan.done, false);
  assert.equal(plan.stalled, true);
});

test("is not stalled while a task is still running", () => {
  const plan = planSchedule(
    [task("a", { status: "in_progress" }), task("b", { dependsOn: ["a"] })],
    2,
  );
  assert.equal(plan.stalled, false);
});

test("starts high priority tasks before low priority ones", () => {
  const plan = planSchedule(
    [task("low", { priority: "low" }), task("high", { priority: "high" })],
    1,
  );
  assert.deepEqual(ids(plan.start), ["high"]);
});

test("clamps maxParallel to 1..4", () => {
  assert.equal(clampParallel(0), 1);
  assert.equal(clampParallel(9), 4);
  assert.equal(clampParallel(3.7), 3);
  assert.equal(clampParallel("2"), 2);
  const many = Array.from({ length: 6 }, (_, index) => task(`t${index}`));
  assert.equal(planSchedule(many, 10).start.length, 4);
});
