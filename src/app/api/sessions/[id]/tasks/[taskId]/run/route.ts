import type { NextRequest } from "next/server";
import { guard, failure, jsonBody, noStoreJson } from "@/lib/bff";
import { promptSession, getSessionStatuses } from "@/lib/session-service";
import { isReady, waitingOn } from "@/lib/task-graph";
import { buildTaskRunText } from "@/lib/task-prompt";
import { reconcileTasks } from "@/lib/task-runner";
import { startWorker } from "@/lib/task-workers";
import {
  mutateTasks,
  TaskConflictError,
  TaskNotFoundError,
  TaskValidationError,
} from "@/lib/tasks";
import type { Task } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RunBody = {
  /** "session" (default) runs in this chat; "worker" in a new session. */
  mode?: "session" | "worker";
  agent?: string;
  model?: { providerID: string; modelID: string };
};

function taskFailure(error: unknown): Response {
  if (error instanceof TaskValidationError) {
    return noStoreJson({ error: "bad_request", message: error.message }, 400);
  }
  if (error instanceof TaskNotFoundError) {
    return noStoreJson({ error: "not_found", message: error.message }, 404);
  }
  if (error instanceof TaskConflictError) {
    return noStoreJson({ error: error.code, message: error.message }, 409);
  }
  return failure(error);
}

function assertRunnable(task: Task, byId: Map<string, Task>): void {
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
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; taskId: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id, taskId } = await context.params;
    const subject = auth.session.subject;
    const body = (await jsonBody<RunBody>(request)) ?? {};
    const agent =
      typeof body.agent === "string" && body.agent ? body.agent : "build";
    const model =
      body.model &&
      typeof body.model.providerID === "string" &&
      typeof body.model.modelID === "string"
        ? { providerID: body.model.providerID, modelID: body.model.modelID }
        : undefined;

    if (body.mode !== undefined && body.mode !== "session" && body.mode !== "worker") {
      throw new TaskValidationError('mode must be "session" or "worker".');
    }

    // 1. Settle anything that finished while nobody was looking.
    const current = await reconcileTasks(subject, id);

    if (body.mode === "worker") {
      // Readiness and the parallel limit are checked under the store lock.
      const task = await startWorker(subject, id, taskId, { agent, model });
      return noStoreJson({ task });
    }

    const target = current.find((task) => task.id === taskId);
    if (!target) throw new TaskNotFoundError();

    // 2. Readiness (re-checked under the lock below).
    assertRunnable(target, new Map(current.map((task) => [task.id, task])));

    // 3. One turn at a time per OpenCode session.
    const statuses = await getSessionStatuses();
    const sessionStatus = statuses[id];
    if (sessionStatus && sessionStatus.type !== "idle") {
      throw new TaskConflictError(
        "Wait for the current turn to finish.",
        "session_busy",
      );
    }

    // 2 + 4. Check readiness and claim the task under the store lock.
    const startedAt = Date.now();
    const { result } = await mutateTasks<{ task: Task; previous: Task }>(
      subject,
      id,
      (tasks) => {
        const index = tasks.findIndex((task) => task.id === taskId);
        if (index === -1) throw new TaskNotFoundError();
        const previous = tasks[index];
        assertRunnable(previous, new Map(tasks.map((task) => [task.id, task])));
        const task: Task = {
          ...previous,
          status: "in_progress",
          run: { mode: "session", sessionID: id, startedAt },
          updatedAt: startedAt,
        };
        delete task.completedAt;
        const next = [...tasks];
        next[index] = task;
        return { tasks: next, result: { task, previous } };
      },
    );
    if (!result) throw new Error("Task could not be started.");

    // 5. Send the prompt; undo the claim if that fails.
    try {
      await promptSession(id, {
        agent,
        model,
        parts: [{ type: "text", text: buildTaskRunText(result.task) }],
      });
    } catch (error) {
      await mutateTasks(subject, id, (tasks) => ({
        tasks: tasks.map((task) =>
          task.id === taskId && task.run?.startedAt === startedAt
            ? result.previous
            : task,
        ),
      })).catch(() => undefined);
      throw error;
    }

    return noStoreJson({ task: result.task });
  } catch (error) {
    return taskFailure(error);
  }
}
