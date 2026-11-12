import type { NextRequest } from "next/server";
import { guard, failure, jsonBody, noStoreJson } from "@/lib/bff";
import { validateAnswers } from "@/lib/questions";
import { rejectQuestion, replyQuestion } from "@/lib/session-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; requestID: string }> };

export async function POST(request: NextRequest, context: Context) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id, requestID } = await context.params;
    const body = await jsonBody<{ answers?: unknown }>(request);
    const answers = validateAnswers(body?.answers);
    if (!answers) {
      return noStoreJson({ error: "bad_request", message: "Answer every question." }, 400);
    }
    await replyQuestion(id, requestID, answers);
    return noStoreJson({ ok: true });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id, requestID } = await context.params;
    await rejectQuestion(id, requestID);
    return noStoreJson({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
