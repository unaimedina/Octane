import type { NextRequest } from "next/server";
import { guard, failure, noStoreJson } from "@/lib/bff";
import { abortSession } from "@/lib/session-service";
import {
  listTasks,
  mutateTasks,
  TaskConflictError,
  TaskNotFoundError,
  TaskValidationError,
} from "@/lib/tasks";
import type { Task } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; taskId: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id, taskId } = await context.params;
    const subject = auth.session.subject;
    const task = (await listTasks(subject, id)).find((item) => item.id === taskId);
    if (!task) throw new TaskNotFoundError();
    if (task.status !== "in_progress" || !task.run) {
      throw new TaskConflictError("Task is not running.", "not_running");
    }
    const { startedAt, sessionID } = task.run;

    // A worker claim has no session yet (sessionID ""); nothing to abort.
    if (sessionID) await abortSession(sessionID);

    const { result } = await mutateTasks<Task>(subject, id, (tasks) => {
      const now = Date.now();
      let stopped: Task | undefined;
      const next = tasks.map((item) => {
        if (
          item.id !== taskId ||
          item.status !== "in_progress" ||
          item.run?.startedAt !== startedAt
        ) {
          return item;
        }
        stopped = {
          ...item,
          status: "pending",
          run: { ...item.run, endedAt: now, outcome: "aborted" },
          updatedAt: now,
        };
        return stopped;
      });
      return { tasks: next, result: stopped };
    });
    return noStoreJson({ task: result ?? task });
  } catch (error) {
    return taskFailure(error);
  }
}
