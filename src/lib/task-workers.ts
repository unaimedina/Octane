import {
  createSession,
  deleteSession,
  getSession,
  promptSession,
} from "./session-service";
import { isReady, waitingOn } from "./task-graph";
import { buildTaskRunText } from "./task-prompt";
import { taskNumber } from "./task-runner";
import {
  getRunner,
  mutateTasks,
  recordWorker,
  TaskConflictError,
  TaskNotFoundError,
} from "./tasks";
import type { Task } from "./types";

export type WorkerOptions = {
  agent?: string;
  model?: { providerID: string; modelID: string };
};

export const WORKER_PREAMBLE = [
  "You are a worker agent executing one task from a shared task list.",
  "Other workers may be editing other files in this same folder right now.",
  "- Only change files needed for this task.",
  "- Never revert, reformat or delete changes you did not make.",
  "- Do not run git commit, checkout, reset, stash, rebase or merge.",
  "- If another change blocks you, stop and report it with TASK_RESULT: blocked.",
].join("\n");

function sameDirectory(a: string, b: string): boolean {
  const clean = (value: string) => {
    const normalized = value.trim().replace(/\\/g, "/").replace(/\/+$/, "");
    return /^[a-z]:/i.test(normalized) ? normalized.toLowerCase() : normalized;
  };
  return clean(a) === clean(b);
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message.slice(0, 500)
    : "Worker failed to start.";
}

/** A task claimed for a worker: `in_progress` with an empty `run.sessionID`. */
export function claimTask(task: Task, startedAt: number): Task {
  const claimed: Task = {
    ...task,
    status: "in_progress",
    run: { mode: "worker", sessionID: "", startedAt },
    updatedAt: startedAt,
  };
  delete claimed.completedAt;
  return claimed;
}

async function failClaim(
  subject: string,
  sessionID: string,
  claimed: Task,
  summary: string,
): Promise<void> {
  const startedAt = claimed.run?.startedAt;
  await mutateTasks(subject, sessionID, (tasks) => {
    const now = Date.now();
    return {
      tasks: tasks.map((task): Task =>
        task.id === claimed.id &&
        task.status === "in_progress" &&
        task.run &&
        task.run.startedAt === startedAt
          ? {
              ...task,
              status: "pending",
              run: { ...task.run, endedAt: now, outcome: "error", summary },
              updatedAt: now,
            }
          : task,
      ),
    };
  }).catch(() => undefined);
}

/**
 * Create a worker session for a task that is already claimed (see
 * `claimTask`), record it on the task, and send the task prompt. No store
 * lock is held while talking to OpenCode. On failure the task goes back to
 * `pending` with outcome `error`, and the error is rethrown.
 */
export async function launchWorker(
  subject: string,
  sessionID: string,
  claimed: Task,
  options: WorkerOptions = {},
  number?: number,
): Promise<Task | null> {
  const startedAt = claimed.run?.startedAt ?? Date.now();
  let workerID = "";
  try {
    const parent = await getSession(sessionID);
    const title = `Task #${number ?? "?"} · ${claimed.title.trim()}`.slice(0, 120);
    const worker = await createSession(title, parent.directory || undefined);
    workerID = worker.id;
    if (
      parent.directory &&
      worker.directory &&
      !sameDirectory(parent.directory, worker.directory)
    ) {
      throw new Error(
        `Worker session opened in ${worker.directory} instead of ${parent.directory}.`,
      );
    }

    await recordWorker(subject, sessionID, {
      sessionID: worker.id,
      taskId: claimed.id,
      title,
      startedAt,
    }).catch(() => undefined); // Never fail a worker launch over bookkeeping.

    // Record the worker before prompting, so a reload can find it.
    const { result: recorded } = await mutateTasks<Task>(subject, sessionID, (tasks) => {
      const index = tasks.findIndex(
        (task) =>
          task.id === claimed.id &&
          task.status === "in_progress" &&
          task.run?.startedAt === startedAt &&
          task.run.sessionID === "",
      );
      if (index === -1) return { tasks };
      const task: Task = {
        ...tasks[index],
        run: { mode: "worker", sessionID: worker.id, startedAt },
        updatedAt: Date.now(),
      };
      const next = [...tasks];
      next[index] = task;
      return { tasks: next, result: task };
    });
    if (!recorded) {
      // Stopped or edited while the worker was being created.
      await deleteSession(worker.id).catch(() => undefined);
      return null;
    }

    await promptSession(worker.id, {
      agent: options.agent || "build",
      ...(options.model ? { model: options.model } : {}),
      parts: [
        { type: "text", text: `${WORKER_PREAMBLE}\n\n${buildTaskRunText(recorded)}` },
      ],
    });
    return recorded;
  } catch (error) {
    if (workerID) await deleteSession(workerID).catch(() => undefined);
    await failClaim(subject, sessionID, claimed, messageOf(error));
    throw error;
  }
}

/**
 * Run one task in a new worker session (the per-row "Run in a worker"
 * action). Refuses when the task is not ready or the parallel limit is hit.
 */
export async function startWorker(
  subject: string,
  sessionID: string,
  taskID: string,
  options: WorkerOptions = {},
): Promise<Task> {
  const runner = await getRunner(subject, sessionID);
  const startedAt = Date.now();
  const { result, tasks } = await mutateTasks<Task>(subject, sessionID, (tasks) => {
    const index = tasks.findIndex((task) => task.id === taskID);
    if (index === -1) throw new TaskNotFoundError();
    const task = tasks[index];
    const byId = new Map(tasks.map((item) => [item.id, item]));
    if (task.status === "in_progress") {
      throw new TaskConflictError("Task is already running.", "already_running");
    }
    if (!isReady(task, byId)) {
      const waiting = waitingOn(task, byId);
      throw new TaskConflictError(
        waiting.length > 0
          ? `Waiting on: ${waiting.join(", ")}`
          : `Task is ${task.status}; only pending tasks can run.`,
        "not_ready",
      );
    }
    const running = tasks.filter((item) => item.status === "in_progress").length;
    if (running >= runner.maxParallel) {
      throw new TaskConflictError(
        `${running} task(s) already running (limit ${runner.maxParallel}).`,
        "parallel_limit",
      );
    }
    const claimed = claimTask(task, startedAt);
    const next = [...tasks];
    next[index] = claimed;
    return { tasks: next, result: claimed };
  });
  if (!result) throw new Error("Task could not be started.");
  const started = await launchWorker(
    subject,
    sessionID,
    result,
    options,
    taskNumber(result, tasks),
  );
  if (!started) throw new TaskConflictError("Task was stopped before it started.", "not_running");
  return started;
}
