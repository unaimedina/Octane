import {
  abortSession,
  addContext,
  getMessages,
  getSessionStatuses,
} from "./session-service";
import { parseTaskResult } from "./task-prompt";
import { listTasks, mutateTasks } from "./tasks";
import type { Task, TaskRun, TaskRunOutcome, TaskStatus } from "./types";

const START_SLACK_MS = 2_000;
const START_TIMEOUT_MS = 120_000;
const MAX_SUMMARY = 500;
/** A worker claim (`run.sessionID === ""`) older than this failed to start. */
export const WORKER_START_TIMEOUT_MS = 120_000;
export const WORKER_TIMEOUT_MS = 2 * 60 * 60 * 1000;

type Decision = {
  taskID: string;
  startedAt: number;
  sessionID: string;
  status: TaskStatus;
  outcome: TaskRunOutcome;
  summary?: string;
};

function clip(text: string | undefined): string | undefined {
  const value = text?.trim();
  return value ? value.slice(0, MAX_SUMMARY) : undefined;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const record = error as { data?: { message?: unknown }; name?: unknown };
    if (typeof record.data?.message === "string" && record.data.message) {
      return record.data.message;
    }
    if (typeof record.name === "string") return record.name;
  }
  return "The agent reported an error.";
}

async function decide(task: Task, run: TaskRun): Promise<Decision | null> {
  const base = {
    taskID: task.id,
    startedAt: run.startedAt,
    sessionID: run.sessionID,
  };
  const messages = await getMessages(run.sessionID);
  const assistants = messages.filter(
    (message) =>
      message.info.role === "assistant" &&
      message.info.time.created >= run.startedAt - START_SLACK_MS,
  );
  if (assistants.length === 0) {
    if (Date.now() - run.startedAt < START_TIMEOUT_MS) return null;
    return {
      ...base,
      status: "pending",
      outcome: "error",
      summary: "The agent never started this task.",
    };
  }

  const last = assistants[assistants.length - 1];
  const info = last.info;
  if (info.role === "assistant" && info.error) {
    if (info.error.name === "MessageAbortedError") {
      return { ...base, status: "pending", outcome: "aborted" };
    }
    return {
      ...base,
      status: "pending",
      outcome: "error",
      summary: clip(errorMessage(info.error)),
    };
  }

  // Still being generated (statuses may have failed open); re-check on the next load.
  if (info.role === "assistant" && !info.time.completed) return null;

  const text = last.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");
  const result = parseTaskResult(text);
  if (!result) {
    return { ...base, status: "completed", outcome: "unverified" };
  }
  return {
    ...base,
    status: result.outcome === "done" ? "completed" : "blocked",
    outcome: result.outcome,
    summary: clip(result.summary),
  };
}

/** 1-based position of `task` in the list, ordered by creation. */
export function taskNumber(task: Task, all: Task[]): number {
  const index = [...all]
    .sort((a, b) => a.createdAt - b.createdAt)
    .findIndex((item) => item.id === task.id);
  return index === -1 ? all.length + 1 : index + 1;
}

/** Best-effort note in the parent chat when a worker task settles. */
async function postWorkerResults(
  sessionID: string,
  settled: Task[],
  all: Task[],
): Promise<void> {
  for (const task of settled) {
    const run = task.run;
    if (!run || run.mode !== "worker" || !run.sessionID) continue;
    const title = task.title.trim().slice(0, 120);
    const summary = run.summary ? ` — ${run.summary}` : "";
    try {
      await addContext(
        sessionID,
        `Task #${taskNumber(task, all)} "${title}" finished in worker session ${run.sessionID}: ${run.outcome ?? "unknown"}${summary}`,
        "Task result",
      );
    } catch {
      // The note is informational; the task list already has the outcome.
    }
  }
}

/**
 * Settle running tasks whose OpenCode session is no longer busy, deciding the
 * outcome from the transcript. Worker claims that never got a session and
 * workers that ran too long are failed. Returns the fresh task list.
 */
export async function reconcileTasks(
  subject: string,
  sessionID: string,
): Promise<Task[]> {
  const tasks = await listTasks(subject, sessionID);
  const running = tasks.filter(
    (task) => task.status === "in_progress" && task.run,
  );
  if (running.length === 0) return tasks;

  const now = Date.now();
  const decisions: Decision[] = [];
  const live: Task[] = [];
  for (const task of running) {
    const run = task.run as TaskRun;
    const base = { taskID: task.id, startedAt: run.startedAt, sessionID: run.sessionID };
    if (run.mode === "worker" && !run.sessionID) {
      // Claimed by the scheduler; the worker session is still being created.
      if (now - run.startedAt > WORKER_START_TIMEOUT_MS) {
        decisions.push({
          ...base,
          status: "pending",
          outcome: "error",
          summary: "Worker failed to start.",
        });
      }
      continue;
    }
    if (run.mode === "worker" && now - run.startedAt > WORKER_TIMEOUT_MS) {
      await abortSession(run.sessionID).catch(() => undefined);
      decisions.push({ ...base, status: "pending", outcome: "error", summary: "Timed out." });
      continue;
    }
    live.push(task);
  }

  const statuses = live.length > 0 ? await getSessionStatuses() : {};
  for (const task of live) {
    const run = task.run as TaskRun;
    const status = statuses[run.sessionID];
    if (status && status.type !== "idle") continue;
    try {
      const decision = await decide(task, run);
      if (decision) decisions.push(decision);
    } catch {
      // Transcript unavailable; try again on the next load.
    }
  }
  if (decisions.length === 0) return tasks;

  const { tasks: fresh, result: settled } = await mutateTasks<Task[]>(
    subject,
    sessionID,
    (current) => {
      const now = Date.now();
      const settled: Task[] = [];
      const next = current.map((task) => {
        const decision = decisions.find((item) => item.taskID === task.id);
        if (
          !decision ||
          task.status !== "in_progress" ||
          !task.run ||
          task.run.startedAt !== decision.startedAt ||
          task.run.sessionID !== decision.sessionID
        ) {
          return task;
        }
        const updated: Task = {
          ...task,
          status: decision.status,
          run: {
            ...task.run,
            endedAt: now,
            outcome: decision.outcome,
            ...(decision.summary ? { summary: decision.summary } : {}),
          },
          updatedAt: now,
        };
        if (decision.status === "completed") updated.completedAt = now;
        else delete updated.completedAt;
        settled.push(updated);
        return updated;
      });
      return { tasks: next, result: settled };
    },
  );
  if (settled?.length) await postWorkerResults(sessionID, settled, fresh);
  return fresh;
}
