import { getMessages, getSessionStatuses } from "./session-service";
import { parseTaskResult } from "./task-prompt";
import { listTasks, mutateTasks } from "./tasks";
import type { Task, TaskRun, TaskRunOutcome, TaskStatus } from "./types";

const START_SLACK_MS = 2_000;
const START_TIMEOUT_MS = 120_000;
const MAX_SUMMARY = 500;

type Decision = {
  taskID: string;
  startedAt: number;
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
  const base = { taskID: task.id, startedAt: run.startedAt };
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

/**
 * Settle running tasks whose OpenCode session is no longer busy, deciding the
 * outcome from the transcript. Returns the fresh task list.
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

  const statuses = await getSessionStatuses();
  const decisions: Decision[] = [];
  for (const task of running) {
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

  const { tasks: fresh } = await mutateTasks(subject, sessionID, (current) => {
    const now = Date.now();
    const next = current.map((task) => {
      const decision = decisions.find((item) => item.taskID === task.id);
      if (
        !decision ||
        task.status !== "in_progress" ||
        !task.run ||
        task.run.startedAt !== decision.startedAt
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
      return updated;
    });
    return { tasks: next };
  });
  return fresh;
}
