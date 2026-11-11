import type { NextRequest } from "next/server";
import { guard, failure, jsonBody, noStoreJson } from "@/lib/bff";
import { scheduleTasks } from "@/lib/task-scheduler";
import {
  TaskConflictError,
  TaskNotFoundError,
  TaskValidationError,
} from "@/lib/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ScheduleBody = {
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

/** "Run ready now": one scheduling pass without turning auto-run on. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await context.params;
    const body = (await jsonBody<ScheduleBody>(request)) ?? {};
    const agent =
      typeof body.agent === "string" && body.agent ? body.agent : undefined;
    const model =
      body.model &&
      typeof body.model.providerID === "string" &&
      typeof body.model.modelID === "string"
        ? { providerID: body.model.providerID, modelID: body.model.modelID }
        : undefined;
    return noStoreJson(
      await scheduleTasks(auth.session.subject, id, { agent, model }),
    );
  } catch (error) {
    return taskFailure(error);
  }
}
