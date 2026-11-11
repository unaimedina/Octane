import type { NextRequest } from "next/server";
import { guard, failure, jsonBody, noStoreJson } from "@/lib/bff";
import {
  deleteTask,
  TaskConflictError,
  TaskNotFoundError,
  TaskValidationError,
  updateTask,
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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; taskId: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id, taskId } = await context.params;
    const body = await jsonBody<Partial<TaskInput>>(request);
    if (!body || typeof body !== "object") {
      return noStoreJson(
        { error: "bad_request", message: "Send a task patch." },
        400,
      );
    }
    return noStoreJson(
      await updateTask(auth.session.subject, id, taskId, body),
    );
  } catch (error) {
    return taskFailure(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; taskId: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id, taskId } = await context.params;
    await deleteTask(auth.session.subject, id, taskId);
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return taskFailure(error);
  }
}
