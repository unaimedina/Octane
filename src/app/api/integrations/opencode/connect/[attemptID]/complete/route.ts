import type { NextRequest } from "next/server";
import { guard, failure, jsonBody, noStoreJson } from "@/lib/bff";
import { completeOpenCodeOAuth } from "@/lib/oc-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ attemptID: string }> },
) {
  const auth = await guard(request);
  if (auth.error) return auth.error;
  try {
    const { attemptID } = await context.params;
    const body = await jsonBody<{ code?: string }>(request);
    await completeOpenCodeOAuth(attemptID, body?.code);
    return noStoreJson({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
