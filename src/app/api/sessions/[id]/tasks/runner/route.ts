import type { NextRequest } from "next/server";
import { guard, failure, jsonBody, noStoreJson } from "@/lib/bff";
import { describeError, ensureAutoRun, stopAutoRun } from "@/lib/task-autorun";
import { scheduleTasks } from "@/lib/task-scheduler";
import {
  getRunner,
  listTasks,
  setRunner,
  TaskConflictError,
  TaskNotFoundError,
  TaskValidationError,
  type RunnerPatch,
} from "@/lib/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RunnerBody = {
  autoRun?: unknown;
  maxParallel?: unknown;
  /** Send null to dismiss the stalled message. */
  stalled?: unknown;
  model?: unknown;
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

function parseModel(value: unknown): RunnerPatch["model"] {
  if (value === null) return null;
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return typeof record.providerID === "string" && typeof record.modelID === "string"
    ? { providerID: record.providerID, modelID: record.modelID }
    : undefined;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await context.params;
    return noStoreJson({ runner: await getRunner(auth.session.subject, id) });
  } catch (error) {
    return taskFailure(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await context.params;
    const subject = auth.session.subject;
    const body = await jsonBody<RunnerBody>(request);
    if (!body || typeof body !== "object") {
      return noStoreJson(
        { error: "bad_request", message: "Send runner settings." },
        400,
      );
    }
    if (body.autoRun !== undefined && typeof body.autoRun !== "boolean") {
      throw new TaskValidationError("autoRun must be true or false.");
    }
    if (
      body.maxParallel !== undefined &&
      (typeof body.maxParallel !== "number" || !Number.isFinite(body.maxParallel))
    ) {
      throw new TaskValidationError("maxParallel must be a number from 1 to 4.");
    }

    const patch: RunnerPatch = {};
    if (typeof body.maxParallel === "number") patch.maxParallel = body.maxParallel;
    if (body.stalled === null) patch.stalled = null;
    const model = parseModel(body.model);
    if (model !== undefined) patch.model = model;
    if (body.autoRun === true) {
      patch.autoRun = true;
      patch.stalled = null;
      patch.startedBy = { subject, username: auth.session.username };
    } else if (body.autoRun === false) {
      patch.autoRun = false;
    }

    let runner = await setRunner(subject, id, patch);
    if (body.autoRun === false) stopAutoRun(subject, id);
    if (body.autoRun === true) {
      ensureAutoRun(auth.session, id);
      try {
        const result = await scheduleTasks(subject, id);
        runner = result.runner;
        if (!runner.autoRun) stopAutoRun(subject, id);
        return noStoreJson({ runner, tasks: result.tasks, started: result.started });
      } catch (error) {
        // Auto-run stays on; the ticker retries with its own back-off.
        console.error("[autorun] first pass failed:", error);
        return noStoreJson({
          runner: await getRunner(subject, id),
          tasks: await listTasks(subject, id),
          started: [],
          warning: describeError(error),
        });
      }
    }
    return noStoreJson({ runner, tasks: await listTasks(subject, id) });
  } catch (error) {
    return taskFailure(error);
  }
}
