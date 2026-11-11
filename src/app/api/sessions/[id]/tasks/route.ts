import type { NextRequest } from "next/server";
import { guard, failure, jsonBody, noStoreJson } from "@/lib/bff";
import { reconcileTasks } from "@/lib/task-runner";
import {
  createTask,
  TaskConflictError,
  TaskNotFoundError,
  TaskValidationError,
} from "@/lib/tasks";
import type { TaskInput } from "@/lib/types";

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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await context.params;
    return noStoreJson({ tasks: await reconcileTasks(auth.session.subject, id) });
  } catch (error) {
    return taskFailure(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await context.params;
    const body = await jsonBody<TaskInput>(request);
    if (!body || typeof body !== "object") {
      return noStoreJson(
        { error: "bad_request", message: "Send a task object." },
        400,
      );
    }
    return noStoreJson(
      await createTask(auth.session.subject, id, body),
      201,
    );
  } catch (error) {
    return taskFailure(error);
  }
}
