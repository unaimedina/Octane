import type { NextRequest } from "next/server";
import { guard, failure, jsonBody, noStoreJson } from "@/lib/bff";
import { addContext } from "@/lib/session-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Add conversation context without triggering a model response. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await context.params;
    const body = await jsonBody<{ text?: string; description?: string }>(request);
    const text = body?.text?.trim();
    if (!text) {
      return noStoreJson(
        { error: "bad_request", message: "context text is required" },
        400,
      );
    }
    await addContext(id, text, body?.description?.trim() || undefined);
    return noStoreJson({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
