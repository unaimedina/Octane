import type { NextRequest } from "next/server";
import { guard, failure, jsonBody, noStoreJson } from "@/lib/bff";
import {
  importTasks,
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
  return failure(error);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await context.params;
    const body = await jsonBody<{ items?: unknown }>(request);
    if (!Array.isArray(body?.items)) {
      return noStoreJson(
        { error: "bad_request", message: "Send an items array." },
        400,
      );
    }
    const result = await importTasks(
      auth.session.subject,
      id,
      body.items as TaskInput[],
    );
    return noStoreJson(result, 201);
  } catch (error) {
    return taskFailure(error);
  }
}
