import { readyTasks } from "./task-graph.ts";
import type { Task } from "./types.ts";

export const MIN_PARALLEL = 1;
export const MAX_PARALLEL = 4;
export const DEFAULT_PARALLEL = 2;

export function clampParallel(value: unknown): number {
  const number = typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : DEFAULT_PARALLEL;
  return Math.min(MAX_PARALLEL, Math.max(MIN_PARALLEL, number));
}

export type SchedulePlan = {
  /** Ready tasks to start now, highest priority first. */
  start: Task[];
  /** Every task is completed or cancelled. */
  done: boolean;
  /** Nothing is running or ready, but some tasks are still open. */
  stalled: boolean;
};

/**
 * Decide which tasks to start next. Pure: no I/O, so it can be unit tested.
 * Ready = pending with every dependency completed (see `readyTasks`).
 */
export function planSchedule(tasks: Task[], maxParallel: number): SchedulePlan {
  const running = tasks.filter((task) => task.status === "in_progress").length;
  const free = Math.max(0, clampParallel(maxParallel) - running);
  const ready = readyTasks(tasks);
  const done = tasks.every(
    (task) => task.status === "completed" || task.status === "cancelled",
  );
  return {
    start: ready.slice(0, free),
    done,
    stalled: !done && running === 0 && ready.length === 0,
  };
}
