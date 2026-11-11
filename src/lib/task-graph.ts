import type { Task, TaskPriority } from "./types.ts";

export const MAX_DEPENDENCIES = 20;

export class TaskValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "TaskValidationError";
  }
}

export class TaskConflictError extends Error {
  readonly status = 409;
  readonly code: string;

  constructor(message: string, code = "conflict") {
    super(message);
    this.name = "TaskConflictError";
    this.code = code;
  }
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Validate and normalise a dependency list. `taskId` is null for a task that
 * does not exist yet. Throws `TaskValidationError` on bad input.
 */
export function validateDependencies(
  taskId: string | null,
  dependsOn: unknown,
  tasks: Task[],
): string[] {
  if (dependsOn === undefined || dependsOn === null) return [];
  if (!Array.isArray(dependsOn)) {
    throw new TaskValidationError("Task dependencies must be a list of task ids.");
  }
  const ids: string[] = [];
  for (const value of dependsOn) {
    if (typeof value !== "string" || !value) {
      throw new TaskValidationError("Task dependencies must be a list of task ids.");
    }
    if (!ids.includes(value)) ids.push(value);
  }
  if (ids.length > MAX_DEPENDENCIES) {
    throw new TaskValidationError(
      `A task can depend on at most ${MAX_DEPENDENCIES} other tasks.`,
    );
  }

  const byId = new Map(tasks.map((task) => [task.id, task]));
  for (const id of ids) {
    if (taskId !== null && id === taskId) {
      throw new TaskValidationError("A task cannot depend on itself.");
    }
    if (!byId.has(id)) {
      throw new TaskValidationError("A dependency refers to a task that does not exist.");
    }
  }

  if (taskId !== null) {
    for (const id of ids) {
      const path = findPath(id, taskId, byId);
      if (path) {
        // `path` runs from the new dependency back to `taskId`, closing the loop.
        const titles = [taskId, ...path].map((node) => byId.get(node)?.title ?? node);
        throw new TaskValidationError(`Dependency cycle: ${titles.join(" -> ")}.`);
      }
    }
  }
  return ids;
}

/** Path of ids from `from` to `to` following dependsOn edges, or null. */
function findPath(
  from: string,
  to: string,
  byId: Map<string, Task>,
): string[] | null {
  const visited = new Set<string>();
  const walk = (node: string): string[] | null => {
    if (node === to) return [node];
    if (visited.has(node)) return null;
    visited.add(node);
    for (const next of byId.get(node)?.dependsOn ?? []) {
      const rest = walk(next);
      if (rest) return [node, ...rest];
    }
    return null;
  };
  return walk(from);
}

export function isReady(task: Task, byId: Map<string, Task>): boolean {
  if (task.status !== "pending") return false;
  return (task.dependsOn ?? []).every(
    (id) => byId.get(id)?.status === "completed",
  );
}

export function readyTasks(tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return tasks
    .filter((task) => isReady(task, byId))
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        a.createdAt - b.createdAt,
    );
}

/** Titles of the dependencies that are not completed yet. */
export function waitingOn(task: Task, byId: Map<string, Task>): string[] {
  return (task.dependsOn ?? [])
    .filter((id) => byId.get(id)?.status !== "completed")
    .map((id) => byId.get(id)?.title ?? "(deleted task)");
}

/** Remove `id` from every task's dependsOn. Returns new task objects. */
export function removeDependency(tasks: Task[], id: string): Task[] {
  return tasks.map((task) =>
    (task.dependsOn ?? []).includes(id)
      ? { ...task, dependsOn: task.dependsOn.filter((dep) => dep !== id) }
      : task,
  );
}
